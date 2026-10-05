// Genera el ícono, el ícono adaptativo de Android y el splash provisorios
// a partir de un SVG simple (un comprobante con un tilde).
// Uso (desde la raíz): node mobile/scripts/generate-icons.mjs
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// sharp está instalado en el workspace server; se resuelve desde node_modules de la raíz.
const require = createRequire(import.meta.url);
const sharp = require('sharp');

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'assets');
mkdirSync(out, { recursive: true });

const BLUE = '#1F4E79';
const GREEN = '#2E9E5B';

// Comprobante (hoja con esquina doblada, líneas de texto y tilde) en un lienzo de 1024.
// `scale` achica el dibujo para respetar la zona segura del ícono adaptativo.
function receipt(scale = 1) {
  return `
  <g transform="translate(512 512) scale(${scale}) translate(-512 -512)">
    <path d="M292 172h328l112 112v552a24 24 0 0 1-24 24H292a24 24 0 0 1-24-24V196a24 24 0 0 1 24-24z" fill="#FFFFFF"/>
    <path d="M620 172v88a24 24 0 0 0 24 24h88z" fill="#C9D6E3"/>
    <rect x="340" y="340" width="290" height="28" rx="14" fill="#C9D6E3"/>
    <rect x="340" y="410" width="344" height="28" rx="14" fill="#C9D6E3"/>
    <rect x="340" y="480" width="220" height="28" rx="14" fill="#C9D6E3"/>
    <circle cx="560" cy="690" r="120" fill="${GREEN}"/>
    <path d="M500 692l45 46 82-96" fill="none" stroke="#FFFFFF" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
}

const svg = (
  body,
  bg,
) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  ${bg ? `<rect width="1024" height="1024" fill="${bg}"/>` : ''}${body}</svg>`;

async function png(name, markup, size = 1024) {
  await sharp(Buffer.from(markup)).resize(size, size).png().toFile(join(out, name));
  console.log('generado', name);
}

// Ícono de iOS/Android clásico: fondo sólido, sin transparencia.
await png('icon.png', svg(receipt(1), BLUE));
// Ícono adaptativo: primer plano transparente (zona segura ~66%) y fondo aparte.
await png('adaptive-icon.png', svg(receipt(0.62), null));
// Splash: dibujo centrado sobre transparente; el color de fondo lo da app.config.ts.
await png('splash-icon.png', svg(receipt(0.9), null));
// Favicon (web).
await png('favicon.png', svg(receipt(1), BLUE), 48);

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { decodeQr } from '../src/qr/decode.js';
import { parseDgiQr } from '../src/qr/dgi.js';

const dir = resolve(import.meta.dirname, '../../samples');
let files: string[] = [];
try {
  files = readdirSync(dir)
    .filter((f) => /\.jpe?g$/i.test(f))
    .sort();
} catch {
  // handled below
}
if (files.length === 0) {
  console.log(`No hay fotos en ${dir}`);
  process.exit(0);
}
for (const f of files) {
  const t0 = performance.now();
  const raw = await decodeQr(readFileSync(join(dir, f)));
  const ms = Math.round(performance.now() - t0);
  if (raw === null) {
    console.log(`${f}  (${ms} ms)  sin QR`);
    continue;
  }
  const parsed = parseDgiQr(raw);
  console.log(`${f}  (${ms} ms)  isDgi=${parsed.isDgi} partial=${parsed.partial}`);
  console.log(`  raw: ${raw}`);
  console.log(`  data: ${JSON.stringify(parsed.data)}`);
}

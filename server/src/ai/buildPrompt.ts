import { docFamily, type DocType as DocumentType } from '@app/shared';
import type { CatalogField, DocType } from '../catalog.js';
import { BASE_PROMPT } from './basePrompt.js';

export interface QrData {
  rut_emisor?: string;
  tipo_cfe?: string | number;
  serie?: string;
  numero?: string | number;
  total?: string | number;
  fecha_documento?: string;
}

export interface BuildPromptInput {
  company: { nombre: string; rut: string };
  /** Filas de field_catalog. */
  catalog: CatalogField[];
  /** Claves opcionales activas de la empresa. */
  enabledOptional: string[];
  preclassified: DocumentType | null;
  qrData: QrData;
}

export interface BuiltPrompt {
  system: string;
  userText: string;
  requestedKeys: string[];
  itemKeys: string[];
  maxTokens: number;
}

const FORMAT_SECTION =
  'FORMATO\nUn único objeto JSON compacto, sin espacios ni saltos de línea, solo con las claves de CAMPOS A EXTRAER más revisar. Omití las claves sin valor. Si hay productos, van en items como lista de objetos con las claves de producto activas.';

/** Subclave de producto: `fact_item_codigo` → `codigo`, `dev_item_ean` → `ean`. */
function itemSubkey(key: string): string {
  return key.replace(/^(fact|dev)_item_/, '');
}

/** Subcampos base de `items` (devoluciones), tomados de su instrucción: «(subcampos: a, b, c)». */
function baseItemSubkeys(items: CatalogField | undefined): string[] {
  const m = items?.instruction.match(/subcampos:\s*([^)]*)\)/);
  const keys = m?.[1]
    ?.split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  return keys && keys.length > 0 ? keys : ['codigo', 'descripcion', 'cantidad'];
}

function buildUserText(preclassified: DocumentType | null, qr: QrData): string {
  if (preclassified === null) return 'Sin QR de DGI: clasificá el documento';
  const parts: string[] = [];
  if (qr.serie !== undefined && qr.serie !== '') parts.push(`serie ${qr.serie}`);
  if (qr.numero !== undefined && qr.numero !== '') parts.push(`número ${qr.numero}`);
  if (qr.total !== undefined && qr.total !== '') parts.push(`total ${qr.total}`);
  if (qr.fecha_documento) parts.push(`fecha ${qr.fecha_documento}`);
  const head = `Tipo preclasificado por QR: ${preclassified}`;
  return parts.length === 0
    ? head
    : `${head}\nDatos ya leídos del QR, no los extraigas: ${parts.join(', ')}`;
}

export function buildPrompt(input: BuildPromptInput): BuiltPrompt {
  const { company, catalog, preclassified, qrData } = input;
  const family: DocType | null = preclassified ? docFamily(preclassified) : null;
  const optional = new Set(input.enabledOptional);
  const hasQr = preclassified !== null;

  const qrKeys = new Set<string>();
  for (const k of [
    'rut_emisor',
    'tipo_cfe',
    'serie',
    'numero',
    'total',
    'fecha_documento',
  ] as const) {
    if (qrData[k] !== undefined && qrData[k] !== '') qrKeys.add(k);
  }
  if (hasQr && family === 'devolucion' && qrKeys.has('rut_emisor')) qrKeys.add('cliente_rut');

  const selected = catalog.filter((f) => {
    if (f.source === 'qr') return false;
    if (!f.isBase && !optional.has(f.key)) return false;
    if (family !== null && !f.docTypes.includes(family)) return false;
    if (qrKeys.has(f.key)) return false;
    if (f.key === 'tipo_documento' && hasQr) return false;
    return true;
  });

  const itemFields = selected.filter((f) => f.isItemField || /^(fact|dev)_item_/.test(f.key));
  const plain = selected.filter((f) => !itemFields.includes(f));

  // `items`: en devoluciones es base; en facturas solo con algún fact_item_* activo (decisión 9).
  const itemsBase = catalog.find((f) => f.key === 'items');
  const factItems = itemFields.filter((f) => f.key.startsWith('fact_item_'));
  const devItems = itemFields.filter((f) => f.key.startsWith('dev_item_'));
  const baseItemSelected = itemFields.some((f) => f.key === 'items');
  const itemKeys: string[] = [];
  if (baseItemSelected)
    itemKeys.push(...baseItemSubkeys(itemsBase), ...devItems.map((f) => itemSubkey(f.key)));
  itemKeys.push(...factItems.map((f) => itemSubkey(f.key)));
  const uniqueItemKeys = [...new Set(itemKeys)];

  const lines = plain.map((f) => `- ${f.key}: ${f.instruction}`);
  const requestedKeys = plain.map((f) => f.key);
  if (uniqueItemKeys.length > 0) {
    lines.push(
      `- items: lista de productos, una entrada por línea, con las claves: ${uniqueItemKeys.join(', ')}`,
    );
    requestedKeys.push('items');
  }

  const base = BASE_PROMPT.replaceAll('{EMPRESA_NOMBRE}', company.nombre).replaceAll(
    '{EMPRESA_RUT}',
    company.rut,
  );
  const system = `${base}\n\nCAMPOS A EXTRAER\n${lines.join('\n')}\n\n${FORMAT_SECTION}`;

  const estOut = selected.reduce((sum, f) => sum + f.estOutTokens, 0);
  return {
    system,
    userText: buildUserText(preclassified, qrData),
    requestedKeys,
    itemKeys: uniqueItemKeys,
    maxTokens: Math.min(1500, 150 + 2 * estOut),
  };
}

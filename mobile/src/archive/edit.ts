import { ddmmyyyyToIso, isValidRut, normalizeRut, parseUyNumber } from '@app/shared';
import type { PatchScanBody, Role, ScanDto } from '@app/shared';
import { CONFORMIDAD_LABELS } from '../theme';
import { CONFORMIDAD_ORDER } from './filters';

export type DetailScan = ScanDto;

/** Valor original leído de un campo corregido, como texto; null si no hay corrección. */
export function originalText(key: string, f: ScanDto['fields'][string]): string | null {
  return f.corrected ? displayValue(key, f.original) : null;
}

export type FieldKind = 'text' | 'date' | 'number' | 'rut' | 'conformidad' | 'list';

const DATE_KEYS = new Set(['fecha_documento']);
const NUMBER_KEYS = new Set(['total', 'tipo_cfe']);
const RUT_KEYS = new Set(['cliente_rut', 'rut_emisor']);

export function fieldKind(key: string, value?: unknown): FieldKind {
  if (Array.isArray(value) || key === 'items' || key === 'revisar') return 'list';
  if (DATE_KEYS.has(key)) return 'date';
  if (NUMBER_KEYS.has(key)) return 'number';
  if (RUT_KEYS.has(key)) return 'rut';
  if (key === 'conformidad_nivel') return 'conformidad';
  return 'text';
}

/** Solo el administrador puede eliminar (el servidor también lo exige). */
export function canDelete(role: Role | null | undefined): boolean {
  return role === 'admin';
}

/** Texto para mostrar un valor de campo. */
export function displayValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (key === 'conformidad_nivel' && typeof value === 'string') {
    const label = (CONFORMIDAD_LABELS as Record<string, string>)[value];
    return label ?? value;
  }
  if (key === 'fecha_documento' && typeof value === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  if (typeof value === 'number') {
    return value.toLocaleString('es-UY', { maximumFractionDigits: 2 });
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Texto inicial del editor para el valor vigente. */
export function editorText(key: string, value: unknown): string {
  if (value === null || value === undefined) return '';
  if (key === 'fecha_documento' && typeof value === 'string') return displayValue(key, value);
  if (key === 'conformidad_nivel' && typeof value === 'string') return value;
  if (typeof value === 'number') return String(value).replace('.', ',');
  return String(value);
}

export type ParseResult =
  { ok: true; value: string | number | null } | { ok: false; error: string };

/**
 * Valida lo que escribió la persona. Vacío -> `null` (borra la corrección).
 * Fecha DD/MM/AAAA (o AAAA-MM-DD), número en formato uruguayo, RUT con dígito verificador.
 */
export function parseFieldInput(key: string, raw: string): ParseResult {
  const text = raw.trim();
  if (text === '') return { ok: true, value: null };
  switch (fieldKind(key)) {
    case 'date': {
      const iso = /^\d{4}-\d{2}-\d{2}$/.test(text)
        ? ddmmyyyyToIso(toDmy(text))
        : ddmmyyyyToIso(text);
      return iso
        ? { ok: true, value: iso }
        : { ok: false, error: 'Fecha inválida. Usá DD/MM/AAAA' };
    }
    case 'number': {
      const n = parseUyNumber(text);
      return n === null ? { ok: false, error: 'Número inválido' } : { ok: true, value: n };
    }
    case 'rut': {
      const rut = normalizeRut(text);
      return isValidRut(rut) ? { ok: true, value: rut } : { ok: false, error: 'RUT inválido' };
    }
    case 'conformidad': {
      const lower = text.toLowerCase();
      const hit = CONFORMIDAD_ORDER.find(
        (c) => c === lower || CONFORMIDAD_LABELS[c].toLowerCase() === lower,
      );
      return hit
        ? { ok: true, value: hit }
        : {
            ok: false,
            error:
              'Elegí un nivel: ' +
              CONFORMIDAD_ORDER.map((c) => CONFORMIDAD_LABELS[c]).join(', ') +
              '',
          };
    }
    default:
      return { ok: true, value: text };
  }
}

function toDmy(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${Number(d)}/${Number(m)}/${y}`;
}

/** Cuerpo del PATCH para corregir un campo; si el texto es vacío, `null` borra la corrección. */
export function buildCorrectionPatch(
  key: string,
  raw: string,
): { ok: true; body: PatchScanBody } | { ok: false; error: string } {
  const parsed = parseFieldInput(key, raw);
  if (!parsed.ok) return parsed;
  return { ok: true, body: { corrections: { [key]: parsed.value } } };
}

/** Cuerpo del PATCH para borrar la corrección de un campo (vuelve al valor leído). */
export function buildClearCorrectionPatch(key: string): PatchScanBody {
  return { corrections: { [key]: null } };
}

export function buildReviewedPatch(reviewed: boolean): PatchScanBody {
  return { reviewed };
}

export interface ItemsTable {
  columns: string[];
  rows: string[][];
}

const ITEM_COLUMN_ORDER = [
  'codigo',
  'ean',
  'descripcion',
  'cantidad',
  'precio_unitario',
  'importe',
];
export const ITEM_COLUMN_LABELS: Record<string, string> = {
  codigo: 'Código',
  ean: 'EAN',
  descripcion: 'Descripción',
  cantidad: 'Cant.',
  precio_unitario: 'Precio',
  importe: 'Importe',
};

/** Arma una tabla simple con las claves que aparezcan en los productos. */
export function itemsTable(value: unknown): ItemsTable | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const objs = value.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object');
  if (objs.length === 0) return null;
  const present = new Set(objs.flatMap((o) => Object.keys(o)));
  const columns = [
    ...ITEM_COLUMN_ORDER.filter((k) => present.has(k)),
    ...[...present].filter((k) => !ITEM_COLUMN_ORDER.includes(k)),
  ];
  const rows = objs.map((o) => columns.map((c) => displayValue(c, o[c])));
  return { columns, rows };
}

/** Claves ordenadas: primero las del catálogo (en su orden), después el resto. */
export function orderFieldKeys(keys: string[], catalogOrder: string[]): string[] {
  const idx = (k: string) => {
    const i = catalogOrder.indexOf(k);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...keys].sort((a, b) => idx(a) - idx(b));
}

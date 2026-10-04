import { ddmmyyyyToIso, isValidRut, normalizeRut, parseUyNumber } from '@app/shared';
import type { DocType } from '@app/shared';
import type { QrData } from './buildPrompt.js';
import type { ExtractedData, ExtractedItem, ReviewEntry, Scalar } from './parse.js';

export interface ValidateContext {
  qrData: QrData;
  companyRut: string;
  preclassified: DocType | null;
  requestedKeys: string[];
}

export interface ValidateOutput {
  result: ExtractedData;
  issues: ReviewEntry[];
  mustEscalate: boolean;
}

const NUMERIC_KEYS = new Set([
  'total',
  'subtotal',
  'iva',
  'descuento_pct',
  'descuento_monto',
  'dev_plazo_retiro_dias',
]);
const NUMERIC_ITEM_KEYS = new Set(['cantidad', 'precio_unitario', 'importe']);
const DATE_KEYS = new Set(['fecha_documento', 'fecha_vencimiento', 'sello_fecha']);
const RUT_KEYS = ['rut_emisor', 'cliente_rut'] as const;
const QR_KEYS = ['rut_emisor', 'tipo_cfe', 'serie', 'numero', 'total', 'fecha_documento'] as const;
const TOLERANCE = 0.05;

/** Normaliza un valor según su clave: números en formato uruguayo, fechas ISO, RUT sin puntos. */
function normalizeValue(key: string, value: Scalar, numericKeys: Set<string>): Scalar | null {
  if (typeof value !== 'string') return value;
  if (numericKeys.has(key)) return parseUyNumber(value);
  if (DATE_KEYS.has(key)) return ddmmyyyyToIso(value) ?? value.trim();
  if ((RUT_KEYS as readonly string[]).includes(key)) return normalizeRut(value);
  return value;
}

function sameValue(key: string, a: Scalar, b: Scalar): boolean {
  if (key === 'total') {
    const x = typeof a === 'number' ? a : parseUyNumber(String(a));
    const y = typeof b === 'number' ? b : parseUyNumber(String(b));
    return x !== null && y !== null && Math.abs(x - y) < 0.005;
  }
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/**
 * Validaciones de spec 9.1. `mustEscalate` es true si hay RUT inválido, discrepancia con el QR,
 * `revisar` informado por la IA o conformidad dudosa. La aritmética y las cantidades solo
 * agregan a `revisar`, sin escalar.
 */
export function validate(input: ExtractedData, ctx: ValidateContext): ValidateOutput {
  const result: ExtractedData = { ...input, revisar: [...input.revisar] };
  const issues: ReviewEntry[] = [];
  let escalate = result.revisar.length > 0 || result.conformidad_nivel === 'dudosa';

  const addIssue = (campo: string, motivo: string, escalates: boolean) => {
    issues.push({ campo, motivo });
    if (!result.revisar.some((r) => r.campo === campo && r.motivo === motivo)) {
      result.revisar.push({ campo, motivo });
    }
    if (escalates) escalate = true;
  };

  // Normalizar números (también en productos) y fechas.
  const numericKeys = NUMERIC_KEYS;
  for (const key of Object.keys(result)) {
    const v = result[key];
    if (key === 'items' || key === 'revisar' || v === undefined || Array.isArray(v)) continue;
    const n = normalizeValue(key, v as Scalar, numericKeys);
    if (n === null) {
      delete result[key];
      addIssue(key, 'No se pudo interpretar el número', false);
    } else result[key] = n;
  }
  if (result.items) {
    result.items = result.items.map((item, i) => {
      const out: ExtractedItem = {};
      for (const [k, v] of Object.entries(item)) {
        const n = normalizeValue(k, v, NUMERIC_ITEM_KEYS);
        if (n === null) addIssue(`items[${i}].${k}`, 'No se pudo interpretar el número', false);
        else out[k] = n;
      }
      return out;
    });
  }

  // QR contra imagen: gana el QR.
  const { qrData } = ctx;
  for (const key of QR_KEYS) {
    const raw = qrData[key];
    if (raw === undefined || raw === '') continue;
    const qrValue = normalizeValue(key, raw, new Set(['total'])) ?? raw;
    const aiValue = result[key];
    if (
      aiValue !== undefined &&
      !Array.isArray(aiValue) &&
      !sameValue(key, aiValue as Scalar, qrValue)
    ) {
      addIssue(
        key,
        `La imagen dice «${String(aiValue)}» y el QR «${String(qrValue)}»; se usó el QR`,
        true,
      );
    }
    result[key] = qrValue;
  }
  // En devoluciones con QR, el emisor del QR es el cliente.
  if (ctx.preclassified === 'devolucion_cliente' && result.rut_emisor !== undefined) {
    result.cliente_rut = result.rut_emisor;
  }

  // Tipo contra QR.
  if (ctx.preclassified !== null) result.tipo_documento = ctx.preclassified;

  // RUT: dígito verificador.
  for (const key of RUT_KEYS) {
    const v = result[key];
    if (typeof v === 'string' && !isValidRut(v)) {
      addIssue(key, 'El RUT no pasa el dígito verificador', true);
    }
  }

  // Cantidades positivas.
  result.items?.forEach((item, i) => {
    const q = item.cantidad;
    if (q !== undefined && !(typeof q === 'number' && q > 0)) {
      addIssue(`items[${i}].cantidad`, 'La cantidad no es un número positivo', false);
    }
  });

  // Aritmética: solo si están todos los importes. Sin descuento impreso se toma 0.
  const items = result.items;
  const subtotal = num(result.subtotal);
  const iva = num(result.iva);
  const total = num(result.total);
  if (
    items &&
    items.length > 0 &&
    subtotal !== undefined &&
    iva !== undefined &&
    total !== undefined &&
    items.every((it) => num(it.importe) !== undefined)
  ) {
    const sum = items.reduce((acc, it) => acc + (it.importe as number), 0);
    const discount = num(result.descuento_monto) ?? 0;
    if (Math.abs(sum - discount - subtotal) > TOLERANCE) {
      addIssue('subtotal', 'La suma de los importes menos el descuento no da el subtotal', false);
    }
    if (Math.abs(subtotal + iva - total) > TOLERANCE) {
      addIssue('total', 'El subtotal más el IVA no da el total', false);
    }
  }

  return { result, issues, mustEscalate: escalate };
}

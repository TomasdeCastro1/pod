import { pricePer1000, type FieldGroup, type FieldView } from '@app/shared';

/** Lógica pura de «Campos a leer», «Uso y precio» y formatos. */

/** Claves de los campos opcionales encendidos. */
export function enabledOptionalKeys(groups: FieldGroup[]): Set<string> {
  const keys = new Set<string>();
  for (const g of groups) for (const f of g.fields) if (!f.is_base && f.enabled) keys.add(f.key);
  return keys;
}

/** Precio por 1.000 con los campos opcionales elegidos (se recalcula en el celular). */
export function livePrice(base: number, groups: FieldGroup[], enabled: Set<string>): number {
  const prices: number[] = [];
  for (const g of groups) {
    for (const f of g.fields) if (!f.is_base && enabled.has(f.key)) prices.push(f.price);
  }
  return pricePer1000(base, prices);
}

export function toggleKey(enabled: Set<string>, key: string): Set<string> {
  const next = new Set(enabled);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

export function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const k of a) if (!b.has(k)) return false;
  return true;
}

/** Cuerpo de PUT /fields: solo opcionales, orden estable. */
export function toSaveBody(enabled: Set<string>): string[] {
  return [...enabled].sort();
}

export function docTypesLabel(docTypes: string[]): string {
  const f = docTypes.includes('factura');
  const d = docTypes.includes('devolucion');
  if (f && d) return 'Todos';
  if (f) return 'Facturas';
  if (d) return 'Devoluciones';
  return 'Todos';
}

export type FieldMode = 'locked' | 'editable' | 'readonly';

/** Cómo se muestra un campo: base bloqueado; opcional editable solo para admin. */
export function fieldMode(field: FieldView, canEdit: boolean): FieldMode {
  if (field.is_base) return 'locked';
  return canEdit ? 'editable' : 'readonly';
}

const usd = new Intl.NumberFormat('es-UY', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const usdFixed = new Intl.NumberFormat('es-UY', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** «USD 45» / «USD 37,50»: coma decimal (es-UY), sin decimales si son cero. */
export function formatUsd(value: number): string {
  return `USD ${usd.format(value)}`;
}

/** Importes de dinero siempre con dos decimales: «USD 37,00». */
export function formatAmount(value: number): string {
  return `USD ${usdFixed.format(value)}`;
}

export function formatPricePer1000(value: number): string {
  return `${formatUsd(value)} por 1.000 imágenes`;
}

export function formatOptionalPrice(price: number): string {
  return `+${formatUsd(price)} / 1.000`;
}

export function formatImages(n: number): string {
  return new Intl.NumberFormat('es-UY').format(n);
}

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** «2026-10» → «octubre 2026». */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-');
  const name = MONTHS[Number(m) - 1];
  return name && y ? `${name} ${y}` : month;
}

/** Ancho (0 a 1) de cada barra del historial, respecto del mayor importe. */
export function barRatios(history: { amount_usd: number; images: number }[]): number[] {
  const max = Math.max(0, ...history.map((h) => h.amount_usd));
  if (max > 0) return history.map((h) => h.amount_usd / max);
  const maxImages = Math.max(0, ...history.map((h) => h.images));
  return history.map((h) => (maxImages > 0 ? h.images / maxImages : 0));
}

import type { Conformidad, ScanListQuery } from '@app/shared';
import { CONFORMIDAD_LABELS } from '../theme';

export type DocTypeFilter = NonNullable<ScanListQuery['type']>;

/** Estado de búsqueda y filtros de la lista del Archivo (también lo usa la exportación a CSV). */
export interface ArchiveFilters {
  q: string;
  type: DocTypeFilter | null;
  conformidad: Conformidad[];
  revisar: boolean;
  /** AAAA-MM-DD */
  from: string | null;
  to: string | null;
}

export const EMPTY_FILTERS: ArchiveFilters = {
  q: '',
  type: null,
  conformidad: [],
  revisar: false,
  from: null,
  to: null,
};

export const TYPE_LABELS: Record<DocTypeFilter, string> = {
  factura: 'Factura',
  devolucion: 'Devolución',
  otro: 'Otro',
};

export const CONFORMIDAD_ORDER: Conformidad[] = ['completa', 'firma_sola', 'dudosa', 'sin_firma'];

/** Convierte los filtros en los parámetros de GET /companies/:id/scans (omite lo vacío). */
export function filtersToQuery(f: ArchiveFilters): ScanListQuery {
  const query: ScanListQuery = {};
  const q = f.q.trim();
  if (q) query.q = q;
  if (f.type) query.type = f.type;
  if (f.conformidad.length > 0) query.conformidad = [...f.conformidad];
  if (f.revisar) query.revisar = true;
  if (f.from) query.from = f.from;
  if (f.to) query.to = f.to;
  return query;
}

export type FilterKey = 'type' | 'conformidad' | 'revisar' | 'dates';

export interface FilterChip {
  key: FilterKey;
  label: string;
}

/** «2026-09-24» -> «24/09/2026». */
export function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Chips de los filtros activos (sin la búsqueda de texto, que se ve en el buscador). */
export function activeChips(f: ArchiveFilters): FilterChip[] {
  const chips: FilterChip[] = [];
  if (f.type) chips.push({ key: 'type', label: TYPE_LABELS[f.type] });
  if (f.conformidad.length > 0) {
    chips.push({
      key: 'conformidad',
      label: CONFORMIDAD_ORDER.filter((c) => f.conformidad.includes(c))
        .map((c) => CONFORMIDAD_LABELS[c])
        .join(', '),
    });
  }
  if (f.revisar) chips.push({ key: 'revisar', label: 'A revisar' });
  if (f.from || f.to) {
    const label =
      f.from && f.to
        ? `${formatIsoDate(f.from)} – ${formatIsoDate(f.to)}`
        : f.from
          ? `Desde ${formatIsoDate(f.from)}`
          : `Hasta ${formatIsoDate(f.to!)}`;
    chips.push({ key: 'dates', label });
  }
  return chips;
}

export function removeFilter(f: ArchiveFilters, key: FilterKey): ArchiveFilters {
  switch (key) {
    case 'type':
      return { ...f, type: null };
    case 'conformidad':
      return { ...f, conformidad: [] };
    case 'revisar':
      return { ...f, revisar: false };
    case 'dates':
      return { ...f, from: null, to: null };
  }
}

/** Limpia los filtros pero conserva el texto buscado. */
export function clearFilters(f: ArchiveFilters): ArchiveFilters {
  return { ...EMPTY_FILTERS, q: f.q };
}

/** ¿Hay búsqueda o algún filtro? (decide entre los dos estados vacíos). */
export function hasAnyFilter(f: ArchiveFilters): boolean {
  return f.q.trim() !== '' || activeChips(f).length > 0;
}

/** Date local -> AAAA-MM-DD. */
export function toIsoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** AAAA-MM-DD -> Date local al mediodía (evita saltos por zona horaria). */
export function fromIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1, 12);
}

/** El rango no puede quedar invertido: si desde > hasta se ajusta el otro extremo. */
export function setDateRange(
  f: ArchiveFilters,
  which: 'from' | 'to',
  iso: string | null,
): ArchiveFilters {
  const next = { ...f, [which]: iso };
  if (next.from && next.to && next.from > next.to) {
    if (which === 'from') next.to = next.from;
    else next.from = next.to;
  }
  return next;
}

/** Hay escaneos todavía procesándose: la lista se refresca sola. */
export function hasProcessing(items: Array<{ status: string }>): boolean {
  return items.some((i) => i.status === 'procesando');
}

import { beforeEach, describe, expect, it } from 'vitest';
import {
  EMPTY_FILTERS,
  activeChips,
  clearFilters,
  filtersToQuery,
  fromIsoDate,
  hasAnyFilter,
  hasProcessing,
  removeFilter,
  setDateRange,
  toIsoDate,
} from './filters';
import { getArchiveFilters, setArchiveFilters, updateArchiveFilters } from './store';

describe('filtersToQuery', () => {
  it('sin filtros no manda parámetros', () => {
    expect(filtersToQuery(EMPTY_FILTERS)).toEqual({});
  });

  it('convierte cada filtro y recorta el texto', () => {
    expect(
      filtersToQuery({
        q: '  devoto ',
        type: 'devolucion',
        conformidad: ['dudosa', 'sin_firma'],
        revisar: true,
        from: '2026-09-01',
        to: '2026-09-30',
      }),
    ).toEqual({
      q: 'devoto',
      type: 'devolucion',
      conformidad: ['dudosa', 'sin_firma'],
      revisar: true,
      from: '2026-09-01',
      to: '2026-09-30',
    });
  });

  it('ignora texto en blanco, conformidad vacía y revisar apagado', () => {
    expect(filtersToQuery({ ...EMPTY_FILTERS, q: '   ', revisar: false })).toEqual({});
  });
});

describe('chips', () => {
  it('uno por filtro activo, con el rango de fechas en un solo chip', () => {
    const f = {
      ...EMPTY_FILTERS,
      type: 'factura' as const,
      conformidad: ['sin_firma' as const, 'completa' as const],
      revisar: true,
      from: '2026-09-01',
      to: '2026-09-30',
    };
    const chips = activeChips(f);
    expect(chips.map((c) => c.key)).toEqual(['type', 'conformidad', 'revisar', 'dates']);
    expect(chips[0]?.label).toBe('Factura');
    expect(chips[3]?.label).toBe('01/09/2026 – 30/09/2026');
  });

  it('fechas abiertas y quitar un chip', () => {
    expect(activeChips({ ...EMPTY_FILTERS, from: '2026-09-01' })[0]?.label).toBe(
      'Desde 01/09/2026',
    );
    expect(activeChips({ ...EMPTY_FILTERS, to: '2026-09-01' })[0]?.label).toBe('Hasta 01/09/2026');
    const f = { ...EMPTY_FILTERS, from: '2026-09-01', to: '2026-09-02', revisar: true };
    expect(removeFilter(f, 'dates')).toMatchObject({ from: null, to: null, revisar: true });
  });

  it('limpiar conserva la búsqueda; hasAnyFilter considera el texto', () => {
    const f = { ...EMPTY_FILTERS, q: 'abc', revisar: true };
    expect(clearFilters(f)).toEqual({ ...EMPTY_FILTERS, q: 'abc' });
    expect(hasAnyFilter(EMPTY_FILTERS)).toBe(false);
    expect(hasAnyFilter({ ...EMPTY_FILTERS, q: 'abc' })).toBe(true);
  });
});

describe('fechas', () => {
  it('ida y vuelta AAAA-MM-DD', () => {
    expect(toIsoDate(fromIsoDate('2026-01-05'))).toBe('2026-01-05');
  });

  it('el rango no queda invertido', () => {
    const f = { ...EMPTY_FILTERS, from: '2026-09-10', to: '2026-09-20' };
    expect(setDateRange(f, 'from', '2026-09-25')).toMatchObject({
      from: '2026-09-25',
      to: '2026-09-25',
    });
    expect(setDateRange(f, 'to', '2026-09-01')).toMatchObject({
      from: '2026-09-01',
      to: '2026-09-01',
    });
  });
});

describe('hasProcessing', () => {
  it('detecta escaneos procesando', () => {
    expect(hasProcessing([{ status: 'listo' }, { status: 'procesando' }])).toBe(true);
    expect(hasProcessing([{ status: 'listo' }])).toBe(false);
  });
});

describe('store de filtros', () => {
  beforeEach(() => setArchiveFilters(EMPTY_FILTERS));

  it('guarda y actualiza el estado compartido', () => {
    updateArchiveFilters((f) => ({ ...f, revisar: true }));
    expect(getArchiveFilters().revisar).toBe(true);
  });
});

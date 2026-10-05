import { describe, expect, it } from 'vitest';
import type { FieldGroup } from '@app/shared';
import {
  barRatios,
  docTypesLabel,
  enabledOptionalKeys,
  fieldMode,
  formatAmount,
  formatOptionalPrice,
  formatPricePer1000,
  livePrice,
  monthLabel,
  sameSet,
  toSaveBody,
  toggleKey,
} from './fields';

const f = (key: string, price: number, enabled: boolean, is_base = false) => ({
  key,
  label: key,
  doc_types: ['factura'],
  is_base,
  enabled,
  price,
});
const groups: FieldGroup[] = [
  { name: 'Incluido', fields: [f('total', 0, true, true)] },
  {
    name: 'Pago',
    fields: [f('vencimiento', 2, true), f('orden_compra', 1, false), f('plazo', 2, true)],
  },
];

describe('precio en vivo', () => {
  it('parte de los campos activos del servidor', () => {
    const on = enabledOptionalKeys(groups);
    expect([...on].sort()).toEqual(['plazo', 'vencimiento']);
    expect(livePrice(40, groups, on)).toBe(44);
  });
  it('recalcula al prender y apagar (ejemplo de la especificación: 45)', () => {
    let on = enabledOptionalKeys(groups);
    on = toggleKey(on, 'orden_compra');
    expect(livePrice(40, groups, on)).toBe(45);
    on = toggleKey(toggleKey(on, 'vencimiento'), 'plazo');
    expect(livePrice(40, groups, on)).toBe(41);
  });
  it('ignora claves base o desconocidas', () => {
    expect(livePrice(40, groups, new Set(['total', 'nope']))).toBe(40);
  });
  it('detecta cambios y arma el cuerpo', () => {
    const a = enabledOptionalKeys(groups);
    const b = toggleKey(a, 'orden_compra');
    expect(sameSet(a, a)).toBe(true);
    expect(sameSet(a, b)).toBe(false);
    expect(sameSet(toggleKey(b, 'orden_compra'), a)).toBe(true);
    expect(toSaveBody(b)).toEqual(['orden_compra', 'plazo', 'vencimiento']);
  });
});

describe('modo solo lectura', () => {
  it('base bloqueado siempre; opcional editable solo para admin', () => {
    expect(fieldMode(f('total', 0, true, true), true)).toBe('locked');
    expect(fieldMode(f('total', 0, true, true), false)).toBe('locked');
    expect(fieldMode(f('x', 1, false), true)).toBe('editable');
    expect(fieldMode(f('x', 1, false), false)).toBe('readonly');
  });
});

describe('formatos', () => {
  it('USD con coma decimal', () => {
    expect(formatPricePer1000(45)).toBe('USD 45 por 1.000 imágenes');
    expect(formatPricePer1000(42.5)).toBe('USD 42,5 por 1.000 imágenes');
    expect(formatAmount(37)).toBe('USD 37,00');
    expect(formatAmount(1234.5)).toMatch(/^USD 1\.234,50$/);
    expect(formatOptionalPrice(2)).toBe('+USD 2 / 1.000');
  });
  it('etiquetas', () => {
    expect(docTypesLabel(['factura', 'devolucion'])).toBe('Todos');
    expect(docTypesLabel(['factura'])).toBe('Facturas');
    expect(docTypesLabel(['devolucion'])).toBe('Devoluciones');
    expect(monthLabel('2026-10')).toBe('octubre 2026');
  });
  it('barras relativas', () => {
    expect(
      barRatios([
        { amount_usd: 10, images: 1 },
        { amount_usd: 5, images: 1 },
      ]),
    ).toEqual([1, 0.5]);
    expect(barRatios([{ amount_usd: 0, images: 0 }])).toEqual([0]);
  });
});

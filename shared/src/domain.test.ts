import { describe, expect, it } from 'vitest';
import {
  CFE_TYPES,
  cfeName,
  classifyFromQr,
  ddmmyyyyToIso,
  docFamily,
  isValidRut,
  monthlyAmount,
  normalizeRut,
  parseRemitoQuantity,
  parseUyNumber,
  pricePer1000,
} from './index.js';

describe('rut', () => {
  it.each(['219419590017', '216981070018', '214214350013', '210650500016'])('valid %s', (r) => {
    expect(isValidRut(r)).toBe(true);
  });
  it('rejects changed check digit', () => {
    expect(isValidRut('219419590018')).toBe(false);
  });
  it('rejects wrong length and letters', () => {
    expect(isValidRut('21941959001')).toBe(false);
    expect(isValidRut('2194195900170')).toBe(false);
    expect(isValidRut('21941959001A')).toBe(false);
    expect(isValidRut('')).toBe(false);
  });
  it('rejects when check digit computes to 10', () => {
    for (let d = 0; d <= 9; d++) expect(isValidRut(`00000000006${d}`)).toBe(false);
  });
  it('normalizes', () => {
    expect(normalizeRut('21.941959-0017 ')).toBe('219419590017');
  });
});

describe('numbers', () => {
  it.each([
    ['1.416,32', 1416.32],
    ['1416.32', 1416.32],
    ['$ 1.727,91', 1727.91],
    ['-1.416,32', -1416.32],
    ['0,5', 0.5],
    ['1.234.567,89', 1234567.89],
    ['1.416', 1416],
    ['42', 42],
  ])('parseUyNumber(%s)', (i, o) => {
    expect(parseUyNumber(i)).toBe(o);
  });
  it('returns null for garbage', () => {
    expect(parseUyNumber('abc')).toBeNull();
    expect(parseUyNumber('')).toBeNull();
    expect(parseUyNumber('1,2,3')).toBeNull();
  });
  it('parses remito quantities', () => {
    expect(parseRemitoQuantity('3,000')).toBe(3);
    expect(parseRemitoQuantity('2,500')).toBe(2.5);
    expect(parseRemitoQuantity('12')).toBe(12);
    expect(parseRemitoQuantity('x')).toBeNull();
  });
});

describe('dates', () => {
  it('converts', () => {
    expect(ddmmyyyyToIso('24/09/2026')).toBe('2026-09-24');
    expect(ddmmyyyyToIso('2/10/2026')).toBe('2026-10-02');
    expect(ddmmyyyyToIso('29/02/2028')).toBe('2028-02-29');
  });
  it('rejects invalid', () => {
    expect(ddmmyyyyToIso('31/02/2026')).toBeNull();
    expect(ddmmyyyyToIso('29/02/2027')).toBeNull();
    expect(ddmmyyyyToIso('2026-09-24')).toBeNull();
    expect(ddmmyyyyToIso('00/01/2026')).toBeNull();
    expect(ddmmyyyyToIso('')).toBeNull();
  });
});

describe('documents', () => {
  it('names CFE types', () => {
    expect(Object.keys(CFE_TYPES)).toHaveLength(8);
    expect(cfeName(111)).toBe('e-Factura');
    expect(cfeName('181')).toBe('e-Remito');
    expect(cfeName(999)).toBe('otro CFE');
    expect(cfeName('toString')).toBe('otro CFE');
  });
  it('family', () => {
    expect(docFamily('factura_emitida')).toBe('factura');
    expect(docFamily('nota_credito_emitida')).toBe('factura');
    expect(docFamily('devolucion_cliente')).toBe('devolucion');
    expect(docFamily('otro')).toBeNull();
    expect(docFamily('no_reconocido')).toBeNull();
  });
  it('classifies from QR', () => {
    const co = '219419590017';
    expect(classifyFromQr(co, co, 111)).toBe('factura_emitida');
    expect(classifyFromQr(co, co, 101)).toBe('factura_emitida');
    expect(classifyFromQr(co, co, 102)).toBe('nota_credito_emitida');
    expect(classifyFromQr(co, co, 112)).toBe('nota_credito_emitida');
    expect(classifyFromQr(co, co, 103)).toBe('factura_emitida');
    expect(classifyFromQr(co, co, 113)).toBe('factura_emitida');
    expect(classifyFromQr('214214350013', co, 181)).toBe('devolucion_cliente');
  });
});

describe('pricing', () => {
  it('price per 1000', () => {
    expect(pricePer1000(40, [2, 1, 2])).toBe(45);
    expect(pricePer1000(40, [])).toBe(40);
  });
  it('monthly amount', () => {
    expect(monthlyAmount([])).toBe(0);
    expect(monthlyAmount(Array(830).fill(45))).toBe(37.35);
    expect(monthlyAmount([40.5, 40.5, 0.1])).toBe(0.08);
  });
});

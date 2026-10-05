import { describe, expect, it } from 'vitest';
import {
  buildClearCorrectionPatch,
  buildCorrectionPatch,
  buildReviewedPatch,
  canDelete,
  displayValue,
  editorText,
  itemsTable,
  orderFieldKeys,
  parseFieldInput,
} from './edit';

describe('armado del PATCH', () => {
  it('corrige un campo de texto recortando espacios', () => {
    expect(buildCorrectionPatch('cliente_nombre', '  Devoto SA ')).toEqual({
      ok: true,
      body: { corrections: { cliente_nombre: 'Devoto SA' } },
    });
  });

  it('un valor vacío borra la corrección (null)', () => {
    expect(buildCorrectionPatch('cliente_nombre', '   ')).toEqual({
      ok: true,
      body: { corrections: { cliente_nombre: null } },
    });
    expect(buildClearCorrectionPatch('total')).toEqual({ corrections: { total: null } });
  });

  it('el revisado va solo, sin correcciones', () => {
    expect(buildReviewedPatch(true)).toEqual({ reviewed: true });
    expect(buildReviewedPatch(false)).toEqual({ reviewed: false });
  });
});

describe('validación por tipo', () => {
  it('fecha: DD/MM/AAAA o ISO -> ISO; rechaza fechas inexistentes', () => {
    expect(parseFieldInput('fecha_documento', '24/09/2026')).toEqual({
      ok: true,
      value: '2026-09-24',
    });
    expect(parseFieldInput('fecha_documento', '2026-09-24')).toEqual({
      ok: true,
      value: '2026-09-24',
    });
    expect(parseFieldInput('fecha_documento', '31/02/2026').ok).toBe(false);
  });

  it('número uruguayo', () => {
    expect(parseFieldInput('total', '1.416,32')).toEqual({ ok: true, value: 1416.32 });
    expect(parseFieldInput('total', 'abc').ok).toBe(false);
  });

  it('RUT con dígito verificador', () => {
    expect(parseFieldInput('cliente_rut', '219419590017')).toEqual({
      ok: true,
      value: '219419590017',
    });
    expect(parseFieldInput('cliente_rut', '219419590018').ok).toBe(false);
  });

  it('conformidad acepta clave o etiqueta', () => {
    expect(parseFieldInput('conformidad_nivel', 'dudosa')).toEqual({ ok: true, value: 'dudosa' });
    expect(parseFieldInput('conformidad_nivel', 'Sin firma')).toEqual({
      ok: true,
      value: 'sin_firma',
    });
    expect(parseFieldInput('conformidad_nivel', 'mala').ok).toBe(false);
  });

  it('un error de validación no genera PATCH', () => {
    expect(buildCorrectionPatch('cliente_rut', '123').ok).toBe(false);
  });
});

describe('visibilidad por rol', () => {
  it('solo admin elimina', () => {
    expect(canDelete('admin')).toBe(true);
    expect(canDelete('miembro')).toBe(false);
    expect(canDelete(null)).toBe(false);
  });
});

describe('presentación', () => {
  it('formatea valores', () => {
    expect(displayValue('fecha_documento', '2026-09-24')).toBe('24/09/2026');
    expect(displayValue('conformidad_nivel', 'firma_sola')).toBe('Solo firma');
    expect(displayValue('local', null)).toBe('—');
    expect(editorText('fecha_documento', '2026-09-24')).toBe('24/09/2026');
    expect(editorText('total', 12.5)).toBe('12,5');
  });

  it('tabla de productos con columnas ordenadas', () => {
    const t = itemsTable([
      { cantidad: 4, descripcion: 'Café', codigo: 'A1' },
      { codigo: 'B2', cantidad: 2, extra: 'x' },
    ]);
    expect(t?.columns).toEqual(['codigo', 'descripcion', 'cantidad', 'extra']);
    expect(t?.rows[1]).toEqual(['B2', '—', '2', 'x']);
    expect(itemsTable([])).toBeNull();
  });

  it('ordena claves según el catálogo', () => {
    expect(orderFieldKeys(['zeta', 'total', 'numero'], ['numero', 'total'])).toEqual([
      'numero',
      'total',
      'zeta',
    ]);
  });
});

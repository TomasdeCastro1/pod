import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CatalogField } from '../catalog.js';
import { FIELD_CATALOG_SEED } from '../db/seed/fieldCatalog.js';
import { BASE_PROMPT } from './basePrompt.js';
import { buildPrompt } from './buildPrompt.js';

const catalog = FIELD_CATALOG_SEED.map((r): CatalogField => ({
  ...(r as CatalogField),
  isItemField: r.isItemField ?? false,
  active: true,
}));
const company = { nombre: 'Puntos Ano SRL', rut: '210000000012' };
const factOptional = catalog
  .filter((f) => !f.isBase && f.docTypes.length === 1 && f.docTypes[0] === 'factura')
  .map((f) => f.key);

describe('BASE_PROMPT', () => {
  it('es idéntico al bloque de §8.1 de la especificación', () => {
    const spec = readFileSync(new URL('../../../docs/especificacion.md', import.meta.url), 'utf8');
    const sec = spec.slice(spec.indexOf('### 8.1'));
    const block = /```\n([\s\S]*?)\n```/.exec(sec)?.[1];
    expect(BASE_PROMPT).toBe(block);
  });
});

const fields = (s: string) => s.slice(s.indexOf('CAMPOS A EXTRAER'));

describe('buildPrompt', () => {
  it('factura con QR, solo campos base', () => {
    const r = buildPrompt({
      company,
      catalog,
      enabledOptional: [],
      preclassified: 'factura_emitida',
      qrData: {
        rut_emisor: '210000000012',
        tipo_cfe: 111,
        serie: 'A',
        numero: 6204,
        total: 1994.94,
        fecha_documento: '2026-10-01',
      },
    });
    expect(r.requestedKeys).toEqual([
      'cliente_rut',
      'cliente_nombre',
      'local',
      'conformidad_nivel',
      'sello_texto',
      'notas_manuscritas',
      'revisar',
    ]);
    expect(r.itemKeys).toEqual([]);
    expect(r.userText).toMatchInlineSnapshot(`
      "Tipo preclasificado por QR: factura_emitida
      Datos ya leídos del QR, no los extraigas: serie A, número 6204, total 1994.94, fecha 2026-10-01"
    `);
    expect(r.maxTokens).toMatchInlineSnapshot(`330`);
    expect(fields(r.system)).toMatchInlineSnapshot(`
      "CAMPOS A EXTRAER
      - cliente_rut: En facturas: RUT del receptor. En devoluciones: RUT de quien devuelve
      - cliente_nombre: Razón social o nombre principal del cliente
      - local: Local o sucursal del cliente (ej. «Kinko», «Portones», «Frog 2»)
      - conformidad_nivel: completa, firma_sola, dudosa o sin_firma (definiciones en la sección 8)
      - sello_texto: Todo el texto legible del sello
      - notas_manuscritas: Textos escritos a mano que no sean la firma (ej. «faltaron 2»)
      - revisar: Lista de campo + motivo breve, solo si algo es dudoso

      FORMATO
      Un único objeto JSON compacto, sin espacios ni saltos de línea, solo con las claves de CAMPOS A EXTRAER más revisar. Omití las claves sin valor. Si hay productos, van en items como lista de objetos con las claves de producto activas."
    `);
    expect(r.system).toContain('Puntos Ano SRL (RUT 210000000012)');
    expect(r.system).not.toContain('{EMPRESA');
    expect(r.system.length / 4).toBeLessThan(1000);
  });

  it('factura con QR y todos los opcionales de factura', () => {
    const r = buildPrompt({
      company,
      catalog,
      enabledOptional: factOptional,
      preclassified: 'factura_emitida',
      qrData: {
        rut_emisor: '210000000012',
        serie: 'A',
        numero: 6204,
        total: 10,
        fecha_documento: '2026-10-01',
      },
    });
    expect(r.itemKeys).toEqual(['codigo', 'descripcion', 'cantidad', 'precio_unitario', 'importe']);
    expect(fields(r.system)).toMatchInlineSnapshot(`
      "CAMPOS A EXTRAER
      - cliente_rut: En facturas: RUT del receptor. En devoluciones: RUT de quien devuelve
      - cliente_nombre: Razón social o nombre principal del cliente
      - local: Local o sucursal del cliente (ej. «Kinko», «Portones», «Frog 2»)
      - conformidad_nivel: completa, firma_sola, dudosa o sin_firma (definiciones en la sección 8)
      - sello_texto: Todo el texto legible del sello
      - notas_manuscritas: Textos escritos a mano que no sean la firma (ej. «faltaron 2»)
      - revisar: Lista de campo + motivo breve, solo si algo es dudoso
      - forma_pago: contado o credito
      - fecha_vencimiento: Línea «Vencimiento:» debajo de la fecha de emisión. Nunca la fecha de vencimiento del CAE
      - orden_compra: «Número de compra», «OC» u «Orden de compra»
      - moneda: Código de moneda (ej. UYU, USD)
      - subtotal: Subtotal impreso
      - iva: Monto de IVA impreso
      - descuento_pct: Porcentaje de descuento impreso
      - descuento_monto: Monto de descuento impreso, en positivo
      - items: lista de productos, una entrada por línea, con las claves: codigo, descripcion, cantidad, precio_unitario, importe

      FORMATO
      Un único objeto JSON compacto, sin espacios ni saltos de línea, solo con las claves de CAMPOS A EXTRAER más revisar. Omití las claves sin valor. Si hay productos, van en items como lista de objetos con las claves de producto activas."
    `);
    expect(r.maxTokens).toMatchInlineSnapshot(`956`);
  });

  it('factura sin fact_item_* activos no pide items', () => {
    const r = buildPrompt({
      company,
      catalog,
      enabledOptional: ['forma_pago'],
      preclassified: 'factura_emitida',
      qrData: {},
    });
    expect(r.requestedKeys).not.toContain('items');
    expect(r.requestedKeys).toContain('forma_pago');
  });

  it('devolución sin QR (Devoto): sin preclasificar', () => {
    const r = buildPrompt({
      company,
      catalog,
      enabledOptional: ['dev_item_ean'],
      preclassified: null,
      qrData: {},
    });
    expect(r.requestedKeys).toContain('tipo_documento');
    expect(r.requestedKeys).toContain('total');
    expect(r.requestedKeys).toContain('items');
    expect(r.userText).toBe('Sin QR de DGI: clasificá el documento');
    expect(fields(r.system)).toMatchInlineSnapshot(`
      "CAMPOS A EXTRAER
      - tipo_documento: factura_emitida, nota_credito_emitida, devolucion_cliente, otro o no_reconocido
      - rut_emisor: 12 dígitos, solo números
      - serie: Letra(s) de la serie
      - numero: En devoluciones: «Nro documento» o número del remito
      - fecha_documento: Fecha de emisión en formato AAAA-MM-DD
      - total: Número con punto decimal
      - cliente_rut: En facturas: RUT del receptor. En devoluciones: RUT de quien devuelve
      - cliente_nombre: Razón social o nombre principal del cliente
      - local: Local o sucursal del cliente (ej. «Kinko», «Portones», «Frog 2»)
      - conformidad_nivel: completa, firma_sola, dudosa o sin_firma (definiciones en la sección 8)
      - sello_texto: Todo el texto legible del sello
      - notas_manuscritas: Textos escritos a mano que no sean la firma (ej. «faltaron 2»)
      - revisar: Lista de campo + motivo breve, solo si algo es dudoso
      - items: lista de productos, una entrada por línea, con las claves: codigo, descripcion, cantidad, ean

      FORMATO
      Un único objeto JSON compacto, sin espacios ni saltos de línea, solo con las claves de CAMPOS A EXTRAER más revisar. Omití las claves sin valor. Si hay productos, van en items como lista de objetos con las claves de producto activas."
    `);
    expect(r.maxTokens).toMatchInlineSnapshot(`660`);
  });

  it('e-Remito de Frog con QR: devolución', () => {
    const r = buildPrompt({
      company,
      catalog,
      enabledOptional: [],
      preclassified: 'devolucion_cliente',
      qrData: {
        rut_emisor: '219999990019',
        tipo_cfe: 181,
        serie: 'A',
        numero: 55,
        fecha_documento: '2026-09-30',
      },
    });
    for (const k of [
      'rut_emisor',
      'serie',
      'numero',
      'fecha_documento',
      'tipo_documento',
      'total',
      'cliente_rut',
    ]) {
      expect(r.requestedKeys).not.toContain(k);
    }
    expect(r.itemKeys).toEqual(['codigo', 'descripcion', 'cantidad']);
    expect(r.userText).toMatchInlineSnapshot(`
      "Tipo preclasificado por QR: devolucion_cliente
      Datos ya leídos del QR, no los extraigas: serie A, número 55, fecha 2026-09-30"
    `);
    expect(fields(r.system)).toMatchInlineSnapshot(`
      "CAMPOS A EXTRAER
      - cliente_nombre: Razón social o nombre principal del cliente
      - local: Local o sucursal del cliente (ej. «Kinko», «Portones», «Frog 2»)
      - conformidad_nivel: completa, firma_sola, dudosa o sin_firma (definiciones en la sección 8)
      - sello_texto: Todo el texto legible del sello
      - notas_manuscritas: Textos escritos a mano que no sean la firma (ej. «faltaron 2»)
      - revisar: Lista de campo + motivo breve, solo si algo es dudoso
      - items: lista de productos, una entrada por línea, con las claves: codigo, descripcion, cantidad

      FORMATO
      Un único objeto JSON compacto, sin espacios ni saltos de línea, solo con las claves de CAMPOS A EXTRAER más revisar. Omití las claves sin valor. Si hay productos, van en items como lista de objetos con las claves de producto activas."
    `);
    expect(r.maxTokens).toMatchInlineSnapshot(`430`);
  });
});

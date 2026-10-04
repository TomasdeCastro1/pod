import type { fieldCatalog } from '../schema.js';

export type FieldCatalogRow = typeof fieldCatalog.$inferInsert;

type DocType = 'factura' | 'devolucion';
const BOTH: DocType[] = ['factura', 'devolucion'];
const FACT: DocType[] = ['factura'];
const DEV: DocType[] = ['devolucion'];

/** Línea que el prompt dinámico agrega por campo (§8.2): "- clave: instrucción". */
export function promptLine(key: string, instruction: string): string {
  return `- ${key}: ${instruction}`;
}

/**
 * Decisión 5 del plan, para campos opcionales:
 *   est_in  = ceil(len("- clave: instrucción") / 4)
 *   est_out = max(3, round((costo_ia × 1000 − est_in) / 5))
 * donde costo_ia es el «Costo IA» (USD/1.000) de la tabla 7.2 de la especificación.
 */
export function estimateTokens(key: string, instruction: string, costoIa: number) {
  const estIn = Math.ceil(promptLine(key, instruction).length / 4);
  const estOut = Math.max(3, Math.round((costoIa * 1000 - estIn) / 5));
  return { estIn, estOut };
}

const GROUP_BASE = 'Incluido';

interface BaseDef {
  key: string;
  label: string;
  docTypes: DocType[];
  source: 'qr_o_ia' | 'ia' | 'qr';
  instruction: string;
  isItemField?: boolean;
  /** Tokens de salida estimados (decisión 5: 10 por defecto, 20 sello/notas, 60 items). */
  estOut: number;
}

// §7.1. Los campos base no tienen costo IA publicado: est_out fijo según el brief.
const BASE: BaseDef[] = [
  {
    key: 'tipo_documento',
    label: 'Tipo de documento',
    docTypes: BOTH,
    source: 'qr_o_ia',
    instruction: 'factura_emitida, nota_credito_emitida, devolucion_cliente, otro o no_reconocido',
    estOut: 10,
  },
  {
    key: 'rut_emisor',
    label: 'RUT emisor',
    docTypes: BOTH,
    source: 'qr_o_ia',
    instruction: '12 dígitos, solo números',
    estOut: 10,
  },
  // Solo CFE: sale del QR, no se le pide a la IA (est_in y est_out en 0).
  {
    key: 'tipo_cfe',
    label: 'Tipo de CFE',
    docTypes: BOTH,
    source: 'qr',
    instruction: '—',
    estOut: 0,
  },
  {
    key: 'serie',
    label: 'Serie',
    docTypes: BOTH,
    source: 'qr_o_ia',
    instruction: 'Letra(s) de la serie',
    estOut: 10,
  },
  {
    key: 'numero',
    label: 'Número',
    docTypes: BOTH,
    source: 'qr_o_ia',
    instruction: 'En devoluciones: «Nro documento» o número del remito',
    estOut: 10,
  },
  {
    key: 'fecha_documento',
    label: 'Fecha',
    docTypes: BOTH,
    source: 'qr_o_ia',
    instruction: 'Fecha de emisión en formato AAAA-MM-DD',
    estOut: 10,
  },
  {
    key: 'total',
    label: 'Total',
    docTypes: FACT,
    source: 'qr_o_ia',
    instruction: 'Número con punto decimal',
    estOut: 10,
  },
  {
    key: 'cliente_rut',
    label: 'RUT del cliente',
    docTypes: BOTH,
    source: 'ia',
    instruction: 'En facturas: RUT del receptor. En devoluciones: RUT de quien devuelve',
    estOut: 10,
  },
  {
    key: 'cliente_nombre',
    label: 'Cliente',
    docTypes: BOTH,
    source: 'ia',
    instruction: 'Razón social o nombre principal del cliente',
    estOut: 10,
  },
  {
    key: 'local',
    label: 'Local o sucursal',
    docTypes: BOTH,
    source: 'ia',
    instruction: 'Local o sucursal del cliente (ej. «Kinko», «Portones», «Frog 2»)',
    estOut: 10,
  },
  {
    key: 'conformidad_nivel',
    label: 'Conformidad',
    docTypes: BOTH,
    source: 'ia',
    instruction: 'completa, firma_sola, dudosa o sin_firma (definiciones en la sección 8)',
    estOut: 10,
  },
  {
    key: 'sello_texto',
    label: 'Texto del sello',
    docTypes: BOTH,
    source: 'ia',
    instruction: 'Todo el texto legible del sello',
    estOut: 20,
  },
  {
    key: 'notas_manuscritas',
    label: 'Notas a mano',
    docTypes: BOTH,
    source: 'ia',
    instruction: 'Textos escritos a mano que no sean la firma (ej. «faltaron 2»)',
    estOut: 20,
  },
  {
    key: 'items',
    label: 'Productos devueltos',
    docTypes: DEV,
    source: 'ia',
    instruction:
      'Una entrada por línea; codigo = el código que aparezca en la línea (subcampos: codigo, descripcion, cantidad)',
    isItemField: true,
    estOut: 60,
  },
  {
    key: 'revisar',
    label: 'A revisar',
    docTypes: BOTH,
    source: 'ia',
    instruction: 'Lista de campo + motivo breve, solo si algo es dudoso',
    estOut: 10,
  },
];

interface OptDef {
  group: string;
  key: string;
  label: string;
  docTypes: DocType[];
  instruction: string;
  costoIa: number;
  price: number;
}

const o = (
  group: string,
  key: string,
  label: string,
  docTypes: DocType[],
  instruction: string,
  costoIa: number,
  price: number,
): OptDef => ({ group, key, label, docTypes, instruction, costoIa, price });

// §7.2, en el orden de la especificación.
const OPTIONAL: OptDef[] = [
  o('Pago y referencias', 'forma_pago', 'Forma de pago', FACT, 'contado o credito', 0.07, 1),
  o(
    'Pago y referencias',
    'fecha_vencimiento',
    'Vencimiento de pago',
    FACT,
    'Línea «Vencimiento:» debajo de la fecha de emisión. Nunca la fecha de vencimiento del CAE',
    0.09,
    2,
  ),
  o(
    'Pago y referencias',
    'orden_compra',
    'Orden de compra',
    FACT,
    '«Número de compra», «OC» u «Orden de compra»',
    0.09,
    1,
  ),
  o('Pago y referencias', 'moneda', 'Moneda', FACT, 'Código de moneda (ej. UYU, USD)', 0.07, 1),
  o('Totales', 'subtotal', 'Subtotal', FACT, 'Subtotal impreso', 0.08, 1),
  o('Totales', 'iva', 'IVA', FACT, 'Monto de IVA impreso', 0.08, 1),
  o('Totales', 'descuento_pct', 'Descuento %', FACT, 'Porcentaje de descuento impreso', 0.07, 1),
  o(
    'Totales',
    'descuento_monto',
    'Descuento $',
    FACT,
    'Monto de descuento impreso, en positivo',
    0.08,
    1,
  ),
  o(
    'Productos de la factura',
    'fact_item_codigo',
    'Código de producto',
    FACT,
    'Código de cada línea (ej. BR1, BPO1)',
    0.18,
    2,
  ),
  o(
    'Productos de la factura',
    'fact_item_descripcion',
    'Descripción',
    FACT,
    'Texto de cada línea, tal como está',
    0.36,
    3,
  ),
  o(
    'Productos de la factura',
    'fact_item_cantidad',
    'Cantidad',
    FACT,
    'Cantidad de cada línea',
    0.16,
    2,
  ),
  o(
    'Productos de la factura',
    'fact_item_precio_unitario',
    'Precio unitario',
    FACT,
    'Precio unitario de cada línea',
    0.2,
    2,
  ),
  o(
    'Productos de la factura',
    'fact_item_importe',
    'Importe de línea',
    FACT,
    'Importe de cada línea',
    0.2,
    2,
  ),
  o(
    'Detalle de devoluciones',
    'dev_item_ean',
    'EAN',
    DEV,
    'Código de barras de 13 dígitos de cada línea',
    0.24,
    2,
  ),
  o(
    'Detalle de devoluciones',
    'dev_item_codigo_cliente',
    'Código de la cadena',
    DEV,
    'Código interno del cliente en cada línea',
    0.18,
    1,
  ),
  o(
    'Detalle de devoluciones',
    'dev_item_codigo_proveedor',
    'Código del proveedor',
    DEV,
    '«Referencia proveedor» u otro código del proveedor en cada línea',
    0.15,
    1,
  ),
  o(
    'Detalle de devoluciones',
    'dev_motivo',
    'Motivo',
    DEV,
    'Motivo de la devolución si figura',
    0.08,
    1,
  ),
  o(
    'Detalle de devoluciones',
    'dev_estado',
    'Estado',
    DEV,
    'Estado impreso (ej. «Devolu enviado»)',
    0.08,
    1,
  ),
  o(
    'Detalle de devoluciones',
    'dev_plazo_retiro_dias',
    'Plazo de retiro',
    DEV,
    'Días que el documento da para retirar la mercadería',
    0.07,
    2,
  ),
  o(
    'Detalle de devoluciones',
    'dev_exige_nota_credito',
    'Exige nota de crédito',
    DEV,
    'true si pide al proveedor emitir nota de crédito',
    0.07,
    1,
  ),
  o(
    'Datos del cliente',
    'cliente_razon_social',
    'Razón social',
    BOTH,
    'Razón social completa',
    0.12,
    1,
  ),
  o(
    'Datos del cliente',
    'cliente_nombre_comercial',
    'Nombre comercial',
    BOTH,
    'Nombre de fantasía si es distinto',
    0.09,
    1,
  ),
  o(
    'Datos del cliente',
    'cliente_direccion',
    'Dirección',
    BOTH,
    'Dirección del cliente o del local',
    0.12,
    1,
  ),
  o(
    'Conformidad detallada',
    'firma_nombre',
    'Quién firmó',
    BOTH,
    'Nombre de la persona según sello o aclaración',
    0.09,
    1,
  ),
  o(
    'Conformidad detallada',
    'firma_cargo',
    'Cargo',
    BOTH,
    'Cargo según sello o aclaración (ej. «Jefe de local»)',
    0.07,
    1,
  ),
  o(
    'Conformidad detallada',
    'sello_fecha',
    'Fecha del sello',
    BOTH,
    'Fecha que figure en el sello',
    0.09,
    1,
  ),
  o(
    'Conformidad detallada',
    'marcas_control',
    'Tildes de control',
    BOTH,
    'true si hay tildes o marcas junto a los productos',
    0.07,
    1,
  ),
];

export const FIELD_CATALOG_SEED: FieldCatalogRow[] = [
  ...BASE.map((f, i): FieldCatalogRow => {
    const estIn = f.source === 'qr' ? 0 : Math.ceil(promptLine(f.key, f.instruction).length / 4);
    return {
      key: f.key,
      label: f.label,
      group: GROUP_BASE,
      docTypes: f.docTypes,
      isBase: true,
      source: f.source,
      instruction: f.instruction,
      isItemField: f.isItemField ?? false,
      estInTokens: estIn,
      estOutTokens: f.estOut,
      pricePer1000Usd: '0',
      sortOrder: i + 1,
      active: true,
    };
  }),
  ...OPTIONAL.map((f, i): FieldCatalogRow => {
    const { estIn, estOut } = estimateTokens(f.key, f.instruction, f.costoIa);
    return {
      key: f.key,
      label: f.label,
      group: f.group,
      docTypes: f.docTypes,
      isBase: false,
      source: 'ia',
      instruction: f.instruction,
      isItemField: f.key.startsWith('fact_item_') || f.key.startsWith('dev_item_'),
      estInTokens: estIn,
      estOutTokens: estOut,
      pricePer1000Usd: String(f.price),
      sortOrder: BASE.length + i + 1,
      active: true,
    };
  }),
];

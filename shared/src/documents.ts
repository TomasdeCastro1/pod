export type DocType =
  'factura_emitida' | 'nota_credito_emitida' | 'devolucion_cliente' | 'otro' | 'no_reconocido';

export type Conformidad = 'completa' | 'firma_sola' | 'dudosa' | 'sin_firma';

/** CFE type codes published by DGI (spec section 6). */
export const CFE_TYPES: Readonly<Record<number, string>> = {
  101: 'e-Ticket',
  102: 'Nota de crédito de e-Ticket',
  103: 'Nota de débito de e-Ticket',
  111: 'e-Factura',
  112: 'Nota de crédito de e-Factura',
  113: 'Nota de débito de e-Factura',
  181: 'e-Remito',
  182: 'e-Resguardo',
};

export function cfeName(code: number | string): string {
  const n = typeof code === 'string' ? Number(code.trim()) : code;
  return Object.hasOwn(CFE_TYPES, n) ? CFE_TYPES[n]! : 'otro CFE';
}

export function docFamily(docType: DocType): 'factura' | 'devolucion' | null {
  switch (docType) {
    case 'factura_emitida':
    case 'nota_credito_emitida':
      return 'factura';
    case 'devolucion_cliente':
      return 'devolucion';
    default:
      return null;
  }
}

/**
 * Preclassifies a document from a DGI QR (spec section 5, plan decision 13).
 * Credit notes (102, 112) issued by the company are `nota_credito_emitida`;
 * debit notes (103, 113) and anything else issued by the company are `factura_emitida`.
 * Any other issuer means a customer return.
 */
export function classifyFromQr(
  qrEmitterRut: string,
  companyRut: string,
  cfeCode: number | string,
): DocType {
  if (qrEmitterRut !== companyRut) return 'devolucion_cliente';
  const n = typeof cfeCode === 'string' ? Number(cfeCode.trim()) : cfeCode;
  return n === 102 || n === 112 ? 'nota_credito_emitida' : 'factura_emitida';
}

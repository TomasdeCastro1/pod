import type { Conformidad, ScanDto } from '@app/shared';

/** Textos exactos de §9.3. */
export const ALERT_TEXTS = {
  sinFirma: 'Este comprobante no tiene una firma válida. Pedí la firma y volvé a escanearlo',
  noReconocido: 'No se pudo leer el comprobante. Probá con más luz y el papel estirado',
  errorServidor: 'No pudimos procesarlo, lo reintentamos solo',
} as const;

/** Qué hace la app con un resultado: interrumpir (modal), avisar en la tarjeta o nada. */
export type AlertKind = 'firma' | 'no_leido' | 'error' | 'revisar';

/** Elige la alerta a partir del DTO del servidor (campo `alert`, §9.3). `procesando` nunca alerta. */
export function pickAlert(scan: Pick<ScanDto, 'status' | 'alert'>): AlertKind | null {
  if (scan.status === 'procesando') return null;
  switch (scan.alert) {
    case 'sin_firma':
      return 'firma';
    case 'no_reconocido':
      return 'no_leido';
    case 'error':
      return 'error';
    case 'revisar':
      return 'revisar';
    default:
      return null;
  }
}

/** Las alertas que interrumpen con un modal a pantalla completa. */
export function isBlockingAlert(kind: AlertKind | null): kind is 'firma' | 'no_leido' {
  return kind === 'firma' || kind === 'no_leido';
}

export function alertMessage(kind: 'firma' | 'no_leido' | 'error'): string {
  if (kind === 'firma') return ALERT_TEXTS.sinFirma;
  if (kind === 'no_leido') return ALERT_TEXTS.noReconocido;
  return ALERT_TEXTS.errorServidor;
}

export function docTypeLabel(docType: string | null): string {
  switch (docType) {
    case 'factura_emitida':
      return 'Factura';
    case 'nota_credito_emitida':
    case 'devolucion_cliente':
      return 'Devolución';
    case 'otro':
      return 'Otro';
    default:
      return 'Sin tipo';
  }
}

export function isConformidad(v: string | null): v is Conformidad {
  return v === 'completa' || v === 'firma_sola' || v === 'dudosa' || v === 'sin_firma';
}

export function formatTotal(total: number | null): string {
  if (total === null) return '—';
  return `$ ${total.toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

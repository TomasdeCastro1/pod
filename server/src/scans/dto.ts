import type { scans } from '../db/schema.js';
import { effectiveValue } from '../db/scans.js';

type ScanRow = typeof scans.$inferSelect;

export type ScanAlert = 'sin_firma' | 'no_reconocido' | 'revisar' | 'error';

export interface ScanDto {
  id: string;
  status: ScanRow['status'];
  doc_type: string | null;
  conformidad_nivel: string | null;
  cliente_nombre: string | null;
  local: string | null;
  serie: string | null;
  numero: string | null;
  fecha_documento: string | null;
  total: number | null;
  revisar: Array<{ campo: string; motivo: string }>;
  fields: Record<string, { value: unknown; corrected: boolean }>;
  captured_at: string;
  thumb_url: string | null;
  alert: ScanAlert | null;
}

/** Claves que el QR de DGI aporta (además de las pedidas a la IA). */
const QR_KEYS = ['rut_emisor', 'tipo_cfe', 'serie', 'numero', 'total', 'fecha_documento'] as const;

function revisarList(scan: ScanRow): Array<{ campo: string; motivo: string }> {
  const raw = scan.extracted?.revisar;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (r): r is { campo: string; motivo: string } =>
      !!r && typeof (r as { campo?: unknown }).campo === 'string',
  );
}

/** §9.3: la alerta que tiene que mostrar la app para este escaneo. */
export function scanAlert(scan: ScanRow, revisar = revisarList(scan)): ScanAlert | null {
  if (scan.status === 'error') return 'error';
  if (scan.status === 'procesando') return null;
  if (scan.conformidadNivel === 'sin_firma' || scan.conformidadNivel === 'dudosa') {
    return 'sin_firma';
  }
  if (scan.docType === 'no_reconocido') return 'no_reconocido';
  if (revisar.length > 0) return 'revisar';
  return null;
}

/**
 * Serializador único del escaneo para la app. Nunca incluye costo, tokens ni modelo (§11).
 * `thumbUrl` ya viene firmada (o null si no hay miniatura).
 */
export function toScanDto(scan: ScanRow, thumbUrl: string | null = null): ScanDto {
  const revisar = revisarList(scan);
  const keys = new Set<string>(scan.fieldsRequested ?? []);
  for (const k of QR_KEYS) if (scan.qrData?.[k] !== undefined) keys.add(k);

  const fields: ScanDto['fields'] = {};
  for (const key of keys) {
    const corrected = !!scan.corrections && Object.hasOwn(scan.corrections, key);
    let value = effectiveValue(scan, key);
    if (value === undefined) value = scan.qrData?.[key];
    if (value === undefined) continue;
    fields[key] = { value, corrected };
  }

  return {
    id: scan.id,
    status: scan.status,
    doc_type: scan.docType,
    conformidad_nivel: scan.conformidadNivel,
    cliente_nombre: scan.clienteNombre,
    local: scan.local,
    serie: scan.serie,
    numero: scan.numero,
    fecha_documento: scan.fechaDocumento,
    total: scan.total === null ? null : Number(scan.total),
    revisar,
    fields,
    captured_at: scan.capturedAt.toISOString(),
    thumb_url: thumbUrl,
    alert: scanAlert(scan, revisar),
  };
}

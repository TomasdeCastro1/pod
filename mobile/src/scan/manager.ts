import type { ScanDto } from '@app/shared';

/** Tipos y utilidades de captura. La cola persistente (SQLite) vive en `../queue`. */
export type CaptureStatus =
  | 'preparing' // redimensionando
  | 'pending' // sin conexión / reintentando la subida: «Pendiente de envío»
  | 'uploading'
  | 'processing' // subida lista, esperando resultado: «Procesando…»
  | 'done'
  | 'timeout' // pasaron 30 s: sigue «Procesando», se actualiza en el Archivo
  | 'failed'; // error no reintentable

export interface CaptureItem {
  clientId: string;
  companyId: string;
  /** Imagen local (después de redimensionar, la reducida). */
  uri: string;
  capturedAt: string;
  replacesScanId?: string;
  status: CaptureStatus;
  scanId?: string;
  scan?: ScanDto;
  error?: string;
  /** El repartidor ya vio el modal de esta captura. */
  alertDismissed: boolean;
}

export interface EnqueueInput {
  companyId: string;
  /** Imagen recortada que entregó el escáner. */
  imageUri: string;
  replacesScanId?: string;
}

export interface UploadParams {
  imageUri: string;
  clientId: string;
  capturedAt: string;
  lat?: number;
  lng?: number;
  replacesScanId?: string;
}

export const LOCATION_TIMEOUT_MS = 2000;

export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(fallback);
      },
    );
  });
}

/** Lado largo final: 1.600 px (solo se achica, nunca se agranda). */
export function resizeTarget(width: number, height: number, maxSide = 1600) {
  const long = Math.max(width, height);
  if (long <= maxSide) return null;
  const k = maxSide / long;
  return { width: Math.round(width * k), height: Math.round(height * k) };
}

/** Errores 4xx (salvo 401/408/429) no se reintentan; red y 5xx sí. */
export function isRetryableUploadError(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status !== 'number') return true;
  // 401: la sesión venció; la captura espera en la cola hasta que vuelva a iniciar sesión.
  return status >= 500 || status === 408 || status === 429 || status === 401;
}

/**
 * «Volver a escanear»: abre el escáner y sube la nueva captura reemplazando a `scanId`.
 * `scan` devuelve la URI de la imagen o null si el repartidor cancela.
 */
export async function rescan(
  manager: { enqueueCapture: (input: EnqueueInput) => CaptureItem },
  scan: () => Promise<string | null>,
  target: { companyId: string; scanId: string },
): Promise<CaptureItem | null> {
  const uri = await scan();
  if (!uri) return null;
  return manager.enqueueCapture({
    companyId: target.companyId,
    imageUri: uri,
    replacesScanId: target.scanId,
  });
}

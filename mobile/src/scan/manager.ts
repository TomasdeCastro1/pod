import type { ScanDto, UploadScanResponse } from '@app/shared';
import { pollScan, type PollOptions } from './polling';

/**
 * Interfaz de captura. T6.1 reemplaza la implementación (cola persistente en SQLite) manteniendo
 * `enqueueCapture`, `getCaptures`, `subscribe`, `dismissAlert` y `retryCapture`: la UI no cambia.
 */
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

export interface CaptureDeps {
  /** Redimensiona a 1.600 px / JPEG 0,8 y devuelve la URI nueva. */
  prepareImage: (uri: string) => Promise<string>;
  newId: () => string;
  /** Ubicación si hay permiso; puede devolver null. El manager aplica el timeout de 2 s. */
  getLocation: () => Promise<{ lat: number; lng: number } | null>;
  upload: (companyId: string, p: UploadParams) => Promise<UploadScanResponse>;
  getScan: (scanId: string) => Promise<ScanDto>;
  poll?: PollOptions;
  /** Espera entre reintentos de subida (ms); por defecto 2 s, 4 s, 8 s… tope 30 s. */
  retryDelayMs?: (attempt: number) => number;
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

const defaultRetryDelay = (attempt: number) => Math.min(2000 * 2 ** (attempt - 1), 30_000);

/** Errores 4xx (salvo 408/429) no se reintentan; red y 5xx sí. */
export function isRetryableUploadError(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status !== 'number') return true;
  return status >= 500 || status === 408 || status === 429;
}

export type Listener = () => void;

export function createCaptureManager(deps: CaptureDeps) {
  let items: CaptureItem[] = [];
  const listeners = new Set<Listener>();

  const emit = () => listeners.forEach((l) => l());
  const patch = (clientId: string, p: Partial<CaptureItem>) => {
    items = items.map((it) => (it.clientId === clientId ? { ...it, ...p } : it));
    emit();
  };

  async function run(item: CaptureItem) {
    const { clientId } = item;
    let uri = item.uri;
    try {
      uri = await deps.prepareImage(item.uri);
    } catch {
      // Si no se puede redimensionar, se sube la original antes que perder la captura.
    }
    patch(clientId, { uri, status: 'uploading' });

    const loc = await withTimeout(deps.getLocation(), LOCATION_TIMEOUT_MS, null);

    let scanId: string | undefined;
    for (let attempt = 1; !scanId; attempt++) {
      try {
        const res = await deps.upload(item.companyId, {
          imageUri: uri,
          clientId,
          capturedAt: item.capturedAt,
          lat: loc?.lat,
          lng: loc?.lng,
          replacesScanId: item.replacesScanId,
        });
        scanId = res.scan_id;
      } catch (err) {
        if (!isRetryableUploadError(err)) {
          patch(clientId, { status: 'failed', error: (err as Error).message });
          return;
        }
        patch(clientId, { status: 'pending' });
        await new Promise((r) => setTimeout(r, (deps.retryDelayMs ?? defaultRetryDelay)(attempt)));
        patch(clientId, { status: 'uploading' });
      }
    }

    patch(clientId, { status: 'processing', scanId });
    const scan = await pollScan(() => deps.getScan(scanId), deps.poll);
    if (scan) patch(clientId, { status: 'done', scan });
    else patch(clientId, { status: 'timeout' });
  }

  return {
    getCaptures: () => items,
    subscribe(l: Listener) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },

    /** Registra la captura (la miniatura aparece al instante) y la procesa en segundo plano. */
    enqueueCapture(input: EnqueueInput): CaptureItem {
      const item: CaptureItem = {
        clientId: deps.newId(),
        companyId: input.companyId,
        uri: input.imageUri,
        capturedAt: new Date().toISOString(),
        replacesScanId: input.replacesScanId,
        status: 'preparing',
        alertDismissed: false,
      };
      items = [item, ...items];
      emit();
      void run(item);
      return item;
    },

    dismissAlert(clientId: string) {
      patch(clientId, { alertDismissed: true });
    },

    /** Vuelve a esperar el resultado de una captura que quedó en «Procesando» (timeout). */
    async refresh(clientId: string) {
      const it = items.find((i) => i.clientId === clientId);
      if (!it?.scanId) return;
      const scan = await pollScan(() => deps.getScan(it.scanId!), deps.poll);
      if (scan) patch(clientId, { status: 'done', scan });
    },
  };
}

export type CaptureManager = ReturnType<typeof createCaptureManager>;

/**
 * «Volver a escanear»: abre el escáner y sube la nueva captura reemplazando a `scanId`.
 * `scan` devuelve la URI de la imagen o null si el repartidor cancela.
 */
export async function rescan(
  manager: Pick<CaptureManager, 'enqueueCapture'>,
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

import type { ScanDto, UploadScanResponse } from '@app/shared';
import {
  LOCATION_TIMEOUT_MS,
  isRetryableUploadError,
  withTimeout,
  type CaptureItem,
  type CaptureStatus,
  type EnqueueInput,
  type UploadParams,
} from '../scan/manager';
import { pollScan, type PollOptions } from '../scan/polling';
import type { CaptureRow, CaptureState, CaptureStore } from './types';

export const BACKOFF_BASE_MS = 2000;
export const BACKOFF_MAX_MS = 5 * 60_000;
/** Las capturas fallidas (4xx) se muestran un día y después se descartan. */
export const FAILED_TTL_MS = 24 * 3600_000;

/** Miniatura de una captura: la imagen local mientras exista; si no, la `thumb_url` del servidor. */
export function thumbUri(localUri: string, scan: ScanDto | null | undefined, localExists = true) {
  if (localExists && localUri) return localUri;
  return scan?.thumb_url ?? '';
}

/** 2 s, 4 s, 8 s… con tope de 5 min. `attempts` cuenta el intento que acaba de fallar. */
export function backoffMs(attempts: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1), BACKOFF_MAX_MS);
}

export interface QueueDeps {
  store: CaptureStore;
  /** Redimensiona a 1.600 px / JPEG 0,8 y devuelve la URI nueva. */
  prepareImage: (uri: string) => Promise<string>;
  /** Mueve la imagen a documentDirectory/captures/<clientId>.jpg y devuelve la URI final. */
  persistFile: (uri: string, clientId: string) => Promise<string>;
  deleteFile: (uri: string) => Promise<void>;
  newId: () => string;
  getLocation: () => Promise<{ lat: number; lng: number } | null>;
  upload: (companyId: string, p: UploadParams) => Promise<UploadScanResponse>;
  getScan: (scanId: string) => Promise<ScanDto>;
  poll?: PollOptions;
  backoffMs?: (attempts: number) => number;
  now?: () => number;
}

const STATE_TO_STATUS: Record<CaptureState, CaptureStatus> = {
  pendiente: 'pending',
  subiendo: 'uploading',
  subido: 'processing',
  fallido: 'failed',
};

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Cola persistente de capturas. Mantiene la interfaz del manager de T3.3 (`enqueueCapture`,
 * `getCaptures`, `subscribe`, `dismissAlert`, `refresh`) y agrega `start`, `kick` y `clearAll`.
 */
export function createCaptureQueue(deps: QueueDeps) {
  const now = deps.now ?? Date.now;
  const backoff = deps.backoffMs ?? backoffMs;
  const store = deps.store;

  let items: CaptureItem[] = [];
  const rows = new Map<string, CaptureRow>();
  const nextAt = new Map<string, number>();
  const tracking = new Set<string>();
  const listeners = new Set<() => void>();
  let draining = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let startP: Promise<void> | null = null;

  const emit = () => listeners.forEach((l) => l());
  const patchItem = (clientId: string, p: Partial<CaptureItem>) => {
    items = items.map((it) => (it.clientId === clientId ? { ...it, ...p } : it));
    emit();
  };

  /** Actualiza la fila (espejo en memoria + SQLite). Un fallo de disco no corta el flujo. */
  async function setRow(clientId: string, p: Partial<Omit<CaptureRow, 'client_id'>>) {
    const cur = rows.get(clientId);
    if (cur) rows.set(clientId, { ...cur, ...p });
    try {
      await store.update(clientId, p);
    } catch {
      // Si no se puede escribir, sigue en memoria; al reiniciar se reintenta (el servidor es idempotente).
    }
  }

  async function finish(clientId: string, scan: ScanDto) {
    patchItem(clientId, { status: 'done', scan });
    const uri = rows.get(clientId)?.file_uri;
    if (uri) {
      let deleted = true;
      try {
        await deps.deleteFile(uri);
      } catch {
        deleted = false; // Queda un archivo suelto; no afecta al escaneo.
      }
      await setRow(clientId, { file_uri: '' });
      // El archivo local ya no está: la miniatura pasa a ser la del servidor.
      if (deleted) patchItem(clientId, { uri: thumbUri(uri, scan, false) });
    }
  }

  /** Polling de T3.3 sobre un escaneo ya subido. */
  async function track(clientId: string, scanId: string) {
    if (tracking.has(clientId)) return;
    tracking.add(clientId);
    try {
      patchItem(clientId, { status: 'processing', scanId });
      const scan = await pollScan(() => deps.getScan(scanId), deps.poll);
      if (scan) await finish(clientId, scan);
      else patchItem(clientId, { status: 'timeout' });
    } finally {
      tracking.delete(clientId);
    }
  }

  async function uploadOne(row: CaptureRow) {
    const id = row.client_id;
    const attempts = row.attempts + 1;
    await setRow(id, { state: 'subiendo', attempts });
    patchItem(id, { status: 'uploading' });
    let res: UploadScanResponse;
    try {
      res = await deps.upload(row.company_id, {
        imageUri: row.file_uri,
        clientId: id,
        capturedAt: row.captured_at,
        lat: row.lat ?? undefined,
        lng: row.lng ?? undefined,
        replacesScanId: row.replaces_scan_id ?? undefined,
      });
    } catch (err) {
      if (!isRetryableUploadError(err)) {
        await setRow(id, { state: 'fallido', last_error: errMsg(err) });
        patchItem(id, { status: 'failed', error: errMsg(err) });
        return;
      }
      await setRow(id, { state: 'pendiente', last_error: errMsg(err) });
      nextAt.set(id, now() + backoff(attempts));
      patchItem(id, { status: 'pending' });
      return;
    }
    await setRow(id, { state: 'subido', scan_id: res.scan_id, last_error: null });
    nextAt.delete(id);
    void track(id, res.scan_id);
  }

  /** Sube de a una las filas `pendiente` cuyo backoff ya venció; agenda la próxima si hay espera. */
  async function drain() {
    if (draining) return;
    draining = true;
    try {
      for (;;) {
        const t = now();
        const pending = [...rows.values()]
          .filter((r) => r.state === 'pendiente')
          .sort((a, b) => a.created_at.localeCompare(b.created_at));
        const ready = pending.find((r) => (nextAt.get(r.client_id) ?? 0) <= t);
        if (!ready) {
          const waits = pending.map((r) => nextAt.get(r.client_id) ?? 0);
          if (waits.length > 0) {
            if (timer) clearTimeout(timer);
            timer = setTimeout(
              () => {
                timer = null;
                void drain();
              },
              Math.max(0, Math.min(...waits) - t),
            );
          }
          return;
        }
        await uploadOne(ready);
      }
    } finally {
      draining = false;
    }
  }

  /**
   * Dispara el procesamiento (captura, vuelve la conexión, app a primer plano, arranque).
   * Con `resetBackoff` se reintenta ya, sin esperar el backoff.
   */
  function kick(resetBackoff = false) {
    if (resetBackoff) {
      nextAt.clear();
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }
    void drain();
  }

  function rowToItem(r: CaptureRow): CaptureItem {
    return {
      clientId: r.client_id,
      companyId: r.company_id,
      uri: r.file_uri,
      capturedAt: r.captured_at,
      replacesScanId: r.replaces_scan_id ?? undefined,
      status: STATE_TO_STATUS[r.state],
      scanId: r.scan_id ?? undefined,
      error: r.state === 'fallido' ? (r.last_error ?? undefined) : undefined,
      alertDismissed: false,
    };
  }

  /** Procesa lo que quedó de la sesión anterior. Idempotente. */
  function start(): Promise<void> {
    startP ??= (async () => {
      await store.init();
      const all = await store.list();
      const stale: string[] = [];
      const loaded: CaptureRow[] = [];
      for (const r of all) {
        if (r.state === 'subido' && !r.file_uri) continue; // ya terminó
        if (r.state === 'fallido' && now() - Date.parse(r.created_at) > FAILED_TTL_MS) {
          stale.push(r.client_id);
          if (r.file_uri) void deps.deleteFile(r.file_uri).catch(() => {});
          continue;
        }
        // Una fila `subiendo` al arrancar quedó a medias: se reenvía (idempotente por client_id).
        const row = r.state === 'subiendo' ? { ...r, state: 'pendiente' as const } : r;
        if (row !== r) await setRow(r.client_id, { state: 'pendiente' });
        rows.set(row.client_id, row);
        loaded.push(row);
      }
      if (stale.length > 0) await store.remove(stale).catch(() => {});
      const known = new Set(items.map((i) => i.clientId));
      items = [...items, ...loaded.filter((r) => !known.has(r.client_id)).map(rowToItem)];
      emit();
      for (const r of loaded)
        if (r.state === 'subido' && r.scan_id) void track(r.client_id, r.scan_id);
      kick();
    })();
    return startP;
  }

  return {
    getCaptures: () => items,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    start,
    kick,

    /** Capturas que todavía no llegaron al servidor (para avisar al cerrar sesión). */
    pendingCount: () =>
      items.filter((i) => ['preparing', 'pending', 'uploading'].includes(i.status)).length,

    /**
     * Registra la captura (la miniatura aparece al instante), la guarda en disco y en SQLite
     * antes de intentar subirla, y dispara el worker.
     */
    enqueueCapture(input: EnqueueInput): CaptureItem {
      const clientId = deps.newId();
      const item: CaptureItem = {
        clientId,
        companyId: input.companyId,
        uri: input.imageUri,
        capturedAt: new Date(now()).toISOString(),
        replacesScanId: input.replacesScanId,
        status: 'preparing',
        alertDismissed: false,
      };
      items = [item, ...items];
      emit();

      void (async () => {
        const prepared = deps.prepareImage(input.imageUri).catch(() => input.imageUri);
        const [uri, loc] = await Promise.all([
          prepared,
          withTimeout(deps.getLocation(), LOCATION_TIMEOUT_MS, null),
        ]);
        let fileUri = uri;
        try {
          fileUri = await deps.persistFile(uri, clientId);
        } catch {
          // Mejor subir desde donde está que perder la captura.
        }
        const row: CaptureRow = {
          client_id: clientId,
          company_id: input.companyId,
          file_uri: fileUri,
          captured_at: item.capturedAt,
          lat: loc?.lat ?? null,
          lng: loc?.lng ?? null,
          replaces_scan_id: input.replacesScanId ?? null,
          state: 'pendiente',
          scan_id: null,
          attempts: 0,
          last_error: null,
          created_at: new Date(now()).toISOString(),
        };
        try {
          await start(); // la tabla tiene que existir
          await store.insert(row);
        } catch {
          // Sin disco no hay cola persistente; igual se intenta subir en esta sesión.
        }
        rows.set(clientId, row);
        patchItem(clientId, { uri: fileUri, status: 'pending' });
        kick();
      })();
      return item;
    },

    dismissAlert(clientId: string) {
      patchItem(clientId, { alertDismissed: true });
    },

    /** Vuelve a esperar el resultado de una captura que quedó en «Procesando» (timeout). */
    async refresh(clientId: string) {
      const it = items.find((i) => i.clientId === clientId);
      if (it?.scanId) await track(clientId, it.scanId);
    },

    /** Descarta toda la cola (cerrar sesión confirmando que se pierden las pendientes). */
    async clearAll() {
      if (timer) clearTimeout(timer);
      timer = null;
      const all = [...rows.values()];
      rows.clear();
      nextAt.clear();
      items = [];
      emit();
      await store.remove(all.map((r) => r.client_id)).catch(() => {});
      await Promise.all(
        all.filter((r) => r.file_uri).map((r) => deps.deleteFile(r.file_uri).catch(() => {})),
      );
    },
  };
}

export type CaptureQueue = ReturnType<typeof createCaptureQueue>;

/** Aviso discreto de la pestaña Escanear. null si no hay nada que avisar. */
export function offlineNotice(offline: boolean, pending: number): string | null {
  if (!offline || pending === 0) return null;
  return pending === 1
    ? 'Sin conexión: 1 comprobante se enviará solo'
    : `Sin conexión: ${pending} comprobantes se enviarán solos`;
}

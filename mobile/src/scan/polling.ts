import type { ScanDto } from '@app/shared';

export const POLL_INTERVAL_MS = 1500;
export const POLL_TIMEOUT_MS = 30_000;

export interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Consulta el escaneo cada 1,5 s hasta que deja de estar «procesando». Devuelve el DTO final o
 * null si pasan 30 s (la tarjeta queda en «Procesando» y se actualiza en el Archivo).
 * Un error de red en una consulta no corta el polling.
 */
export async function pollScan(
  getScan: () => Promise<ScanDto>,
  { intervalMs = POLL_INTERVAL_MS, timeoutMs = POLL_TIMEOUT_MS }: PollOptions = {},
): Promise<ScanDto | null> {
  const start = Date.now();
  for (;;) {
    try {
      const scan = await getScan();
      if (scan.status !== 'procesando') return scan;
    } catch {
      // Se reintenta en la próxima vuelta.
    }
    if (Date.now() - start + intervalMs > timeoutMs) return null;
    await sleep(intervalMs);
  }
}

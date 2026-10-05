import { and, eq, lt } from 'drizzle-orm';
import type { AnyDb } from '../db/seed/index.js';
import { scans } from '../db/schema.js';

export interface ScanQueue {
  enqueue(scanId: string): void;
  /** Resolves when nothing is queued or running (used by tests and the dev script). */
  idle(): Promise<void>;
}

export interface QueueOptions {
  concurrency?: number;
  /** Runs one scan to its final state; must not throw (errors are handled inside). */
  run: (scanId: string) => Promise<void>;
}

export const DEFAULT_CONCURRENCY = 4;
export const STUCK_AFTER_MS = 2 * 60 * 1000;

/** In-memory queue with bounded concurrency. An id already queued or running is not added twice. */
export function createScanQueue(opts: QueueOptions): ScanQueue {
  const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);
  const pending: string[] = [];
  const known = new Set<string>();
  let running = 0;
  let waiters: Array<() => void> = [];

  const settle = () => {
    if (running === 0 && pending.length === 0) {
      const w = waiters;
      waiters = [];
      w.forEach((f) => f());
    }
  };

  const pump = () => {
    while (running < concurrency && pending.length > 0) {
      const id = pending.shift()!;
      running++;
      void opts
        .run(id)
        .catch(() => undefined)
        .finally(() => {
          running--;
          known.delete(id);
          pump();
          settle();
        });
    }
  };

  return {
    enqueue(scanId) {
      if (known.has(scanId)) return;
      known.add(scanId);
      pending.push(scanId);
      pump();
    },
    idle() {
      if (running === 0 && pending.length === 0) return Promise.resolve();
      return new Promise((resolve) => waiters.push(resolve));
    },
  };
}

/**
 * Startup recovery (plan decision 2): scans still `procesando` after more than 2 minutes were
 * interrupted by a restart, so they are queued again. Returns how many were re-queued.
 */
export async function recoverStuckScans(
  db: AnyDb,
  queue: ScanQueue,
  now: Date = new Date(),
  olderThanMs: number = STUCK_AFTER_MS,
): Promise<number> {
  const cutoff = new Date(now.getTime() - olderThanMs);
  const rows = await db
    .select({ id: scans.id })
    .from(scans)
    // deleted_at is not filtered: a replaced scan is hidden but still has to finish.
    .where(and(eq(scans.status, 'procesando'), lt(scans.uploadedAt, cutoff)));
  for (const r of rows) queue.enqueue(r.id);
  return rows.length;
}

import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { AnyDb } from '../db/seed/index.js';
import { scans } from '../db/schema.js';
import { makeThumb, normalizeUpload } from '../images.js';
import { imageKey, thumbKey } from '../storage/keys.js';
import type { ObjectStore } from '../storage/index.js';
import type { ScanQueue } from './queue.js';

export interface CreateScanInput {
  companyId: string;
  userId: string;
  clientId: string;
  capturedAt: Date;
  lat?: number | null;
  lng?: number | null;
  image: Buffer;
  replacesScanId?: string | null;
}

export interface CreateScanResult {
  scanId: string;
  status: 'procesando' | 'listo' | 'revisar' | 'error';
  /** True when `client_id` already existed and nothing was done. */
  duplicate: boolean;
}

/**
 * Receives an upload: stores the image and thumbnail, inserts the row as `procesando` and
 * queues the processing without waiting for the AI. Idempotent by `client_id`.
 * An invalid image throws before any row is created.
 */
export async function createScan(
  db: AnyDb,
  store: ObjectStore,
  input: CreateScanInput,
  queue: ScanQueue,
): Promise<CreateScanResult> {
  const existing = await findByClientId(db, input.clientId);
  if (existing) return { scanId: existing.id, status: existing.status, duplicate: true };

  const scanId = randomUUID();
  const normalized = await normalizeUpload(input.image);
  const thumb = await makeThumb(normalized);
  const imgKey = imageKey(input.companyId, input.capturedAt, scanId);
  const thbKey = thumbKey(input.companyId, input.capturedAt, scanId);
  await store.put(imgKey, normalized, 'image/jpeg');
  await store.put(thbKey, thumb, 'image/jpeg');

  const inserted = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(scans)
      .values({
        id: scanId,
        clientId: input.clientId,
        companyId: input.companyId,
        userId: input.userId,
        replacesScanId: input.replacesScanId ?? null,
        capturedAt: input.capturedAt,
        uploadedAt: new Date(),
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        imageKey: imgKey,
        thumbKey: thbKey,
        status: 'procesando',
      })
      .onConflictDoNothing({ target: scans.clientId })
      .returning({ id: scans.id });
    if (rows.length === 0) return false;
    if (input.replacesScanId) {
      // Hidden from the archive but its status stays: it still counts for usage (decision 8).
      await tx
        .update(scans)
        .set({ deletedAt: new Date() })
        .where(and(eq(scans.id, input.replacesScanId), eq(scans.companyId, input.companyId)));
    }
    return true;
  });

  if (!inserted) {
    // Lost a race with a concurrent upload of the same client_id: drop our copies.
    await Promise.allSettled([store.delete(imgKey), store.delete(thbKey)]);
    const winner = await findByClientId(db, input.clientId);
    if (!winner) throw new Error('No se pudo registrar el escaneo');
    return { scanId: winner.id, status: winner.status, duplicate: true };
  }

  queue.enqueue(scanId);
  return { scanId, status: 'procesando', duplicate: false };
}

async function findByClientId(db: AnyDb, clientId: string) {
  const [row] = await db
    .select({ id: scans.id, status: scans.status })
    .from(scans)
    .where(eq(scans.clientId, clientId));
  return row;
}

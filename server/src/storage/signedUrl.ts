import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { Router } from 'express';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { scans } from '../db/schema.js';
import type { ObjectStore } from './index.js';

export type ImageVariant = 'image' | 'thumb';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function computeSig(secret: string, scanId: string, variant: string, exp: number): string {
  return createHmac('sha256', secret).update(`${scanId}.${variant}.${exp}`).digest('hex');
}

export function verifySignature(
  secret: string,
  scanId: string,
  variant: string,
  exp: unknown,
  sig: unknown,
  nowMs: number = Date.now(),
): boolean {
  if (typeof exp !== 'string' || typeof sig !== 'string' || !/^\d+$/.test(exp)) return false;
  const expN = Number(exp);
  const a = Buffer.from(computeSig(secret, scanId, variant, expN), 'hex');
  const b = Buffer.from(sig, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  return expN * 1000 >= nowMs;
}

/** URL firmada que vence en `ttlSeconds` (5 minutos por defecto). */
export function signImageUrl(
  config: Pick<Config, 'SIGNED_URL_SECRET' | 'PUBLIC_BASE_URL' | 'PORT'>,
  scanId: string,
  variant: ImageVariant,
  ttlSeconds = 300,
  nowMs: number = Date.now(),
): string {
  const exp = Math.floor(nowMs / 1000) + ttlSeconds;
  const sig = computeSig(config.SIGNED_URL_SECRET, scanId, variant, exp);
  const base = (config.PUBLIC_BASE_URL ?? `http://localhost:${config.PORT}`).replace(/\/+$/, '');
  return `${base}/files/${scanId}/${variant}?exp=${exp}&sig=${sig}`;
}

export interface FilesDeps {
  db: Db;
  store: ObjectStore;
  config: Pick<Config, 'SIGNED_URL_SECRET'>;
}

/** GET /files/:scanId/:variant (pública; la autorización es la firma). */
export function filesRouter({ db, store, config }: FilesDeps): Router {
  const router = Router();
  router.get('/files/:scanId/:variant', async (req, res, next) => {
    try {
      const { scanId, variant } = req.params;
      const { exp, sig } = req.query;
      if (!verifySignature(config.SIGNED_URL_SECRET, scanId, variant, exp, sig)) {
        res
          .status(403)
          .json({ error: { code: 'forbidden', message: 'Enlace inválido o vencido' } });
        return;
      }
      if ((variant !== 'image' && variant !== 'thumb') || !UUID_RE.test(scanId)) {
        res.status(404).json({ error: { code: 'not_found', message: 'Archivo no encontrado' } });
        return;
      }
      const [scan] = await db.select().from(scans).where(eq(scans.id, scanId)).limit(1);
      const key = variant === 'image' ? scan?.imageKey : scan?.thumbKey;
      if (!scan || scan.deletedAt || !key || !(await store.exists(key))) {
        res.status(404).json({ error: { code: 'not_found', message: 'Archivo no encontrado' } });
        return;
      }
      const data = await store.get(key);
      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', 'private, max-age=300');
      res.send(data);
    } catch (err) {
      next(err);
    }
  });
  return router;
}

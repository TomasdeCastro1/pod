import { and, eq } from 'drizzle-orm';
import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { HttpError, type AppDeps } from '../app.js';
import { scans } from '../db/schema.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { loadScan, requireMember } from '../middleware/requireMember.js';
import { signImageUrl } from '../storage/signedUrl.js';
import { createScan } from './create.js';
import { toScanDto } from './dto.js';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const URL_TTL_SECONDS = 300;

const bodySchema = z.object({
  client_id: z.uuid(),
  captured_at: z.iso.datetime({ offset: true }),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  replaces_scan_id: z.uuid().optional(),
});

const badRequest = (msg = 'Solicitud inválida') => new HttpError(400, 'bad_request', msg);

/** Quita los campos de texto vacíos para que cuenten como ausentes. */
function clean(body: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries((body ?? {}) as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim() === '') continue;
    out[k] = v;
  }
  return out;
}

function isBadImageError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : '';
  return /unsupported image|input (buffer|file)|corrupt|vips|bad seek|premature end/i.test(msg);
}

export function scansRouter(deps: AppDeps): Router {
  const { db, store, config } = deps;
  const router = Router();
  const auth = requireAuth(deps);

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  }).single('image');
  const receive: RequestHandler = (req, res, next) => {
    upload(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new HttpError(413, 'payload_too_large', 'La imagen supera los 5 MB'));
        }
        return next(badRequest());
      }
      next(err);
    });
  };

  router.post('/companies/:id/scans', auth, requireMember(deps), receive, async (req, res) => {
    if (!deps.scanQueue) throw new Error('scanQueue no configurada');
    const parsed = bodySchema.safeParse(clean(req.body));
    const file = req.file;
    if (!parsed.success || !file) throw badRequest();
    const body = parsed.data;
    // JPEG: FF D8 FF.
    if (file.buffer.length < 3 || file.buffer[0] !== 0xff || file.buffer[1] !== 0xd8) {
      throw badRequest('La imagen debe ser un JPEG');
    }
    const companyId = req.membership!.companyId;
    if (body.replaces_scan_id) {
      const [prev] = await db
        .select({ id: scans.id })
        .from(scans)
        .where(and(eq(scans.id, body.replaces_scan_id), eq(scans.companyId, companyId)));
      if (!prev) throw badRequest('El escaneo a reemplazar no existe en esta empresa');
    }
    let result;
    try {
      result = await createScan(
        db,
        store,
        {
          companyId,
          userId: req.user!.id,
          clientId: body.client_id,
          capturedAt: new Date(body.captured_at),
          lat: body.lat ?? null,
          lng: body.lng ?? null,
          image: file.buffer,
          replacesScanId: body.replaces_scan_id ?? null,
        },
        deps.scanQueue,
      );
    } catch (err) {
      if (isBadImageError(err)) throw badRequest('No se pudo leer la imagen');
      throw err;
    }
    if (result.duplicate) {
      // client_id global: si pertenece a otra empresa no se revela que existe.
      const [existing] = await db
        .select({ companyId: scans.companyId })
        .from(scans)
        .where(eq(scans.id, result.scanId));
      if (!existing || existing.companyId !== companyId) {
        throw new HttpError(404, 'not_found', 'No encontrado');
      }
    }
    res
      .status(result.duplicate ? 200 : 201)
      .json({ scan_id: result.scanId, status: result.status });
  });

  router.get('/scans/:id', auth, loadScan(deps), (req, res) => {
    const scan = req.scan!;
    const thumbUrl =
      scan.thumbKey && !scan.deletedAt
        ? signImageUrl(config, scan.id, 'thumb', URL_TTL_SECONDS)
        : null;
    res.json(toScanDto(scan, thumbUrl));
  });

  for (const variant of ['image', 'thumb'] as const) {
    router.get(`/scans/:id/${variant}`, auth, loadScan(deps), (req, res) => {
      const scan = req.scan!;
      if (scan.deletedAt) throw new HttpError(404, 'not_found', 'No encontrado');
      const expiresAt = new Date(Date.now() + URL_TTL_SECONDS * 1000);
      res.json({
        url: signImageUrl(config, scan.id, variant, URL_TTL_SECONDS),
        expires_at: expiresAt.toISOString(),
      });
    });
  }

  return router;
}

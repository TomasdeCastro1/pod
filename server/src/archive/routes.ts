import { and, desc, eq, ilike, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { HttpError, type AppDeps } from '../app.js';
import { getCatalog } from '../catalog.js';
import { auditLog, scans, users } from '../db/schema.js';
import { effectiveValue } from '../db/scans.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { loadScan, requireAdmin, requireMember } from '../middleware/requireMember.js';
import { QR_KEYS, toScanDto } from '../scans/dto.js';
import { signImageUrl } from '../storage/signedUrl.js';

type ScanRow = typeof scans.$inferSelect;

const THUMB_TTL_SECONDS = 300;
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
export const CSV_MAX_ROWS = 10_000;
const TZ = 'America/Montevideo';
const CONFORMIDAD = ['completa', 'firma_sola', 'dudosa', 'sin_firma'] as const;
type Conformidad = (typeof CONFORMIDAD)[number];

const badRequest = (msg = 'Solicitud inválida') => new HttpError(400, 'bad_request', msg);

// ---------- Filtros ----------

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const listOf = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : [v]).flatMap((s) => s.split(',')).filter(Boolean));

const filtersSchema = z.object({
  q: z.string().trim().max(200).optional(),
  type: z.enum(['factura', 'devolucion', 'otro']).optional(),
  conformidad: listOf.pipe(z.array(z.enum(CONFORMIDAD))).optional(),
  revisar: z.enum(['true', 'false']).optional(),
  from: dateStr.optional(),
  to: dateStr.optional(),
});
const listSchema = filtersSchema.extend({
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  cursor: z.string().max(200).optional(),
});

const DOC_TYPES = {
  factura: ['factura_emitida', 'nota_credito_emitida'],
  devolucion: ['devolucion_cliente'],
  otro: ['otro', 'no_reconocido'],
} as const;

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function buildWhere(companyId: string, f: z.infer<typeof filtersSchema>): SQL[] {
  const conds: SQL[] = [eq(scans.companyId, companyId), isNull(scans.deletedAt)];
  if (f.q) {
    const p = `%${escapeLike(f.q)}%`;
    conds.push(
      or(
        ilike(scans.clienteNombre, p),
        ilike(scans.numero, p),
        ilike(scans.clienteRut, p),
        ilike(scans.selloTexto, p),
        ilike(scans.local, p),
      )!,
    );
  }
  if (f.type) conds.push(inArray(scans.docType, [...DOC_TYPES[f.type]]));
  if (f.conformidad?.length) conds.push(inArray(scans.conformidadNivel, f.conformidad));
  if (f.revisar === 'true') conds.push(eq(scans.status, 'revisar'));
  // Fechas de captura inclusivas, día calendario de Uruguay.
  if (f.from) {
    conds.push(sql`${scans.capturedAt} >= (${f.from}::timestamp AT TIME ZONE ${TZ})`);
  }
  if (f.to) {
    conds.push(sql`${scans.capturedAt} < ((${f.to}::date + 1)::timestamp AT TIME ZONE ${TZ})`);
  }
  return conds;
}

function parseFilters<T extends z.ZodType>(schema: T, query: unknown): z.infer<T> {
  const parsed = schema.safeParse(query);
  if (!parsed.success) throw badRequest();
  const d = parsed.data as { from?: string; to?: string };
  for (const k of ['from', 'to'] as const) {
    const v = d[k];
    if (v && Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw badRequest('Fecha inválida');
  }
  if (d.from && d.to && d.from > d.to) throw badRequest('El rango de fechas está invertido');
  return parsed.data;
}

// ---------- Cursor ----------

function encodeCursor(row: Pick<ScanRow, 'capturedAt' | 'id'>): string {
  return Buffer.from(`${row.capturedAt.toISOString()}|${row.id}`).toString('base64url');
}

function decodeCursor(cursor: string): { at: Date; id: string } {
  const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const at = new Date(iso ?? '');
  if (!iso || !id || Number.isNaN(at.getTime()) || !z.uuid().safeParse(id).success) {
    throw badRequest('Cursor inválido');
  }
  return { at, id };
}

// ---------- CSV ----------

const CSV_BOM = '﻿';
const SEP = ';';

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s: string;
  if (typeof v === 'number') s = String(v).replace('.', ',');
  else if (typeof v === 'boolean') s = v ? 'sí' : 'no';
  else if (typeof v === 'object') s = JSON.stringify(v);
  else s = String(v);
  // Evita que Excel interprete texto como fórmula.
  if (typeof v === 'string' && /^[=+@\t\r]/.test(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function effective(scan: ScanRow, key: string): unknown {
  const v = effectiveValue(scan, key);
  return v === undefined ? scan.qrData?.[key] : v;
}

/** Decimal con coma para el total (numeric llega como texto). */
const totalCell = (scan: ScanRow): unknown => {
  const v = effective(scan, 'total') ?? scan.total;
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
};

const montevideoStamp = (d: Date) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ,
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(d);

const montevideoDay = (d: Date) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, dateStyle: 'short' }).format(d);

// ---------- Correcciones ----------

const patchSchema = z
  .object({
    corrections: z.record(z.string().max(100), z.unknown()).optional(),
    reviewed: z.boolean().optional(),
  })
  .strict()
  .refine((b) => b.corrections !== undefined || b.reviewed !== undefined);

/** clave de corrección -> columna de búsqueda que se mantiene con el valor efectivo. */
const SEARCH_COLUMNS = {
  cliente_rut: 'clienteRut',
  cliente_nombre: 'clienteNombre',
  local: 'local',
  numero: 'numero',
  serie: 'serie',
  fecha_documento: 'fechaDocumento',
  total: 'total',
  conformidad_nivel: 'conformidadNivel',
  sello_texto: 'selloTexto',
} as const;

function searchColumnValue(key: keyof typeof SEARCH_COLUMNS, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw badRequest(`El valor de ${key} debe ser texto o número`);
  }
  const s = String(value).trim();
  if (s === '') return null;
  if (key === 'conformidad_nivel') {
    if (!CONFORMIDAD.includes(s as Conformidad)) throw badRequest('Conformidad inválida');
  }
  if (key === 'total') {
    const n = Number(s.replace(',', '.'));
    if (!Number.isFinite(n) || Math.abs(n) >= 1e10) throw badRequest('Total inválido');
    return n.toFixed(2);
  }
  return s;
}

export function archiveRouter(deps: AppDeps): Router {
  const { db, config } = deps;
  const router = Router();
  const auth = requireAuth(deps);

  const dto = (scan: ScanRow) =>
    toScanDto(
      scan,
      scan.thumbKey && !scan.deletedAt
        ? signImageUrl(config, scan.id, 'thumb', THUMB_TTL_SECONDS)
        : null,
    );

  router.get('/companies/:id/scans', auth, requireMember(deps), async (req, res) => {
    const q = parseFilters(listSchema, req.query);
    const conds = buildWhere(req.membership!.companyId, q);
    if (q.cursor) {
      const { at, id } = decodeCursor(q.cursor);
      conds.push(or(lt(scans.capturedAt, at), and(eq(scans.capturedAt, at), lt(scans.id, id)))!);
    }
    const rows = await db
      .select()
      .from(scans)
      .where(and(...conds))
      .orderBy(desc(scans.capturedAt), desc(scans.id))
      .limit(q.limit + 1);
    const page = rows.slice(0, q.limit);
    res.json({
      items: page.map(dto),
      next_cursor: rows.length > q.limit ? encodeCursor(page[page.length - 1]!) : null,
    });
  });

  // CSV para Excel en español: UTF-8 con BOM, separador «;» y decimales con coma.
  router.get('/companies/:id/scans.csv', auth, requireMember(deps), async (req, res) => {
    const f = parseFilters(filtersSchema, req.query);
    const rows = await db
      .select({ scan: scans, scannedBy: users.nombre, scannedByEmail: users.email })
      .from(scans)
      .leftJoin(users, eq(users.id, scans.userId))
      .where(and(...buildWhere(req.membership!.companyId, f)))
      .orderBy(desc(scans.capturedAt), desc(scans.id))
      .limit(CSV_MAX_ROWS);

    const optional = (await getCatalog(db)).filter((c) => !c.isBase);
    const hasValue = (v: unknown) => v !== undefined && v !== null && v !== '';
    const optCols = optional.filter((c) => rows.some((r) => hasValue(effective(r.scan, c.key))));

    const header = [
      'Fecha de captura',
      'Tipo',
      'Serie',
      'Número',
      'Fecha del documento',
      'RUT del cliente',
      'Cliente',
      'Local',
      'Total',
      'Conformidad',
      'A revisar',
      'Revisado',
      'Escaneado por',
      ...optCols.map((c) => c.label),
    ];

    res.status(200);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="comprobantes-${montevideoDay(new Date())}.csv"`,
    );
    res.write(CSV_BOM + header.map(csvCell).join(SEP) + '\r\n');
    for (const { scan, scannedBy, scannedByEmail } of rows) {
      const cells: unknown[] = [
        montevideoStamp(scan.capturedAt),
        scan.docType,
        effective(scan, 'serie') ?? scan.serie,
        effective(scan, 'numero') ?? scan.numero,
        effective(scan, 'fecha_documento') ?? scan.fechaDocumento,
        effective(scan, 'cliente_rut') ?? scan.clienteRut,
        effective(scan, 'cliente_nombre') ?? scan.clienteNombre,
        effective(scan, 'local') ?? scan.local,
        totalCell(scan),
        effective(scan, 'conformidad_nivel') ?? scan.conformidadNivel,
        scan.status === 'revisar' ? 'sí' : 'no',
        scan.reviewedAt ? 'sí' : 'no',
        scannedBy ?? scannedByEmail,
        ...optCols.map((c) => effective(scan, c.key)),
      ];
      res.write(cells.map(csvCell).join(SEP) + '\r\n');
    }
    res.end();
  });

  router.patch('/scans/:id', auth, loadScan(deps), async (req, res) => {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest();
    const { corrections: incoming, reviewed } = parsed.data;
    const userId = req.user!.id;

    const updated = await db.transaction(async (tx) => {
      const [scan] = await tx.select().from(scans).where(eq(scans.id, req.scan!.id)).for('update');
      if (!scan || scan.deletedAt) throw new HttpError(404, 'not_found', 'No encontrado');

      const set: Partial<typeof scans.$inferInsert> = {};
      const detail: Record<string, unknown> = { scan_id: scan.id };

      if (incoming) {
        const allowed = new Set<string>([...(scan.fieldsRequested ?? []), ...QR_KEYS]);
        const next: Record<string, unknown> = { ...(scan.corrections ?? {}) };
        const changes: Record<string, { before: unknown; after: unknown }> = {};
        for (const [key, value] of Object.entries(incoming)) {
          if (!allowed.has(key)) throw badRequest(`Campo no permitido: ${key}`);
          if (value === undefined) throw badRequest();
          const before = effective(scan, key) ?? null;
          if (value === null) delete next[key];
          else next[key] = value;
          const probe = { extracted: scan.extracted, corrections: next };
          const after = effectiveValue(probe, key) ?? scan.qrData?.[key] ?? null;
          changes[key] = { before, after };
          if (key in SEARCH_COLUMNS) {
            const k = key as keyof typeof SEARCH_COLUMNS;
            (set as Record<string, unknown>)[SEARCH_COLUMNS[k]] = searchColumnValue(k, after);
          }
        }
        if (JSON.stringify(next).length > 100_000)
          throw badRequest('Correcciones demasiado grandes');
        set.corrections = Object.keys(next).length ? next : null;
        detail.changes = changes;
      }
      if (reviewed !== undefined) {
        set.reviewedBy = reviewed ? userId : null;
        set.reviewedAt = reviewed ? new Date() : null;
        detail.reviewed = { before: scan.reviewedAt !== null, after: reviewed };
      }

      const [row] = await tx.update(scans).set(set).where(eq(scans.id, scan.id)).returning();
      await tx.insert(auditLog).values({
        companyId: scan.companyId,
        userId,
        action: incoming ? 'scan.correct' : 'scan.review',
        detail,
      });
      return row!;
    });
    res.json(dto(updated));
  });

  router.delete('/scans/:id', auth, loadScan(deps), requireAdmin, async (req, res) => {
    const scan = req.scan!;
    if (scan.deletedAt) throw new HttpError(404, 'not_found', 'No encontrado');
    // El escaneo sigue contando para el uso (billing no filtra por deleted_at).
    await db.transaction(async (tx) => {
      await tx.update(scans).set({ deletedAt: new Date() }).where(eq(scans.id, scan.id));
      await tx.insert(auditLog).values({
        companyId: scan.companyId,
        userId: req.user!.id,
        action: 'scan.delete',
        detail: { scan_id: scan.id },
      });
    });
    res.status(204).end();
  });

  return router;
}

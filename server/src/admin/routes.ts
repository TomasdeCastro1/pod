import { createHash, timingSafeEqual } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { HttpError, type AppDeps } from '../app.js';
import { fieldCatalog, modelPrices, priceSettings } from '../db/schema.js';
import { BILLABLE_SQL, BILLING_MONTH_SQL } from '../usage/routes.js';
import { currentMonth, isMonth } from '../usage/month.js';

const sha = (s: string) => createHash('sha256').update(s).digest();

/** `Authorization: Bearer <ADMIN_TOKEN>`, comparado en tiempo constante. */
export function requireAdminToken(adminToken: string): RequestHandler {
  const expected = adminToken ? sha(adminToken) : null;
  return (req, _res, next) => {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
    if (!expected || !m || !timingSafeEqual(sha(m[1]!), expected)) {
      throw new HttpError(401, 'unauthorized', 'No autorizado');
    }
    next();
  };
}

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, 'bad_request', 'Solicitud inválida');
  return r.data;
}

const usd = z.number().finite().min(0).max(1_000_000);
const catalogSchema = z
  .object({
    price_per_1000_usd: usd.optional(),
    instruction: z.string().min(1).max(2000).optional(),
    active: z.boolean().optional(),
    label: z.string().trim().min(1).max(100).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0);
const priceSettingsSchema = z.object({ base_price_per_1000_usd: usd });
const modelPriceSchema = z.object({ input_per_mtok_usd: usd, output_per_mtok_usd: usd });

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

export function adminRouter(deps: AppDeps): Router {
  const { db } = deps;
  const router = Router();
  router.use(requireAdminToken(deps.config.ADMIN_TOKEN));

  router.get('/usage', async (req, res) => {
    const q = req.query.month;
    if (q !== undefined && !isMonth(q)) {
      throw new HttpError(400, 'bad_request', 'month debe ser AAAA-MM');
    }
    const month = q ?? currentMonth();
    // Costo IA: todos los escaneos del mes (también errores y borrados: el costo fue real).
    // Imágenes, importe, % escalado y % a revisar: solo los facturables.
    const result = await db.execute<{
      company_id: string;
      nombre: string;
      images: number;
      escalated: number;
      revisar: number;
      snapshots: string;
      ai_cost: string;
    }>(sql`select c.id as company_id, c.nombre,
        count(*) filter (where ${BILLABLE_SQL})::int as images,
        count(*) filter (where ${BILLABLE_SQL} and s.escalated)::int as escalated,
        count(*) filter (where s.status = 'revisar')::int as revisar,
        coalesce(sum(s.price_per_1000_snapshot) filter (where ${BILLABLE_SQL}), 0)::text as snapshots,
        coalesce(sum(s.ai_cost_usd), 0)::text as ai_cost
      from scans s join companies c on c.id = s.company_id
      where ${BILLING_MONTH_SQL} = ${month}
      group by c.id, c.nombre
      order by c.nombre`);
    const companies = result.rows.map((r) => {
      const amount = round(Number(r.snapshots) / 1000, 2);
      const cost = round(Number(r.ai_cost), 6);
      return {
        company_id: r.company_id,
        nombre: r.nombre,
        images: r.images,
        ai_cost_usd: cost,
        escalated_pct: r.images ? round((r.escalated / r.images) * 100, 1) : 0,
        revisar_pct: r.images ? round((r.revisar / r.images) * 100, 1) : 0,
        amount_usd: amount,
        margin_usd: round(amount - cost, 2),
      };
    });
    res.json({ month, companies });
  });

  router.put('/field-catalog/:key', async (req, res) => {
    const b = parse(catalogSchema, req.body);
    const [row] = await db
      .update(fieldCatalog)
      .set({
        ...(b.price_per_1000_usd !== undefined && {
          pricePer1000Usd: String(b.price_per_1000_usd),
        }),
        ...(b.instruction !== undefined && { instruction: b.instruction }),
        ...(b.active !== undefined && { active: b.active }),
        ...(b.label !== undefined && { label: b.label }),
      })
      .where(eq(fieldCatalog.key, req.params.key!))
      .returning();
    if (!row) throw new HttpError(404, 'not_found', 'No encontrado');
    res.json({
      key: row.key,
      label: row.label,
      instruction: row.instruction,
      active: row.active,
      price_per_1000_usd: Number(row.pricePer1000Usd),
    });
  });

  router.put('/price-settings', async (req, res) => {
    const b = parse(priceSettingsSchema, req.body);
    const values = {
      basePricePer1000Usd: String(b.base_price_per_1000_usd),
      updatedAt: new Date(),
    };
    const [row] = await db
      .insert(priceSettings)
      .values({ id: 1, ...values })
      .onConflictDoUpdate({ target: priceSettings.id, set: values })
      .returning();
    res.json({ base_price_per_1000_usd: Number(row!.basePricePer1000Usd) });
  });

  router.put('/model-prices/:model', async (req, res) => {
    const b = parse(modelPriceSchema, req.body);
    const values = {
      inputPerMtokUsd: String(b.input_per_mtok_usd),
      outputPerMtokUsd: String(b.output_per_mtok_usd),
    };
    const model = req.params.model!;
    await db
      .insert(modelPrices)
      .values({ model, ...values })
      .onConflictDoUpdate({ target: modelPrices.model, set: values });
    res.json({
      model,
      input_per_mtok_usd: b.input_per_mtok_usd,
      output_per_mtok_usd: b.output_per_mtok_usd,
    });
  });

  return router;
}

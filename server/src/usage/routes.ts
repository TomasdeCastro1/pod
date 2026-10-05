import { sql } from 'drizzle-orm';
import { Router } from 'express';
import { monthlyAmount } from '@app/shared';
import { HttpError, type AppDeps } from '../app.js';
import { computePricePer1000 } from '../catalog.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireMember } from '../middleware/requireMember.js';
import { currentMonth, isMonth, lastMonths } from './month.js';

/**
 * Mes de facturación de un escaneo: fecha de subida en America/Montevideo.
 * Regla de facturable (§12): status listo/revisar, incluyendo los borrados (deleted_at);
 * los errores y los procesando no cuentan. (No hay isBillable compartido en scans/ todavía.)
 */
export const BILLING_MONTH_SQL = sql`to_char(uploaded_at at time zone 'America/Montevideo', 'YYYY-MM')`;
export const BILLABLE_SQL = sql`status in ('listo', 'revisar')`;

export function usageRouter(deps: AppDeps): Router {
  const { db } = deps;
  const router = Router();
  router.use(requireAuth(deps));

  router.get('/:id/usage', requireMember(deps), async (req, res) => {
    const companyId = req.membership!.companyId;
    const q = req.query.month;
    if (q !== undefined && !isMonth(q)) {
      throw new HttpError(400, 'bad_request', 'month debe ser AAAA-MM');
    }
    const month = q ?? currentMonth();
    const months = lastMonths(month, 6);
    const result = await db.execute<{ month: string; images: number; snapshots: string | null }>(
      sql`select ${BILLING_MONTH_SQL} as month, count(*)::int as images,
            coalesce(sum(price_per_1000_snapshot), 0)::text as snapshots
          from scans
          where company_id = ${companyId} and ${BILLABLE_SQL}
            and ${BILLING_MONTH_SQL} between ${months[0]} and ${month}
          group by 1`,
    );
    const byMonth = new Map(result.rows.map((r) => [r.month, r]));
    const rowFor = (m: string) => {
      const r = byMonth.get(m);
      const sumSnap = r ? Number(r.snapshots) : 0;
      return { month: m, images: r?.images ?? 0, amount_usd: monthlyAmount([sumSnap]) };
    };
    const current = rowFor(month);
    res.json({
      month,
      images: current.images,
      price_per_1000_current: await computePricePer1000(db, companyId),
      amount_usd: current.amount_usd,
      history: months.map(rowFor),
    });
  });

  return router;
}

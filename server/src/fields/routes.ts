import { and, eq, inArray } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { HttpError, type AppDeps } from '../app.js';
import { computePricePer1000, getCompanyFields } from '../catalog.js';
import { auditLog, companyFields, priceSettings } from '../db/schema.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin, requireMember } from '../middleware/requireMember.js';

const putSchema = z.object({ enabled: z.array(z.string().max(100)).max(500) });

async function fieldsView(db: AppDeps['db'], companyId: string) {
  const [settings] = await db.select().from(priceSettings).where(eq(priceSettings.id, 1));
  if (!settings) throw new Error('price_settings sin cargar: correr npm run db:seed');
  const fields = await getCompanyFields(db, companyId); // ya viene por sort_order
  const groups: {
    name: string;
    fields: {
      key: string;
      label: string;
      doc_types: string[];
      is_base: boolean;
      enabled: boolean;
      price: number;
    }[];
  }[] = [];
  for (const f of fields) {
    let g = groups.find((x) => x.name === (f.isBase ? 'Incluido' : f.group));
    if (!g) {
      g = { name: f.isBase ? 'Incluido' : f.group, fields: [] };
      groups.push(g);
    }
    g.fields.push({
      key: f.key,
      label: f.label,
      doc_types: f.docTypes,
      is_base: f.isBase,
      enabled: f.enabled,
      price: f.isBase ? 0 : Number(f.pricePer1000Usd),
    });
  }
  // «Incluido» primero.
  groups.sort((a, b) => Number(b.name === 'Incluido') - Number(a.name === 'Incluido'));
  return {
    base_price: Number(settings.basePricePer1000Usd),
    currency: settings.currency,
    price_per_1000: await computePricePer1000(db, companyId),
    groups,
  };
}

export function fieldsRouter(deps: AppDeps): Router {
  const { db } = deps;
  const router = Router();
  router.use(requireAuth(deps));
  const member = requireMember(deps);

  router.get('/:id/fields', member, async (req, res) => {
    res.json(await fieldsView(db, req.membership!.companyId));
  });

  router.put('/:id/fields', member, requireAdmin, async (req, res) => {
    const parsed = putSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'bad_request', 'Solicitud inválida');
    const companyId = req.membership!.companyId;
    const requested = [...new Set(parsed.data.enabled)];
    const current = await getCompanyFields(db, companyId);
    const optional = new Set(current.filter((f) => !f.isBase).map((f) => f.key));
    const invalid = requested.filter((k) => !optional.has(k));
    if (invalid.length > 0) {
      throw new HttpError(400, 'invalid_fields', `Campos no válidos: ${invalid.join(', ')}`);
    }
    const before = current.filter((f) => !f.isBase && f.enabled).map((f) => f.key);
    const want = new Set(requested);
    const userId = req.user!.id;
    await db.transaction(async (tx) => {
      const keys = [...optional];
      if (keys.length > 0) {
        await tx
          .insert(companyFields)
          .values(
            keys.map((k) => ({
              companyId,
              fieldKey: k,
              enabled: want.has(k),
              updatedBy: userId,
              updatedAt: new Date(),
            })),
          )
          .onConflictDoNothing();
        for (const enabled of [true, false]) {
          const ks = keys.filter((k) => want.has(k) === enabled);
          if (ks.length === 0) continue;
          await tx
            .update(companyFields)
            .set({ enabled, updatedBy: userId, updatedAt: new Date() })
            .where(
              and(eq(companyFields.companyId, companyId), inArray(companyFields.fieldKey, ks)),
            );
        }
      }
      await tx.insert(auditLog).values({
        companyId,
        userId,
        action: 'fields.update',
        detail: { before, after: requested },
      });
    });
    res.json(await fieldsView(db, companyId));
  });

  return router;
}

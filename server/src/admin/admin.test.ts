import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { auditLog, companies, fieldCatalog, memberships, scans } from '../db/schema.js';
import { seed } from '../db/seed/index.js';
import { currentMonth, lastMonths } from '../usage/month.js';
import { createTestApp, testConfig, type TestCtx } from '../test/helpers.js';

const TOKEN = 'admin-secret';
let ctx: TestCtx;
let ana: { id: string; auth: string };
let beto: { id: string; auth: string };
let companyId: string;

beforeEach(async () => {
  ctx = await createTestApp({ config: { ...testConfig, ADMIN_TOKEN: TOKEN } });
  await seed(ctx.db);
  ana = await ctx.createUser('ana@example.com');
  beto = await ctx.createUser('beto@example.com');
  const [c] = await ctx.db
    .insert(companies)
    .values({ nombre: 'Acme', rut: '210000000012', inviteCode: 'ABC123' })
    .returning();
  companyId = c!.id;
  await ctx.db.insert(memberships).values([
    { userId: ana.id, companyId, role: 'admin' },
    { userId: beto.id, companyId, role: 'miembro' },
  ]);
});
afterEach(async () => {
  await ctx.close();
});

const put = (auth: string, enabled: string[]) =>
  request(ctx.app)
    .put(`/companies/${companyId}/fields`)
    .set('Authorization', auth)
    .send({ enabled });

describe('campos', () => {
  it('GET agrupa con Incluido primero, solo activos', async () => {
    const r = await request(ctx.app)
      .get(`/companies/${companyId}/fields`)
      .set('Authorization', beto.auth);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ base_price: 40, currency: 'USD', price_per_1000: 40 });
    expect(r.body.groups[0].name).toBe('Incluido');
    expect(r.body.groups[0].fields.every((f: { is_base: boolean }) => f.is_base)).toBe(true);
    expect(r.body.groups.map((g: { name: string }) => g.name)).toContain('Pago y referencias');
  });

  it('activar vencimiento, OC y plazo de retiro da 45 y deja auditoría', async () => {
    const keys = ['fecha_vencimiento', 'orden_compra', 'dev_plazo_retiro_dias'];
    const r = await put(ana.auth, keys);
    expect(r.status).toBe(200);
    expect(r.body.price_per_1000).toBe(45);
    const again = await request(ctx.app)
      .get(`/companies/${companyId}/fields`)
      .set('Authorization', beto.auth);
    expect(again.body.price_per_1000).toBe(45);
    const log = await ctx.db.select().from(auditLog).where(eq(auditLog.action, 'fields.update'));
    expect(log[0]!.detail).toEqual({ before: [], after: keys });
    // Reemplaza el conjunto
    const r2 = await put(ana.auth, ['orden_compra']);
    expect(r2.body.price_per_1000).toBe(41);
  });

  it('miembro no puede guardar (403); base o desconocida dan 400', async () => {
    expect((await put(beto.auth, ['orden_compra'])).status).toBe(403);
    const base = await ctx.db.select().from(fieldCatalog).where(eq(fieldCatalog.isBase, true));
    expect((await put(ana.auth, [base[0]!.key])).status).toBe(400);
    expect((await put(ana.auth, ['nope'])).status).toBe(400);
  });
});

describe('uso', () => {
  const mk = (
    status: 'listo' | 'revisar' | 'error' | 'procesando',
    price: string | null,
    uploadedAt: Date,
    extra: Partial<typeof scans.$inferInsert> = {},
  ) =>
    ctx.db.insert(scans).values({
      clientId: crypto.randomUUID(),
      companyId,
      userId: ana.id,
      capturedAt: uploadedAt,
      uploadedAt,
      status,
      pricePer1000Snapshot: price,
      ...extra,
    });

  it('cuenta listo/revisar (incluso borrados), no errores; usa zona Montevideo', async () => {
    const now = new Date();
    await mk('listo', '40', now);
    await mk('revisar', '45', now);
    await mk('listo', '45', now, { deletedAt: now });
    await mk('error', '40', now);
    await mk('procesando', '40', now);
    const month = currentMonth();
    const [prev] = lastMonths(month, 2) as [string, string];
    const [py, pm] = prev.split('-').map(Number) as [number, number];
    await mk('listo', '40', new Date(Date.UTC(py, pm - 1, 15, 12)));
    // 02:00 UTC del día 1 de este mes sigue siendo el mes anterior en Montevideo (UTC-3)
    const [y, m] = month.split('-').map(Number) as [number, number];
    await mk('listo', '40', new Date(Date.UTC(y, m - 1, 1, 2)));

    const r = await request(ctx.app)
      .get(`/companies/${companyId}/usage`)
      .set('Authorization', beto.auth);
    expect(r.status).toBe(200);
    expect(r.body.month).toBe(month);
    expect(r.body.images).toBe(3);
    expect(r.body.amount_usd).toBe(0.13);
    expect(r.body.price_per_1000_current).toBe(40);
    expect(r.body.history).toHaveLength(6);
    expect(r.body.history[5]).toEqual({ month, images: 3, amount_usd: 0.13 });
    expect(r.body.history[4]).toEqual({ month: prev, images: 2, amount_usd: 0.08 });
    expect(JSON.stringify(r.body)).not.toMatch(/cost/i);

    const bad = await request(ctx.app)
      .get(`/companies/${companyId}/usage?month=2026-13`)
      .set('Authorization', beto.auth);
    expect(bad.status).toBe(400);
    const outsider = await ctx.createUser('x@example.com');
    const no = await request(ctx.app)
      .get(`/companies/${companyId}/usage`)
      .set('Authorization', outsider.auth);
    expect(no.status).toBe(404);
  });

  it('admin/usage calcula costo, porcentajes y margen', async () => {
    const now = new Date();
    await mk('listo', '40', now, { aiCostUsd: '0.01', escalated: true });
    await mk('revisar', '60', now, { aiCostUsd: '0.02' });
    await mk('error', null, now, { aiCostUsd: '0.005' });
    const r = await request(ctx.app).get('/admin/usage').set('Authorization', `Bearer ${TOKEN}`);
    expect(r.status).toBe(200);
    expect(r.body.companies).toEqual([
      {
        company_id: companyId,
        nombre: 'Acme',
        images: 2,
        ai_cost_usd: 0.035,
        escalated_pct: 50,
        revisar_pct: 50,
        amount_usd: 0.1,
        margin_usd: 0.07,
      },
    ]);
  });
});

describe('admin', () => {
  it('rechaza sin token o con token incorrecto', async () => {
    for (const h of [undefined, 'Bearer nope', TOKEN, 'Bearer ']) {
      const req = request(ctx.app).put('/admin/price-settings');
      if (h !== undefined) req.set('Authorization', h);
      expect((await req.send({ base_price_per_1000_usd: 1 })).status).toBe(401);
    }
    expect((await request(ctx.app).get('/admin/usage')).status).toBe(401);
  });

  it('edita catálogo, precio base y precios de modelo', async () => {
    const auth = `Bearer ${TOKEN}`;
    const c = await request(ctx.app)
      .put('/admin/field-catalog/orden_compra')
      .set('Authorization', auth)
      .send({ price_per_1000_usd: 3, active: true });
    expect(c.status).toBe(200);
    expect(c.body.price_per_1000_usd).toBe(3);
    expect(
      (
        await request(ctx.app)
          .put('/admin/field-catalog/nope')
          .set('Authorization', auth)
          .send({ active: false })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(ctx.app)
          .put('/admin/field-catalog/orden_compra')
          .set('Authorization', auth)
          .send({})
      ).status,
    ).toBe(400);
    const p = await request(ctx.app)
      .put('/admin/price-settings')
      .set('Authorization', auth)
      .send({ base_price_per_1000_usd: 50 });
    expect(p.body.base_price_per_1000_usd).toBe(50);
    const m = await request(ctx.app)
      .put('/admin/model-prices/claude-x')
      .set('Authorization', auth)
      .send({ input_per_mtok_usd: 1.5, output_per_mtok_usd: 7 });
    expect(m.status).toBe(200);
    await request(ctx.app)
      .put(`/companies/${companyId}/fields`)
      .set('Authorization', ana.auth)
      .send({ enabled: ['orden_compra'] });
    const f = await request(ctx.app)
      .get(`/companies/${companyId}/fields`)
      .set('Authorization', ana.auth);
    expect(f.body.price_per_1000).toBe(53);
  });
});

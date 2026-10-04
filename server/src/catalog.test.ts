import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  computePricePer1000,
  getCatalog,
  getCompanyFields,
  getRequestedFields,
} from './catalog.js';
import { companies, companyFields, fieldCatalog, modelPrices, priceSettings } from './db/schema.js';
import { seed } from './db/seed/index.js';
import { createTestDb } from './db/test-db.js';

async function setup() {
  const { db, client } = await createTestDb();
  await seed(db);
  const [company] = await db
    .insert(companies)
    .values({ nombre: 'ACME', rut: '210000000012', inviteCode: 'ABC123' })
    .returning();
  return { db, client, companyId: company!.id };
}

async function enable(
  db: Awaited<ReturnType<typeof setup>>['db'],
  companyId: string,
  keys: string[],
) {
  if (keys.length === 0) return;
  await db
    .insert(companyFields)
    .values(keys.map((fieldKey) => ({ companyId, fieldKey, enabled: true })));
}

describe('seed', () => {
  it('carga 15 base y 27 opcionales; los opcionales suman 36', async () => {
    const { db, client } = await setup();
    const catalog = await getCatalog(db);
    const base = catalog.filter((f) => f.isBase);
    const opt = catalog.filter((f) => !f.isBase);
    expect(base).toHaveLength(15);
    expect(opt).toHaveLength(27);
    expect(opt.reduce((a, f) => a + Number(f.pricePer1000Usd), 0)).toBe(36);
    expect(catalog.map((f) => f.sortOrder)).toEqual(catalog.map((_, i) => i + 1));
    expect(catalog.find((f) => f.key === 'tipo_cfe')?.source).toBe('qr');
    await client.close();
  });

  it('aplica la fórmula de estimaciones de la decisión 5', async () => {
    const { db, client } = await setup();
    const [f] = await db.select().from(fieldCatalog).where(eq(fieldCatalog.key, 'forma_pago'));
    expect(f?.estInTokens).toBe(Math.ceil('- forma_pago: contado o credito'.length / 4));
    expect(f?.estOutTokens).toBe(Math.max(3, Math.round((70 - f!.estInTokens) / 5)));
    await client.close();
  });

  it('es idempotente y no pisa precios editados', async () => {
    const { db, client } = await setup();
    const count = async () => [
      (await db.select().from(fieldCatalog)).length,
      (await db.select().from(priceSettings)).length,
      (await db.select().from(modelPrices)).length,
    ];
    const first = await count();
    await db
      .update(fieldCatalog)
      .set({ pricePer1000Usd: '9', label: 'x' })
      .where(eq(fieldCatalog.key, 'iva'));
    await db.update(priceSettings).set({ basePricePer1000Usd: '50' });
    await seed(db);
    expect(await count()).toEqual(first);
    expect(first).toEqual([42, 1, 2]);
    const [iva] = await db.select().from(fieldCatalog).where(eq(fieldCatalog.key, 'iva'));
    expect(iva?.pricePer1000Usd).toBe('9.0000');
    expect(iva?.label).toBe('IVA');
    const [ps] = await db.select().from(priceSettings);
    expect(ps?.basePricePer1000Usd).toBe('50.0000');
    await client.close();
  });

  it('usa MODEL_SECONDARY para model_prices', async () => {
    const { db, client } = await setup();
    await seed(db, { modelSecondary: 'otro-modelo' });
    const models = (await db.select().from(modelPrices)).map((m) => m.model).sort();
    expect(models).toEqual(['claude-haiku-4-5-20251001', 'claude-sonnet-5-5', 'otro-modelo']);
    await client.close();
  });
});

describe('computePricePer1000', () => {
  it('sin opcionales: 40', async () => {
    const { db, client, companyId } = await setup();
    expect(await computePricePer1000(db, companyId)).toBe(40);
    await client.close();
  });

  it('con todos los opcionales: 76', async () => {
    const { db, client, companyId } = await setup();
    const catalog = await getCatalog(db);
    await enable(
      db,
      companyId,
      catalog.filter((f) => !f.isBase).map((f) => f.key),
    );
    expect(await computePricePer1000(db, companyId)).toBe(76);
    await client.close();
  });

  it('ejemplo de §12: 45', async () => {
    const { db, client, companyId } = await setup();
    await enable(db, companyId, ['fecha_vencimiento', 'orden_compra', 'dev_plazo_retiro_dias']);
    expect(await computePricePer1000(db, companyId)).toBe(45);
    await client.close();
  });

  it('ignora opcionales deshabilitados', async () => {
    const { db, client, companyId } = await setup();
    await db.insert(companyFields).values({ companyId, fieldKey: 'iva', enabled: false });
    expect(await computePricePer1000(db, companyId)).toBe(40);
    await client.close();
  });
});

describe('getCompanyFields / getRequestedFields', () => {
  it('marca enabled: base siempre, opcionales según la empresa', async () => {
    const { db, client, companyId } = await setup();
    await enable(db, companyId, ['iva']);
    const fields = await getCompanyFields(db, companyId);
    expect(fields).toHaveLength(42);
    expect(fields.filter((f) => f.enabled).map((f) => f.key)).toContain('iva');
    expect(fields.find((f) => f.key === 'moneda')?.enabled).toBe(false);
    expect(fields.filter((f) => f.isBase).every((f) => f.enabled)).toBe(true);
    await client.close();
  });

  it('filtra por tipo de documento', async () => {
    const { db, client, companyId } = await setup();
    await enable(db, companyId, ['iva', 'dev_motivo']);
    const fact = await getRequestedFields(db, companyId, 'factura');
    const dev = await getRequestedFields(db, companyId, 'devolucion');
    expect(fact).toContain('total');
    expect(fact).toContain('iva');
    expect(fact).not.toContain('dev_motivo');
    expect(fact).not.toContain('items');
    expect(dev).toContain('items');
    expect(dev).toContain('dev_motivo');
    expect(dev).not.toContain('total');
    expect(dev).not.toContain('iva');
    const all = await getRequestedFields(db, companyId, null);
    expect(all).toEqual(expect.arrayContaining(['total', 'items', 'iva', 'dev_motivo']));
    await client.close();
  });

  it('en facturas pide items solo si hay algún fact_item_* activo', async () => {
    const { db, client, companyId } = await setup();
    await enable(db, companyId, ['fact_item_codigo']);
    expect(await getRequestedFields(db, companyId, 'factura')).toContain('items');
    await client.close();
  });
});

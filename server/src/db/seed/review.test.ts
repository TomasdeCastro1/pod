import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isValidRut } from '@app/shared';
import { createApp } from '../../app.js';
import type { Db } from '../client.js';
import { companies, memberships, scans, users } from '../schema.js';
import { createTestDb } from '../test-db.js';
import { LocalStore } from '../../storage/index.js';
import { testConfig } from '../../test/helpers.js';
import { seed } from './index.js';
import { DEMO_COMPANY_RUT, seedReview } from './review.js';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let store: LocalStore;
beforeEach(async () => {
  ctx = await createTestDb();
  await seed(ctx.db);
  store = new LocalStore(await mkdtemp(join(tmpdir(), 'review-')));
});
afterEach(async () => {
  await ctx.client.close();
});

describe('seedReview', () => {
  it('crea usuario, empresa demo y escaneos; es idempotente', async () => {
    expect(isValidRut(DEMO_COMPANY_RUT)).toBe(true);
    const a = await seedReview(ctx.db, store, { email: 'Review@Example.com' });
    const b = await seedReview(ctx.db, store, { email: 'review@example.com' });
    expect(b).toEqual(a);
    expect(a.scans).toBeGreaterThanOrEqual(10);
    expect(a.scans).toBeLessThanOrEqual(15);
    expect(await ctx.db.select().from(users)).toHaveLength(1);
    expect(await ctx.db.select().from(companies)).toHaveLength(1);
    expect(await ctx.db.select().from(memberships)).toHaveLength(1);
    const rows = await ctx.db.select().from(scans).where(eq(scans.companyId, a.companyId));
    expect(new Set(rows.map((r) => r.docType)).size).toBeGreaterThan(2);
    expect(new Set(rows.map((r) => r.conformidadNivel)).size).toBeGreaterThan(2);
    for (const r of rows) {
      expect((await store.get(r.imageKey!)).length).toBeGreaterThan(0);
      expect((await store.get(r.thumbKey!)).length).toBeGreaterThan(0);
    }
  });

  it('el revisor entra con el código fijo y ve la empresa demo', async () => {
    const config = { ...testConfig, REVIEW_EMAIL: 'review@example.com', REVIEW_CODE: '424242' };
    await seedReview(ctx.db, store, { email: 'review@example.com' });
    const app = createApp({ db: ctx.db as unknown as Db, store, config });
    const res = await request(app)
      .post('/auth/verify')
      .send({ email: 'review@example.com', code: '424242' });
    expect(res.status).toBe(200);
    expect(res.body.companies).toHaveLength(1);
    expect(res.body.companies[0].nombre).toBe('Empresa Demo');
    const list = await request(app)
      .get(`/companies/${res.body.companies[0].id}/scans`)
      .set('Authorization', `Bearer ${res.body.token}`);
    expect(list.status).toBe(200);
  });
});

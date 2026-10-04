import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import express, { Router, type ErrorRequestHandler } from 'express';
import { companies, memberships, scans } from '../db/schema.js';
import { createTestApp, type TestCtx } from '../test/helpers.js';
import { requireAuth } from './requireAuth.js';
import { testConfig } from '../test/helpers.js';
import { loadScan } from './requireMember.js';

let ctx: TestCtx;
beforeEach(async () => {
  ctx = await createTestApp();
});
afterEach(async () => {
  await ctx.close();
});

describe('loadScan', () => {
  it('404 si el escaneo es de otra empresa o no existe; carga si es miembro', async () => {
    const ana = await ctx.createUser('ana@example.com');
    const beto = await ctx.createUser('beto@example.com');
    const [c] = await ctx.db
      .insert(companies)
      .values({ nombre: 'A', rut: '219419590017', inviteCode: 'AAAAAA' })
      .returning();
    await ctx.db.insert(memberships).values({ userId: ana.id, companyId: c!.id, role: 'miembro' });
    const [s] = await ctx.db
      .insert(scans)
      .values({ companyId: c!.id, userId: ana.id, clientId: 'c1', capturedAt: new Date() })
      .returning();

    // Router de prueba montado aparte (la app real monta /scans en tareas siguientes).
    const app = express();
    const r = Router();
    r.use(requireAuth({ db: ctx.db, config: testConfig }));
    r.get('/:id', loadScan(ctx), (req, res) => {
      res.json({ id: req.scan!.id, role: req.membership!.role });
    });
    app.use('/scans', r);
    const onError: ErrorRequestHandler = (err: { status?: number }, _req, res, next) => {
      void next;
      res.status(err.status ?? 500).end();
    };
    app.use(onError);

    const ok = await request(app).get(`/scans/${s!.id}`).set('Authorization', ana.auth);
    expect(ok.body).toEqual({ id: s!.id, role: 'miembro' });
    expect((await request(app).get(`/scans/${s!.id}`).set('Authorization', beto.auth)).status).toBe(
      404,
    );
    expect(
      (
        await request(app)
          .get('/scans/00000000-0000-4000-8000-000000000000')
          .set('Authorization', ana.auth)
      ).status,
    ).toBe(404);
  });
});

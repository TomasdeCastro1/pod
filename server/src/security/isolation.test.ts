import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { companies, memberships, scans } from '../db/schema.js';
import { seed } from '../db/seed/index.js';
import { createTestApp, type TestCtx } from '../test/helpers.js';

/**
 * Auditoría de autorización (T6.3, spec §11): un usuario que NO es miembro de la empresa recibe
 * 404 (nunca 403, para no revelar que existe) en cada ruta que depende de una empresa o escaneo.
 * La tabla ruta -> test está en este archivo: cada fila es un caso de `routes`.
 */
let ctx: TestCtx;
let ana: { id: string; auth: string };
let outsider: { id: string; auth: string };
let companyId: string;
let scanId: string;

beforeEach(async () => {
  ctx = await createTestApp();
  await seed(ctx.db);
  ana = await ctx.createUser('ana@example.com');
  outsider = await ctx.createUser('otro@example.com');
  const [c] = await ctx.db
    .insert(companies)
    .values({ nombre: 'Acme', rut: '210000000012', inviteCode: 'ABC123' })
    .returning();
  companyId = c!.id;
  await ctx.db.insert(memberships).values({ userId: ana.id, companyId, role: 'admin' });
  const [s] = await ctx.db
    .insert(scans)
    .values({
      clientId: 'iso-1',
      companyId,
      userId: ana.id,
      capturedAt: new Date(),
      status: 'listo',
      docType: 'factura_emitida',
      fieldsRequested: ['total'],
      extracted: { total: 1 },
    })
    .returning();
  scanId = s!.id;
});
afterEach(async () => {
  await ctx.close();
});

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
interface Case {
  method: Method;
  route: string;
  path: () => string;
  body?: Record<string, unknown>;
}

const routes: Case[] = [
  {
    method: 'patch',
    route: 'PATCH /companies/:id',
    path: () => `/companies/${companyId}`,
    body: { nombre: 'X' },
  },
  {
    method: 'post',
    route: 'POST /companies/:id/invite-code',
    path: () => `/companies/${companyId}/invite-code`,
  },
  {
    method: 'get',
    route: 'GET /companies/:id/members',
    path: () => `/companies/${companyId}/members`,
  },
  {
    method: 'patch',
    route: 'PATCH /companies/:id/members/:userId',
    path: () => `/companies/${companyId}/members/${ana.id}`,
    body: { role: 'miembro' },
  },
  {
    method: 'delete',
    route: 'DELETE /companies/:id/members/:userId',
    path: () => `/companies/${companyId}/members/${ana.id}`,
  },
  {
    method: 'get',
    route: 'GET /companies/:id/fields',
    path: () => `/companies/${companyId}/fields`,
  },
  {
    method: 'put',
    route: 'PUT /companies/:id/fields',
    path: () => `/companies/${companyId}/fields`,
    body: { enabled: [] },
  },
  {
    method: 'post',
    route: 'POST /companies/:id/scans',
    path: () => `/companies/${companyId}/scans`,
  },
  { method: 'get', route: 'GET /scans/:id', path: () => `/scans/${scanId}` },
  { method: 'get', route: 'GET /companies/:id/scans', path: () => `/companies/${companyId}/scans` },
  {
    method: 'get',
    route: 'GET /companies/:id/scans.csv',
    path: () => `/companies/${companyId}/scans.csv`,
  },
  {
    method: 'patch',
    route: 'PATCH /scans/:id',
    path: () => `/scans/${scanId}`,
    body: { reviewed: true },
  },
  { method: 'delete', route: 'DELETE /scans/:id', path: () => `/scans/${scanId}` },
  { method: 'get', route: 'GET /scans/:id/image', path: () => `/scans/${scanId}/image` },
  { method: 'get', route: 'GET /scans/:id/thumb', path: () => `/scans/${scanId}/thumb` },
  {
    method: 'get',
    route: 'GET /companies/:id/usage',
    path: () => `/companies/${companyId}/usage?month=2026-09`,
  },
];

describe('aislamiento entre empresas (404 a un no miembro)', () => {
  it.each(routes)('$route', async (c) => {
    const res = await request(ctx.app)
      [c.method](c.path())
      .set('Authorization', outsider.auth)
      .send(c.body);
    expect(res.status).toBe(404);
  });

  it('las mismas rutas exigen autenticación (401 sin token)', async () => {
    for (const c of routes) {
      const res = await request(ctx.app)[c.method](c.path()).send(c.body);
      expect(res.status, c.route).toBe(401);
    }
  });

  it('POST /companies/join con un código ajeno o inexistente da 404', async () => {
    const res = await request(ctx.app)
      .post('/companies/join')
      .set('Authorization', outsider.auth)
      .send({ code: 'ZZZZZZ' });
    expect(res.status).toBe(404);
  });

  it('GET /companies y GET /me solo muestran las empresas propias', async () => {
    const list = await request(ctx.app).get('/companies').set('Authorization', outsider.auth);
    expect(list.body.companies).toEqual([]);
    const me = await request(ctx.app).get('/me').set('Authorization', outsider.auth);
    expect(me.body.companies).toEqual([]);
  });

  it('DELETE /me no toca a otros usuarios ni a la empresa ajena', async () => {
    const res = await request(ctx.app).delete('/me').set('Authorization', outsider.auth);
    expect(res.status).toBe(204);
    const [c] = await ctx.db.select().from(companies);
    expect(c!.id).toBe(companyId);
    const m = await ctx.db.select().from(memberships);
    expect(m.map((r) => r.userId)).toEqual([ana.id]);
    const me = await request(ctx.app).get('/me').set('Authorization', ana.auth);
    expect(me.status).toBe(200);
  });

  it('/admin/* exige ADMIN_TOKEN, no JWT de usuario', async () => {
    for (const [method, path] of [
      ['get', '/admin/usage'],
      ['put', '/admin/field-catalog/total'],
      ['put', '/admin/price-settings'],
    ] as const) {
      const res = await request(ctx.app)[method](path).set('Authorization', ana.auth).send({});
      expect(res.status, path).toBe(401);
    }
  });
});

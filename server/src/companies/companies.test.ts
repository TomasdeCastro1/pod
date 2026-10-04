import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { auditLog, memberships } from '../db/schema.js';
import { createTestApp, type TestCtx } from '../test/helpers.js';
import { INVITE_ALPHABET } from './inviteCode.js';

const RUT = '219419590017';
let ctx: TestCtx;
let ana: { id: string; auth: string };
let beto: { id: string; auth: string };

beforeEach(async () => {
  ctx = await createTestApp({ companyLimits: { joinPerUser: 1000 } });
  ana = await ctx.createUser('ana@example.com', 'Ana');
  beto = await ctx.createUser('beto@example.com', 'Beto');
});
afterEach(async () => {
  await ctx.close();
});

async function newCompany(auth = ana.auth) {
  const r = await request(ctx.app)
    .post('/companies')
    .set('Authorization', auth)
    .send({ nombre: 'Acme', rut: '21.941959.0017' });
  return r.body.company as { id: string; inviteCode: string; rut: string };
}

async function join(auth: string, code: string) {
  return request(ctx.app).post('/companies/join').set('Authorization', auth).send({ code });
}

describe('crear y listar', () => {
  it('requiere autenticación', async () => {
    expect((await request(ctx.app).get('/companies')).status).toBe(401);
  });

  it('crea con RUT normalizado, creador admin y código válido', async () => {
    const r = await request(ctx.app)
      .post('/companies')
      .set('Authorization', ana.auth)
      .send({ nombre: ' Acme ', rut: '21.941959.0017' });
    expect(r.status).toBe(201);
    expect(r.body.company).toMatchObject({ nombre: 'Acme', rut: RUT, role: 'admin' });
    expect(r.body.company.inviteCode).toMatch(new RegExp(`^[${INVITE_ALPHABET}]{6}$`));
    const list = await request(ctx.app).get('/companies').set('Authorization', ana.auth);
    expect(list.body.companies).toHaveLength(1);
    const log = await ctx.db.select().from(auditLog);
    expect(log.map((l) => l.action)).toEqual(['company.create']);
  });

  it('rechaza RUT inválido con mensaje claro', async () => {
    const r = await request(ctx.app)
      .post('/companies')
      .set('Authorization', ana.auth)
      .send({ nombre: 'Acme', rut: '219419590018' });
    expect(r.status).toBe(400);
    expect(r.body.error.message).toMatch(/RUT/);
  });
});

describe('aislamiento por membresía', () => {
  it('un no miembro recibe 404 en todo', async () => {
    const c = await newCompany();
    const h = { Authorization: beto.auth };
    expect((await request(ctx.app).get('/companies').set(h)).body.companies).toEqual([]);
    expect((await request(ctx.app).get(`/companies/${c.id}/members`).set(h)).status).toBe(404);
    expect(
      (await request(ctx.app).patch(`/companies/${c.id}`).set(h).send({ nombre: 'X' })).status,
    ).toBe(404);
    expect((await request(ctx.app).post(`/companies/${c.id}/invite-code`).set(h)).status).toBe(404);
    expect(
      (await request(ctx.app).delete(`/companies/${c.id}/members/${ana.id}`).set(h)).status,
    ).toBe(404);
    expect((await request(ctx.app).get('/companies/no-es-uuid/members').set(h)).status).toBe(404);
  });

  it('un miembro no puede editar ni regenerar código (403) pero ve miembros', async () => {
    const c = await newCompany();
    await join(beto.auth, c.inviteCode);
    const h = { Authorization: beto.auth };
    expect(
      (await request(ctx.app).patch(`/companies/${c.id}`).set(h).send({ nombre: 'X' })).status,
    ).toBe(403);
    expect((await request(ctx.app).post(`/companies/${c.id}/invite-code`).set(h)).status).toBe(403);
    expect(
      (
        await request(ctx.app)
          .patch(`/companies/${c.id}/members/${beto.id}`)
          .set(h)
          .send({ role: 'admin' })
      ).status,
    ).toBe(403);
    const m = await request(ctx.app).get(`/companies/${c.id}/members`).set(h);
    expect(m.status).toBe(200);
    expect(m.body.members).toHaveLength(2);
    expect(m.body.members[0]).toEqual({
      id: ana.id,
      nombre: 'Ana',
      email: 'ana@example.com',
      role: 'admin',
    });
  });
});

describe('unirse con código', () => {
  it('funciona sin importar mayúsculas y es idempotente', async () => {
    const c = await newCompany();
    const r1 = await join(beto.auth, c.inviteCode.toLowerCase());
    expect(r1.status).toBe(200);
    expect(r1.body.company).toMatchObject({ id: c.id, role: 'miembro' });
    const r2 = await join(beto.auth, c.inviteCode);
    expect(r2.status).toBe(200);
    expect(r2.body.company.id).toBe(c.id);
    expect(
      await ctx.db.select().from(memberships).where(eq(memberships.userId, beto.id)),
    ).toHaveLength(1);
  });

  it('un admin que vuelve a unirse conserva su rol', async () => {
    const c = await newCompany();
    const r = await join(ana.auth, c.inviteCode);
    expect(r.body.company.role).toBe('admin');
  });

  it('código inexistente da 404', async () => {
    expect((await join(beto.auth, 'ZZZZZZ')).status).toBe(404);
  });

  it('limita los intentos por usuario', async () => {
    const limited = await createTestApp({ companyLimits: { joinPerUser: 2 } });
    try {
      const u = await limited.createUser('x@example.com');
      const codes = [1, 2, 3].map(() =>
        request(limited.app)
          .post('/companies/join')
          .set('Authorization', u.auth)
          .send({ code: 'ZZZZZZ' }),
      );
      const statuses: number[] = [];
      for (const p of codes) statuses.push((await p).status);
      expect(statuses).toEqual([404, 404, 429]);
    } finally {
      await limited.close();
    }
  });
});

describe('admin', () => {
  it('edita datos, valida RUT y audita', async () => {
    const c = await newCompany();
    const h = { Authorization: ana.auth };
    const ok = await request(ctx.app).patch(`/companies/${c.id}`).set(h).send({ nombre: 'Nueva' });
    expect(ok.body.company.nombre).toBe('Nueva');
    const bad = await request(ctx.app).patch(`/companies/${c.id}`).set(h).send({ rut: '123' });
    expect(bad.status).toBe(400);
    const empty = await request(ctx.app).patch(`/companies/${c.id}`).set(h).send({});
    expect(empty.status).toBe(400);
  });

  it('regenera el código y el anterior deja de servir', async () => {
    const c = await newCompany();
    const r = await request(ctx.app)
      .post(`/companies/${c.id}/invite-code`)
      .set('Authorization', ana.auth);
    expect(r.status).toBe(200);
    expect(r.body.company.inviteCode).not.toBe(c.inviteCode);
    expect((await join(beto.auth, c.inviteCode)).status).toBe(404);
    expect((await join(beto.auth, r.body.company.inviteCode)).status).toBe(200);
  });

  it('cambia roles, da de baja y audita', async () => {
    const c = await newCompany();
    await join(beto.auth, c.inviteCode);
    const h = { Authorization: ana.auth };
    const p = await request(ctx.app)
      .patch(`/companies/${c.id}/members/${beto.id}`)
      .set(h)
      .send({ role: 'admin' });
    expect(p.status).toBe(200);
    const d = await request(ctx.app).delete(`/companies/${c.id}/members/${beto.id}`).set(h);
    expect(d.status).toBe(204);
    expect(
      (await request(ctx.app).get(`/companies/${c.id}`).set({ Authorization: beto.auth })).status,
    ).toBe(404);
    const actions = (await ctx.db.select().from(auditLog)).map((l) => l.action);
    expect(actions).toEqual(
      expect.arrayContaining(['member.join', 'member.role_change', 'member.remove']),
    );
  });

  it('no deja la empresa sin admins (409) hasta que hay otro', async () => {
    const c = await newCompany();
    await join(beto.auth, c.inviteCode);
    const h = { Authorization: ana.auth };
    const demote = () =>
      request(ctx.app)
        .patch(`/companies/${c.id}/members/${ana.id}`)
        .set(h)
        .send({ role: 'miembro' });
    const remove = () => request(ctx.app).delete(`/companies/${c.id}/members/${ana.id}`).set(h);
    expect((await demote()).status).toBe(409);
    expect((await remove()).status).toBe(409);
    await request(ctx.app)
      .patch(`/companies/${c.id}/members/${beto.id}`)
      .set(h)
      .send({ role: 'admin' });
    expect((await demote()).status).toBe(200);
  });

  it('baja de alguien que no es miembro da 404', async () => {
    const c = await newCompany();
    const r = await request(ctx.app)
      .delete(`/companies/${c.id}/members/${beto.id}`)
      .set('Authorization', ana.auth);
    expect(r.status).toBe(404);
  });
});

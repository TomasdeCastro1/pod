import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { otpCodes, users } from '../db/schema.js';
import { createTestDb } from '../db/test-db.js';
import type { EmailSender } from '../email/index.js';
import type { ObjectStore } from '../storage/index.js';
import type { AuthLimits } from './routes.js';

const config = {
  JWT_SECRET: 'test-secret',
  SIGNED_URL_SECRET: 's',
  REVIEW_EMAIL: 'review@example.com',
  REVIEW_CODE: '424242',
  EMAIL_DRIVER: 'console',
  PORT: 3000,
} as unknown as Config;

const HIGH: Partial<AuthLimits> = {
  requestCodePerIp: 1000,
  verifyPerIp: 1000,
  codesPerEmailPerHour: 1000,
};

let sent: { email: string; code: string }[];
let ctx: Awaited<ReturnType<typeof createTestDb>>;

const fakeEmail: EmailSender = {
  sendCode(email, code) {
    sent.push({ email, code });
    return Promise.resolve();
  },
};

function makeApp(limits: Partial<AuthLimits> = HIGH) {
  return createApp({
    db: ctx.db as unknown as Db,
    store: {} as ObjectStore,
    config,
    email: fakeEmail,
    authLimits: limits,
  });
}

beforeEach(async () => {
  sent = [];
  ctx = await createTestDb();
});
afterEach(async () => {
  await ctx.client.close();
});

describe('login por código', () => {
  it('flujo completo: pide código, verifica y consulta /me', async () => {
    const app = makeApp();
    const r1 = await request(app).post('/auth/request-code').send({ email: '  Ana@Example.com ' });
    expect(r1.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.email).toBe('ana@example.com');
    expect(sent[0]?.code).toMatch(/^\d{6}$/);

    const [row] = await ctx.db.select().from(otpCodes);
    expect(row?.codeHash).not.toContain(sent[0]!.code);

    const r2 = await request(app)
      .post('/auth/verify')
      .send({ email: 'ana@example.com', code: sent[0]!.code });
    expect(r2.status).toBe(200);
    expect(r2.body.user.email).toBe('ana@example.com');
    expect(r2.body.companies).toEqual([]);
    const decoded = jwt.decode(r2.body.token) as { sub: string; exp: number; iat: number };
    expect(decoded.sub).toBe(r2.body.user.id);
    expect(decoded.exp - decoded.iat).toBe(30 * 24 * 3600);
    expect(await ctx.db.select().from(otpCodes)).toHaveLength(0);

    const me = await request(app).get('/me').set('Authorization', `Bearer ${r2.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('ana@example.com');

    const patch = await request(app)
      .patch('/me')
      .set('Authorization', `Bearer ${r2.body.token}`)
      .send({ nombre: 'Ana' });
    expect(patch.status).toBe(200);
    expect(patch.body.user.nombre).toBe('Ana');
  });

  it('rechaza email inválido y responde igual para cualquier email', async () => {
    const app = makeApp();
    expect((await request(app).post('/auth/request-code').send({ email: 'nope' })).status).toBe(
      400,
    );
    const a = await request(app).post('/auth/request-code').send({ email: 'a@b.com' });
    const b = await request(app).post('/auth/request-code').send({ email: 'c@d.com' });
    expect(a.body).toEqual(b.body);
  });

  it('rechaza código vencido', async () => {
    const app = makeApp();
    await request(app).post('/auth/request-code').send({ email: 'a@b.com' });
    await ctx.db.update(otpCodes).set({ expiresAt: new Date(Date.now() - 1000) });
    const res = await request(app)
      .post('/auth/verify')
      .send({ email: 'a@b.com', code: sent[0]!.code });
    expect(res.status).toBe(401);
    expect(await ctx.db.select().from(otpCodes)).toHaveLength(0);
  });

  it('tras 6 intentos incorrectos rechaza incluso el código correcto', async () => {
    const app = makeApp();
    await request(app).post('/auth/request-code').send({ email: 'a@b.com' });
    const good = sent[0]!.code;
    const bad = good === '000000' ? '111111' : '000000';
    for (let i = 0; i < 6; i++) {
      const r = await request(app).post('/auth/verify').send({ email: 'a@b.com', code: bad });
      expect(r.status).toBe(401);
    }
    const res = await request(app).post('/auth/verify').send({ email: 'a@b.com', code: good });
    expect(res.status).toBe(401);
  });

  it('un código nuevo reemplaza al anterior', async () => {
    const app = makeApp();
    await request(app).post('/auth/request-code').send({ email: 'a@b.com' });
    await request(app).post('/auth/request-code').send({ email: 'a@b.com' });
    expect(await ctx.db.select().from(otpCodes)).toHaveLength(1);
    const res = await request(app)
      .post('/auth/verify')
      .send({ email: 'a@b.com', code: sent[1]!.code });
    expect(res.status).toBe(200);
  });

  it('rechaza token alterado, vencido, sin header y de usuario eliminado', async () => {
    const app = makeApp();
    await request(app).post('/auth/request-code').send({ email: 'a@b.com' });
    const v = await request(app)
      .post('/auth/verify')
      .send({ email: 'a@b.com', code: sent[0]!.code });
    const token = v.body.token as string;
    const get = (t?: string) => {
      const r = request(app).get('/me');
      return t ? r.set('Authorization', `Bearer ${t}`) : r;
    };
    expect((await get()).status).toBe(401);
    expect((await get(token.slice(0, -2) + 'xx')).status).toBe(401);
    const expired = jwt.sign({}, config.JWT_SECRET, {
      subject: v.body.user.id,
      expiresIn: -10,
    });
    expect((await get(expired)).status).toBe(401);
    const otherKey = jwt.sign({}, 'otra', { subject: v.body.user.id, expiresIn: 60 });
    expect((await get(otherKey)).status).toBe(401);
    expect((await get(token)).status).toBe(200);
    await ctx.db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, v.body.user.id));
    expect((await get(token)).status).toBe(401);
  });

  it('cuenta de revisión: código fijo y sin envío; otros emails no lo aceptan', async () => {
    const app = makeApp();
    const r = await request(app).post('/auth/request-code').send({ email: 'Review@example.com' });
    expect(r.status).toBe(200);
    expect(sent).toHaveLength(0);
    expect(await ctx.db.select().from(otpCodes)).toHaveLength(0);

    const ok = await request(app)
      .post('/auth/verify')
      .send({ email: 'review@example.com', code: '424242' });
    expect(ok.status).toBe(200);
    const wrong = await request(app)
      .post('/auth/verify')
      .send({ email: 'review@example.com', code: '111111' });
    expect(wrong.status).toBe(401);

    await request(app).post('/auth/request-code').send({ email: 'otro@example.com' });
    const other = await request(app)
      .post('/auth/verify')
      .send({ email: 'otro@example.com', code: '424242' });
    expect(other.status).toBe(401);
  });

  it('reactiva: un usuario eliminado entra como usuario nuevo', async () => {
    const app = makeApp();
    await ctx.db.insert(users).values({ email: 'old-anon@deleted.invalid', deletedAt: new Date() });
    await request(app).post('/auth/request-code').send({ email: 'a@b.com' });
    const res = await request(app)
      .post('/auth/verify')
      .send({ email: 'a@b.com', code: sent[0]!.code });
    expect(res.status).toBe(200);
  });
});

describe('rate limit', () => {
  it('corta request-code por IP al superar el límite', async () => {
    const app = makeApp({ ...HIGH, requestCodePerIp: 3 });
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      statuses.push(
        (
          await request(app)
            .post('/auth/request-code')
            .send({ email: `u${i}@b.com` })
        ).status,
      );
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
  });

  it('corta verify por IP', async () => {
    const app = makeApp({ ...HIGH, verifyPerIp: 2 });
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) {
      statuses.push(
        (await request(app).post('/auth/verify').send({ email: 'a@b.com', code: '123456' })).status,
      );
    }
    expect(statuses).toEqual([401, 401, 429]);
  });

  it('máximo 5 códigos por email por hora', async () => {
    const app = makeApp({ ...HIGH, codesPerEmailPerHour: 5 });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push(
        (await request(app).post('/auth/request-code').send({ email: 'a@b.com' })).status,
      );
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    expect(sent).toHaveLength(5);
  });

  it('cada app tiene sus propios contadores', async () => {
    const a = makeApp({ ...HIGH, requestCodePerIp: 1 });
    await request(a).post('/auth/request-code').send({ email: 'a@b.com' });
    expect((await request(a).post('/auth/request-code').send({ email: 'a@b.com' })).status).toBe(
      429,
    );
    const b = makeApp({ ...HIGH, requestCodePerIp: 1 });
    expect((await request(b).post('/auth/request-code').send({ email: 'a@b.com' })).status).toBe(
      200,
    );
  });
});

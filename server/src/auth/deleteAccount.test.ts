import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { auditLog, companies, memberships, otpCodes, scans, users } from '../db/schema.js';
import { createTestApp, type TestCtx } from '../test/helpers.js';

let ctx: TestCtx;
beforeEach(async () => {
  ctx = await createTestApp();
});
afterEach(async () => {
  await ctx.close();
});

async function company(nombre: string, code: string) {
  const [c] = await ctx.db
    .insert(companies)
    .values({ nombre, rut: '210000000012', inviteCode: code })
    .returning();
  return c!.id;
}

describe('DELETE /me', () => {
  it('anonimiza al usuario, borra membresías y OTP, y deja los escaneos', async () => {
    const ana = await ctx.createUser('ana@example.com', 'Ana');
    const companyId = await company('Solo Ana', 'AAA111');
    await ctx.db.insert(memberships).values({ userId: ana.id, companyId, role: 'admin' });
    await ctx.db.insert(otpCodes).values({
      email: 'ana@example.com',
      codeHash: 'x',
      expiresAt: new Date(Date.now() + 60000),
    });
    await ctx.db.insert(scans).values({
      clientId: 'del-1',
      companyId,
      userId: ana.id,
      capturedAt: new Date(),
      status: 'listo',
    });

    const res = await request(ctx.app).delete('/me').set('Authorization', ana.auth);
    expect(res.status).toBe(204);

    const [u] = await ctx.db.select().from(users).where(eq(users.id, ana.id));
    expect(u!.email).toBe(`deleted+${ana.id}@invalid`);
    expect(u!.nombre).toBeNull();
    expect(u!.deletedAt).not.toBeNull();
    expect(await ctx.db.select().from(memberships).where(eq(memberships.userId, ana.id))).toEqual(
      [],
    );
    expect(await ctx.db.select().from(otpCodes)).toEqual([]);
    const kept = await ctx.db.select().from(scans).where(eq(scans.companyId, companyId));
    expect(kept).toHaveLength(1);
    expect(kept[0]!.userId).toBe(ana.id);
    const audit = await ctx.db.select().from(auditLog).where(eq(auditLog.action, 'user.delete'));
    expect(audit).toHaveLength(1);
    expect(audit[0]!.companyId).toBe(companyId);
    expect(JSON.stringify(audit)).not.toContain('ana@example.com');
  });

  it('el token deja de valer', async () => {
    const ana = await ctx.createUser('ana@example.com');
    await request(ctx.app).delete('/me').set('Authorization', ana.auth).expect(204);
    await request(ctx.app).get('/me').set('Authorization', ana.auth).expect(401);
    await request(ctx.app).delete('/me').set('Authorization', ana.auth).expect(401);
  });

  it('sin token da 401', async () => {
    await request(ctx.app).delete('/me').expect(401);
  });

  it('un usuario sin empresas se elimina y audita sin empresa', async () => {
    const ana = await ctx.createUser('ana@example.com');
    await request(ctx.app).delete('/me').set('Authorization', ana.auth).expect(204);
    const audit = await ctx.db.select().from(auditLog);
    expect(audit).toHaveLength(1);
    expect(audit[0]!.companyId).toBeNull();
  });

  it('el único admin de una empresa con otros miembros recibe 409 con la lista', async () => {
    const ana = await ctx.createUser('ana@example.com', 'Ana');
    const beto = await ctx.createUser('beto@example.com');
    const companyId = await company('Con equipo', 'BBB222');
    await ctx.db.insert(memberships).values([
      { userId: ana.id, companyId, role: 'admin' },
      { userId: beto.id, companyId, role: 'miembro' },
    ]);
    const res = await request(ctx.app).delete('/me').set('Authorization', ana.auth);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('last_admin');
    expect(res.body.error.companies).toEqual([{ id: companyId, nombre: 'Con equipo' }]);
    const [u] = await ctx.db.select().from(users).where(eq(users.id, ana.id));
    expect(u!.deletedAt).toBeNull();
    expect(u!.email).toBe('ana@example.com');
    await request(ctx.app).get('/me').set('Authorization', ana.auth).expect(200);
  });

  it('con otro admin puede eliminarse; un miembro común también', async () => {
    const ana = await ctx.createUser('ana@example.com');
    const beto = await ctx.createUser('beto@example.com');
    const cami = await ctx.createUser('cami@example.com');
    const companyId = await company('Con equipo', 'CCC333');
    await ctx.db.insert(memberships).values([
      { userId: ana.id, companyId, role: 'admin' },
      { userId: beto.id, companyId, role: 'admin' },
      { userId: cami.id, companyId, role: 'miembro' },
    ]);
    await request(ctx.app).delete('/me').set('Authorization', cami.auth).expect(204);
    await request(ctx.app).delete('/me').set('Authorization', ana.auth).expect(204);
    const left = await ctx.db
      .select()
      .from(memberships)
      .where(eq(memberships.companyId, companyId));
    expect(left.map((m) => m.userId)).toEqual([beto.id]);
    // Beto ahora es el único miembro: puede eliminarse y la empresa queda sin miembros.
    await request(ctx.app).delete('/me').set('Authorization', beto.auth).expect(204);
    expect(await ctx.db.select().from(companies)).toHaveLength(1);
  });

  it('el mismo email puede volver a registrarse como usuario nuevo', async () => {
    const ana = await ctx.createUser('ana@example.com');
    await request(ctx.app).delete('/me').set('Authorization', ana.auth).expect(204);
    const again = await ctx.createUser('ana@example.com');
    expect(again.id).not.toBe(ana.id);
  });
});

import { and, eq, sql } from 'drizzle-orm';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { isValidRut, normalizeRut } from '@app/shared';
import { HttpError, type AppDeps } from '../app.js';
import { auditLog, companies, memberships, users } from '../db/schema.js';
import { requireAdmin, requireMember, isUuid } from '../middleware/requireMember.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { generateInviteCode } from './inviteCode.js';

export interface CompanyLimits {
  /** Intentos de /companies/join por usuario cada `windowMs`. */
  joinPerUser: number;
  windowMs: number;
}

export const DEFAULT_COMPANY_LIMITS: CompanyLimits = {
  joinPerUser: 10,
  windowMs: 15 * 60 * 1000,
};

const MAX_CODE_TRIES = 10;

const nombreSchema = z.string().trim().min(1).max(100);
const rutSchema = z
  .string()
  .transform(normalizeRut)
  .refine(isValidRut, { message: 'RUT inválido' });
const createSchema = z.object({ nombre: nombreSchema, rut: rutSchema });
const patchSchema = z
  .object({ nombre: nombreSchema.optional(), rut: rutSchema.optional() })
  .refine((v) => v.nombre !== undefined || v.rut !== undefined);
const joinSchema = z.object({ code: z.string().trim().min(1).max(20) });
const roleSchema = z.object({ role: z.enum(['admin', 'miembro']) });

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    const rutIssue = r.error.issues.some((i) => i.path[0] === 'rut');
    throw new HttpError(
      400,
      'bad_request',
      rutIssue ? 'El RUT no es válido (revisá el dígito verificador)' : 'Solicitud inválida',
    );
  }
  return r.data;
}

const notFound = () => new HttpError(404, 'not_found', 'No encontrado');

function isUniqueViolation(err: unknown): boolean {
  let e: unknown = err;
  for (let i = 0; i < 4 && e; i++) {
    if ((e as { code?: string }).code === '23505') return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

type CompanyRow = typeof companies.$inferSelect;
const publicCompany = (c: CompanyRow, role: string) => ({
  id: c.id,
  nombre: c.nombre,
  rut: c.rut,
  inviteCode: c.inviteCode,
  role,
});

export function companiesRouter(deps: AppDeps): Router {
  const { db } = deps;
  const limits = { ...DEFAULT_COMPANY_LIMITS, ...deps.companyLimits };
  const router = Router();
  router.use(requireAuth(deps));
  const member = requireMember(deps);

  const audit = (
    companyId: string,
    userId: string,
    action: string,
    detail?: Record<string, unknown>,
  ) => db.insert(auditLog).values({ companyId, userId, action, detail });

  router.get('/', async (req, res) => {
    const rows = await db
      .select({ company: companies, role: memberships.role })
      .from(memberships)
      .innerJoin(companies, eq(companies.id, memberships.companyId))
      .where(eq(memberships.userId, req.user!.id))
      .orderBy(companies.createdAt);
    res.json({ companies: rows.map((r) => publicCompany(r.company, r.role)) });
  });

  router.post('/', async (req, res) => {
    const { nombre, rut } = parse(createSchema, req.body);
    const user = req.user!;
    for (let i = 0; i < MAX_CODE_TRIES; i++) {
      try {
        const company = await db.transaction(async (tx) => {
          const [c] = await tx
            .insert(companies)
            .values({ nombre, rut, inviteCode: generateInviteCode() })
            .returning();
          if (!c) throw new Error('insert failed');
          await tx.insert(memberships).values({ userId: user.id, companyId: c.id, role: 'admin' });
          await tx.insert(auditLog).values({
            companyId: c.id,
            userId: user.id,
            action: 'company.create',
            detail: { nombre, rut },
          });
          return c;
        });
        res.status(201).json({ company: publicCompany(company, 'admin') });
        return;
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
    throw new HttpError(500, 'internal_error', 'Error interno');
  });

  router.post(
    '/join',
    rateLimit({
      windowMs: limits.windowMs,
      limit: limits.joinPerUser,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      keyGenerator: (req) => req.user!.id,
      validate: false,
      handler: (_req, _res, next) => {
        next(new HttpError(429, 'too_many_requests', 'Demasiados intentos. Probá más tarde.'));
      },
    }),
    async (req, res) => {
      const { code } = parse(joinSchema, req.body);
      const user = req.user!;
      const [company] = await db
        .select()
        .from(companies)
        .where(eq(companies.inviteCode, code.toUpperCase()))
        .limit(1);
      if (!company) throw new HttpError(404, 'invalid_code', 'Código de invitación inválido');
      const inserted = await db
        .insert(memberships)
        .values({ userId: user.id, companyId: company.id, role: 'miembro' })
        .onConflictDoNothing()
        .returning();
      if (inserted.length > 0) await audit(company.id, user.id, 'member.join');
      const [m] = await db
        .select({ role: memberships.role })
        .from(memberships)
        .where(and(eq(memberships.userId, user.id), eq(memberships.companyId, company.id)));
      res.json({ company: publicCompany(company, m?.role ?? 'miembro') });
    },
  );

  router.patch('/:id', member, requireAdmin, async (req, res) => {
    const body = parse(patchSchema, req.body);
    const id = req.membership!.companyId;
    const [company] = await db
      .update(companies)
      .set({
        ...(body.nombre !== undefined && { nombre: body.nombre }),
        ...(body.rut !== undefined && { rut: body.rut }),
      })
      .where(eq(companies.id, id))
      .returning();
    if (!company) throw notFound();
    await audit(id, req.user!.id, 'company.update', body);
    res.json({ company: publicCompany(company, 'admin') });
  });

  router.post('/:id/invite-code', member, requireAdmin, async (req, res) => {
    const id = req.membership!.companyId;
    for (let i = 0; i < MAX_CODE_TRIES; i++) {
      try {
        const [company] = await db
          .update(companies)
          .set({ inviteCode: generateInviteCode() })
          .where(eq(companies.id, id))
          .returning();
        if (!company) throw notFound();
        await audit(id, req.user!.id, 'company.invite_code_regenerate');
        res.json({ company: publicCompany(company, 'admin') });
        return;
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
    throw new HttpError(500, 'internal_error', 'Error interno');
  });

  router.get('/:id/members', member, async (req, res) => {
    const rows = await db
      .select({
        id: users.id,
        nombre: users.nombre,
        email: users.email,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.companyId, req.membership!.companyId))
      .orderBy(memberships.createdAt);
    res.json({ members: rows });
  });

  /** Cambia el rol o da de baja, sin dejar la empresa sin admins (transacción con la empresa bloqueada). */
  async function changeMember(
    companyId: string,
    userId: string,
    actorId: string,
    change: { role: 'admin' | 'miembro' } | null,
  ) {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select id from companies where id = ${companyId} for update`);
      const rows = await tx
        .select({ userId: memberships.userId, role: memberships.role })
        .from(memberships)
        .where(eq(memberships.companyId, companyId));
      const target = rows.find((r) => r.userId === userId);
      if (!target) throw notFound();
      const admins = rows.filter((r) => r.role === 'admin').length;
      const losesAdmin = target.role === 'admin' && (change === null || change.role !== 'admin');
      if (losesAdmin && admins <= 1) {
        throw new HttpError(409, 'last_admin', 'La empresa necesita al menos un administrador');
      }
      const where = and(eq(memberships.companyId, companyId), eq(memberships.userId, userId));
      if (change) await tx.update(memberships).set({ role: change.role }).where(where);
      else await tx.delete(memberships).where(where);
      await tx.insert(auditLog).values({
        companyId,
        userId: actorId,
        action: change ? 'member.role_change' : 'member.remove',
        detail: change
          ? { target: userId, from: target.role, to: change.role }
          : { target: userId, role: target.role },
      });
    });
  }

  router.patch('/:id/members/:userId', member, requireAdmin, async (req, res) => {
    const { role } = parse(roleSchema, req.body);
    if (!isUuid(req.params.userId)) throw notFound();
    await changeMember(req.membership!.companyId, req.params.userId, req.user!.id, { role });
    res.json({ ok: true });
  });

  router.delete('/:id/members/:userId', member, requireAdmin, async (req, res) => {
    if (!isUuid(req.params.userId)) throw notFound();
    await changeMember(req.membership!.companyId, req.params.userId, req.user!.id, null);
    res.status(204).end();
  });

  return router;
}

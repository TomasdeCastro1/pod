import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { HttpError, type AppDeps } from '../app.js';
import { companies, memberships, otpCodes, users } from '../db/schema.js';
import { createEmailSender } from '../email/index.js';
import { requireAuth, signToken } from '../middleware/requireAuth.js';

export interface AuthLimits {
  /** Pedidos por IP cada `windowMs` a /auth/request-code. */
  requestCodePerIp: number;
  /** Pedidos por IP cada `windowMs` a /auth/verify. */
  verifyPerIp: number;
  windowMs: number;
  /** Códigos por email por hora. */
  codesPerEmailPerHour: number;
}

export const DEFAULT_AUTH_LIMITS: AuthLimits = {
  requestCodePerIp: 10,
  verifyPerIp: 20,
  windowMs: 15 * 60 * 1000,
  codesPerEmailPerHour: 5,
};

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const HOUR_MS = 60 * 60 * 1000;
const REQUEST_MESSAGE = 'Si el email es válido, te enviamos un código.';

const emailSchema = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v),
  z.email().max(254),
);
const requestCodeSchema = z.object({ email: emailSchema });
const verifySchema = z.object({
  email: emailSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});
const patchMeSchema = z.object({ nombre: z.string().trim().min(1).max(100) });

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, 'bad_request', 'Solicitud inválida');
  return r.data;
}

function hashCode(secret: string, email: string, code: string): Buffer {
  return createHash('sha256').update(`${secret}:${email}:${code}`).digest();
}

function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

function limiter(limit: number, windowMs: number) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    validate: { trustProxy: false, xForwardedForHeader: false },
    handler: (_req, _res, next) => {
      next(new HttpError(429, 'too_many_requests', 'Demasiados intentos. Probá más tarde.'));
    },
  });
}

async function userWithCompanies(db: AppDeps['db'], userId: string) {
  const rows = await db
    .select({
      id: companies.id,
      nombre: companies.nombre,
      rut: companies.rut,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(companies, eq(companies.id, memberships.companyId))
    .where(eq(memberships.userId, userId));
  return rows;
}

export function authRouter(deps: AppDeps): Router {
  const { db, config } = deps;
  const email = deps.email ?? createEmailSender(config);
  const limits = { ...DEFAULT_AUTH_LIMITS, ...deps.authLimits };
  // Pedidos de código por email en la última hora (en memoria; se reinicia con el proceso).
  const sentByEmail = new Map<string, number[]>();
  const router = Router();

  const reviewEnabled = (addr: string) =>
    !!config.REVIEW_EMAIL &&
    !!config.REVIEW_CODE &&
    addr === config.REVIEW_EMAIL.trim().toLowerCase();

  router.post(
    '/request-code',
    limiter(limits.requestCodePerIp, limits.windowMs),
    async (req, res) => {
      const { email: addr } = parse(requestCodeSchema, req.body);
      if (reviewEnabled(addr)) {
        res.json({ message: REQUEST_MESSAGE });
        return;
      }
      const now = Date.now();
      const recent = (sentByEmail.get(addr) ?? []).filter((t) => now - t < HOUR_MS);
      if (recent.length >= limits.codesPerEmailPerHour) {
        sentByEmail.set(addr, recent);
        throw new HttpError(429, 'too_many_requests', 'Demasiados intentos. Probá más tarde.');
      }
      sentByEmail.set(addr, [...recent, now]);

      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const codeHash = hashCode(config.JWT_SECRET, addr, code).toString('hex');
      const expiresAt = new Date(now + CODE_TTL_MS);
      await db
        .insert(otpCodes)
        .values({ email: addr, codeHash, expiresAt, attempts: 0 })
        .onConflictDoUpdate({
          target: otpCodes.email,
          set: { codeHash, expiresAt, attempts: 0 },
        });
      await email.sendCode(addr, code);
      res.json({ message: REQUEST_MESSAGE });
    },
  );

  router.post('/verify', limiter(limits.verifyPerIp, limits.windowMs), async (req, res) => {
    const { email: addr, code } = parse(verifySchema, req.body);
    const invalid = () => new HttpError(401, 'invalid_code', 'Código incorrecto o vencido');

    if (reviewEnabled(addr)) {
      if (!safeEqual(code, config.REVIEW_CODE ?? '')) throw invalid();
    } else {
      // Suma el intento de forma atómica y devuelve el estado resultante.
      const [row] = await db
        .update(otpCodes)
        .set({ attempts: sql`${otpCodes.attempts} + 1` })
        .where(eq(otpCodes.email, addr))
        .returning();
      if (!row) throw invalid();
      if (row.expiresAt.getTime() < Date.now() || row.attempts > MAX_ATTEMPTS) {
        await db.delete(otpCodes).where(eq(otpCodes.email, addr));
        throw invalid();
      }
      const expected = hashCode(config.JWT_SECRET, addr, code);
      const stored = Buffer.from(row.codeHash, 'hex');
      if (stored.length !== expected.length || !timingSafeEqual(stored, expected)) throw invalid();
      await db.delete(otpCodes).where(eq(otpCodes.email, addr));
    }

    let [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, addr), isNull(users.deletedAt)))
      .limit(1);
    if (!user) {
      [user] = await db.insert(users).values({ email: addr }).returning();
    }
    if (!user) throw new HttpError(500, 'internal_error', 'Error interno');

    res.json({
      token: signToken(config.JWT_SECRET, user.id),
      user: { id: user.id, email: user.email, nombre: user.nombre },
      companies: await userWithCompanies(db, user.id),
    });
  });

  return router;
}

export function meRouter(deps: AppDeps): Router {
  const { db } = deps;
  const router = Router();
  router.use(requireAuth(deps));

  router.get('/', async (req, res) => {
    const user = req.user!;
    res.json({ user, companies: await userWithCompanies(db, user.id) });
  });

  router.patch('/', async (req, res) => {
    const { nombre } = parse(patchMeSchema, req.body);
    const user = req.user!;
    await db.update(users).set({ nombre }).where(eq(users.id, user.id));
    res.json({
      user: { ...user, nombre },
      companies: await userWithCompanies(db, user.id),
    });
  });

  return router;
}

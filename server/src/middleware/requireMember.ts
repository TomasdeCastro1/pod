import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from 'express';
import { HttpError } from '../app.js';
import type { Db } from '../db/client.js';
import { memberships, scans } from '../db/schema.js';

export type Role = 'admin' | 'miembro';

export interface Membership {
  companyId: string;
  role: Role;
}

declare module 'express-serve-static-core' {
  interface Request {
    /** Membresía del usuario en la empresa de la ruta (la fijan requireMember y loadScan). */
    membership?: Membership;
    /** Escaneo cargado por loadScan. */
    scan?: typeof scans.$inferSelect;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const notFound = () => new HttpError(404, 'not_found', 'No encontrado');

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

async function findMembership(
  db: Db,
  userId: string,
  companyId: string,
): Promise<Membership | null> {
  const [row] = await db
    .select({ companyId: memberships.companyId, role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.companyId, companyId)))
    .limit(1);
  return row ?? null;
}

/** Exige `req.user` (requireAuth antes). 404 si no es miembro de la empresa de la ruta. */
export function requireMember(deps: { db: Db }, paramName = 'id'): RequestHandler {
  return async (req, _res, next) => {
    const companyId = req.params[paramName];
    if (!req.user || !isUuid(companyId)) throw notFound();
    const m = await findMembership(deps.db, req.user.id, companyId);
    if (!m) throw notFound();
    req.membership = m;
    next();
  };
}

/** Va después de requireMember: 403 si es miembro pero no admin. */
export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (req.membership?.role !== 'admin') {
    throw new HttpError(403, 'forbidden', 'Solo los administradores pueden hacer esto');
  }
  next();
};

/**
 * Para rutas /scans/:id: carga el escaneo y verifica la membresía de su empresa.
 * 404 si no existe o el usuario no es miembro (no revela que existe).
 */
export function loadScan(deps: { db: Db }, paramName = 'id'): RequestHandler {
  return async (req, _res, next) => {
    const scanId = req.params[paramName];
    if (!req.user || !isUuid(scanId)) throw notFound();
    const [scan] = await deps.db.select().from(scans).where(eq(scans.id, scanId)).limit(1);
    if (!scan) throw notFound();
    const m = await findMembership(deps.db, req.user.id, scan.companyId);
    if (!m) throw notFound();
    req.scan = scan;
    req.membership = m;
    next();
  };
}

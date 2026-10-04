import { eq } from 'drizzle-orm';
import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { HttpError } from '../app.js';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { users } from '../db/schema.js';

export interface AuthUser {
  id: string;
  email: string;
  nombre: string | null;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export function signToken(secret: string, userId: string): string {
  return jwt.sign({}, secret, {
    algorithm: 'HS256',
    subject: userId,
    expiresIn: TOKEN_TTL_SECONDS,
  });
}

const unauthorized = () => new HttpError(401, 'unauthorized', 'Sesión inválida o vencida');

export function requireAuth(deps: { db: Db; config: Pick<Config, 'JWT_SECRET'> }): RequestHandler {
  return async (req, _res, next) => {
    const header = req.headers.authorization;
    const match = header ? /^Bearer (.+)$/.exec(header) : null;
    if (!match?.[1]) throw unauthorized();
    let sub: string | undefined;
    try {
      const payload = jwt.verify(match[1], deps.config.JWT_SECRET, { algorithms: ['HS256'] });
      sub = typeof payload === 'object' ? payload.sub : undefined;
    } catch {
      throw unauthorized();
    }
    if (!sub || !/^[0-9a-f-]{36}$/i.test(sub)) throw unauthorized();
    const [user] = await deps.db.select().from(users).where(eq(users.id, sub)).limit(1);
    if (!user || user.deletedAt) throw unauthorized();
    req.user = { id: user.id, email: user.email, nombre: user.nombre };
    next();
  };
}

import type { Express } from 'express';
import { createApp } from '../app.js';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { users } from '../db/schema.js';
import { createTestDb } from '../db/test-db.js';
import { signToken } from '../middleware/requireAuth.js';
import type { ObjectStore } from '../storage/index.js';

export const testConfig = {
  JWT_SECRET: 'test-secret',
  SIGNED_URL_SECRET: 's',
  EMAIL_DRIVER: 'console',
  PORT: 3000,
} as unknown as Config;

export interface TestCtx {
  app: Express;
  db: Db;
  close: () => Promise<void>;
  /** Crea un usuario y devuelve su id y encabezado Authorization. */
  createUser: (email: string, nombre?: string) => Promise<{ id: string; auth: string }>;
}

/** App completa sobre PGlite en memoria, con helper para crear usuarios autenticados. */
export async function createTestApp(extra: Partial<Parameters<typeof createApp>[0]> = {}) {
  const { db: rawDb, client } = await createTestDb();
  const db = rawDb as unknown as Db;
  const app = createApp({ db, store: {} as ObjectStore, config: testConfig, ...extra });
  const ctx: TestCtx = {
    app,
    db,
    close: () => client.close(),
    async createUser(email, nombre) {
      const [u] = await db
        .insert(users)
        .values({ email, nombre: nombre ?? null })
        .returning();
      return { id: u!.id, auth: `Bearer ${signToken(testConfig.JWT_SECRET, u!.id)}` };
    },
  };
  return ctx;
}

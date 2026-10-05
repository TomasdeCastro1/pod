import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { logger } from '../logger.js';
import { createDb } from './client.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL es obligatoria');
const { db, pool } = createDb(url);
await migrate(db, { migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)) });
await pool.end();
logger.info({ event: 'migrations.applied' });

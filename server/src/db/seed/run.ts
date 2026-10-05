import { logger } from '../../logger.js';
import { createDb } from '../client.js';
import { DEFAULT_MODEL_SECONDARY, seed } from './index.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL es obligatoria');
const { db, pool } = createDb(url);
try {
  await seed(db, { modelSecondary: process.env.MODEL_SECONDARY || DEFAULT_MODEL_SECONDARY });
  logger.info({ event: 'seed.applied' });
} finally {
  await pool.end();
}

// Crea (idempotente) la cuenta de revisión de las tiendas: npm run seed:review -w server
// Necesita DATABASE_URL y REVIEW_EMAIL; usa el store configurado (STORAGE_DRIVER). No llama a la IA.
import { createDb } from '../src/db/client.js';
import { seed, type AnyDb } from '../src/db/seed/index.js';
import { seedReview } from '../src/db/seed/review.js';
import { logger } from '../src/logger.js';
import { getStore } from '../src/storage/index.js';
import { loadConfig } from '../src/config.js';

const email = process.env.REVIEW_EMAIL?.trim();
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL es obligatoria');
if (!email) throw new Error('REVIEW_EMAIL es obligatoria');

const config = loadConfig({
  ANTHROPIC_API_KEY: 'unused',
  JWT_SECRET: 'unused',
  ADMIN_TOKEN: 'unused',
  SIGNED_URL_SECRET: 'unused',
  ...process.env,
});
const { db, pool } = createDb(config.DATABASE_URL);
try {
  // Por si la base es nueva: el catálogo de campos tiene que existir.
  await seed(db as unknown as AnyDb, { modelSecondary: config.MODEL_SECONDARY });
  const r = await seedReview(db as unknown as AnyDb, getStore(config), { email });
  logger.info({ event: 'seed.review', companyId: r.companyId, scans: r.scans });
  console.log(`Cuenta de revisión lista: empresa ${r.companyId}, ${r.scans} escaneos.`);
  if (!config.REVIEW_CODE)
    console.warn('Ojo: REVIEW_CODE no está definida; el login de revisión no funcionará.');
} finally {
  await pool.end();
}

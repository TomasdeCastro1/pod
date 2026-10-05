// Runs the full scan pipeline on one photo: npm run scan:one -- samples/06.jpg [--company <id>]
// With DATABASE_URL it uses that database (and --company is required); without it, an
// in-memory PGlite database is seeded and a demo company is created.
import { readFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { createAnthropicClient } from '../src/ai/client.js';
import { loadConfig } from '../src/config.js';
import { companies, memberships, scans, users } from '../src/db/schema.js';
import { seed, type AnyDb } from '../src/db/seed/index.js';
import { createScan, isBillable, createScanQueue, processScan } from '../src/scans/index.js';
import { LocalStore } from '../src/storage/index.js';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--company');
if (!file) {
  console.error('Uso: npm run scan:one -- <foto.jpg> [--company <id>]');
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Falta ANTHROPIC_API_KEY: configurala en el entorno para llamar a la IA.');
  process.exit(1);
}

const config = loadConfig({
  DATABASE_URL: 'unused',
  JWT_SECRET: 'x',
  ADMIN_TOKEN: 'x',
  SIGNED_URL_SECRET: 'x',
  ...process.env,
});

let db: AnyDb;
let companyId = flag('--company');
let userId: string;
if (process.env.DATABASE_URL) {
  if (!companyId) {
    console.error('Con DATABASE_URL hay que indicar --company <id>.');
    process.exit(1);
  }
  const { createDb } = await import('../src/db/client.js');
  db = createDb(process.env.DATABASE_URL).db as unknown as AnyDb;
  const [m] = await db.select().from(memberships).where(eq(memberships.companyId, companyId));
  if (!m) {
    console.error('La empresa no existe o no tiene miembros.');
    process.exit(1);
  }
  userId = m.userId;
} else {
  const { createTestDb } = await import('../src/db/test-db.js');
  db = (await createTestDb()).db as unknown as AnyDb;
  await seed(db, { modelSecondary: config.MODEL_SECONDARY });
  const [c] = await db
    .insert(companies)
    .values({
      nombre: 'Empresa de prueba',
      rut: flag('--company-rut') ?? '219419590017',
      inviteCode: 'DEMO01',
    })
    .returning();
  const [u] = await db.insert(users).values({ email: 'dev@example.com' }).returning();
  await db.insert(memberships).values({ userId: u!.id, companyId: c!.id, role: 'admin' });
  companyId = c!.id;
  userId = u!.id;
}

const store = new LocalStore(await mkdtemp(join(tmpdir(), 'scan-one-')));
const deps = {
  db,
  store,
  client: createAnthropicClient(config.ANTHROPIC_API_KEY),
  models: { primary: config.MODEL_PRIMARY, secondary: config.MODEL_SECONDARY },
  routePaperReturnsToSecondary: config.ROUTE_PAPER_RETURNS_TO_SECONDARY,
};
const queue = createScanQueue({ run: (id) => processScan(deps, id) });
const { scanId } = await createScan(
  db,
  store,
  {
    companyId,
    userId,
    clientId: `scan-one-${Date.now()}`,
    capturedAt: new Date(),
    image: await readFile(resolve(file)),
  },
  queue,
);
await queue.idle();
const [scan] = await db.select().from(scans).where(eq(scans.id, scanId));
console.log(JSON.stringify({ ...scan, billable: isBillable(scan!) }, null, 2));
process.exit(0);

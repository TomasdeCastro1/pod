import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { prepareZXingModule, writeBarcode } from 'zxing-wasm/writer';
import type { ModelClient } from '../ai/client.js';
import { companies, companyFields, memberships, modelPrices, scans, users } from '../db/schema.js';
import { seed, type AnyDb } from '../db/seed/index.js';
import { createTestDb } from '../db/test-db.js';
import { computePricePer1000 } from '../catalog.js';
import { LocalStore } from '../storage/index.js';
import { createScan } from './create.js';
import { isBillable } from './billing.js';
import { processScan, type PipelineDeps } from './process.js';
import { createScanQueue, recoverStuckScans } from './queue.js';

const COMPANY_RUT = '219419590017';
const QR_URL = `https://www.efactura.dgi.gub.uy/consultaQR/cfe?${COMPANY_RUT},111,A,6129,1727.91,24/09/2026,Zm9vYmFy`;
const AI_JSON = JSON.stringify({
  cliente_rut: '216981070018',
  cliente_nombre: 'Cliente SA',
  local: 'Sucursal 1',
  conformidad_nivel: 'completa',
  sello_texto: 'Recibido',
});

async function qrPng(text: string): Promise<Buffer> {
  const path = createRequire(import.meta.url).resolve('zxing-wasm/writer/zxing_writer.wasm');
  await prepareZXingModule({
    overrides: { wasmBinary: readFileSync(path).buffer as ArrayBuffer },
    fireImmediately: true,
  });
  const res = await writeBarcode(text, { format: 'QRCode', scale: 4, addQuietZones: true });
  return Buffer.from(await res.image!.arrayBuffer());
}

let invoiceJpeg: Buffer;
beforeAll(async () => {
  const qr = await sharp(await qrPng(QR_URL))
    .resize(220, 220, { kernel: 'nearest' })
    .toBuffer();
  invoiceJpeg = await sharp({
    create: { width: 1200, height: 1600, channels: 3, background: '#f2f2f2' },
  })
    .composite([{ input: qr, gravity: 'south' }])
    .jpeg()
    .toBuffer();
});

function fakeClient(opts: { fail?: boolean; text?: string } = {}) {
  let calls = 0;
  const client: ModelClient = {
    messages: {
      async create() {
        calls++;
        if (opts.fail) throw new Error('boom con datos personales');
        return {
          content: [{ type: 'text', text: opts.text ?? AI_JSON }],
          usage: { input_tokens: 1200, output_tokens: 80 },
        };
      },
    },
  };
  return { client, calls: () => calls };
}

async function setup(clientOpts: Parameters<typeof fakeClient>[0] = {}) {
  const { db: raw, client: pg } = await createTestDb();
  const db = raw as unknown as AnyDb;
  await seed(db);
  const [company] = await db
    .insert(companies)
    .values({ nombre: 'ACME', rut: COMPANY_RUT, inviteCode: 'ABC123' })
    .returning();
  const [user] = await db.insert(users).values({ email: 'a@b.com' }).returning();
  await db.insert(memberships).values({ userId: user!.id, companyId: company!.id, role: 'admin' });
  const store = new LocalStore(await mkdtemp(join(tmpdir(), 'scans-test-')));
  const ai = fakeClient(clientOpts);
  const logs: Array<Record<string, unknown>> = [];
  const deps: PipelineDeps = {
    db,
    store,
    client: ai.client,
    models: { primary: 'claude-haiku-4-5-20251001', secondary: 'claude-sonnet-5-5' },
    routePaperReturnsToSecondary: false,
    retryDelaysMs: [1, 1],
    log: (e) => logs.push(e),
  };
  const queue = createScanQueue({ run: (id) => processScan(deps, id) });
  const upload = (clientId: string, extra: { replacesScanId?: string } = {}) =>
    createScan(
      db,
      store,
      {
        companyId: company!.id,
        userId: user!.id,
        clientId,
        capturedAt: new Date('2026-09-24T12:00:00Z'),
        image: invoiceJpeg,
        ...extra,
      },
      queue,
    );
  const get = async (id: string) => (await db.select().from(scans).where(eq(scans.id, id)))[0]!;
  return { db, pg, store, company: company!, user: user!, deps, queue, upload, get, ai, logs };
}

describe('pipeline de escaneo', () => {
  it('factura con QR termina listo con datos del QR, IA, costo y snapshot', async () => {
    const t = await setup();
    const { scanId, status } = await t.upload('c-1');
    expect(status).toBe('procesando');
    await t.queue.idle();
    const s = await t.get(scanId);
    expect(s.status).toBe('listo');
    expect(s.docType).toBe('factura_emitida');
    expect(s.qrRaw).toBe(QR_URL);
    expect(s.qrParcial).toBe(false);
    expect(s.numero).toBe('6129');
    expect(s.serie).toBe('A');
    expect(Number(s.total)).toBe(1727.91);
    expect(s.fechaDocumento).toBe('2026-09-24');
    expect(s.clienteNombre).toBe('Cliente SA');
    expect(s.conformidadNivel).toBe('completa');
    expect(s.selloTexto).toBe('Recibido');
    expect(s.fieldsRequested).toContain('cliente_rut');
    expect(s.modelUsed).toBe('claude-haiku-4-5-20251001');
    expect(Number(s.aiCostUsd)).toBeGreaterThan(0);
    expect(Number(s.pricePer1000Snapshot)).toBe(await computePricePer1000(t.db, t.company.id));
    expect(await t.store.exists(s.imageKey!)).toBe(true);
    expect(await t.store.exists(s.thumbKey!)).toBe(true);
    expect(isBillable(s)).toBe(true);
    await t.pg.close();
  });

  it('el mismo client_id crea una sola fila', async () => {
    const t = await setup();
    const a = await t.upload('same');
    const b = await t.upload('same');
    await t.queue.idle();
    expect(b.scanId).toBe(a.scanId);
    expect(b.duplicate).toBe(true);
    expect(await t.db.select().from(scans)).toHaveLength(1);
    expect(t.ai.calls()).toBe(1);
    await t.pg.close();
  });

  it('si la IA falla siempre termina en error y no se cobra', async () => {
    const t = await setup({ fail: true });
    const { scanId } = await t.upload('fail');
    await t.queue.idle();
    const s = await t.get(scanId);
    expect(s.status).toBe('error');
    expect(s.errorMessage).toBeTruthy();
    expect(s.errorMessage).not.toContain('personales');
    expect(t.ai.calls()).toBeGreaterThanOrEqual(3);
    expect(isBillable(s)).toBe(false);
    expect(JSON.stringify(t.logs)).not.toContain('personales');
    await t.pg.close();
  });

  it('respuesta de la IA inválida termina en error y no se cobra', async () => {
    const t = await setup({ text: 'no es json' });
    const { scanId } = await t.upload('bad');
    await t.queue.idle();
    const s = await t.get(scanId);
    expect(s.status).toBe('error');
    expect(isBillable(s)).toBe(false);
    await t.pg.close();
  });

  it('la recuperación de arranque reprocesa un escaneo procesando viejo', async () => {
    const t = await setup();
    // Se inserta sin encolar: simula un reinicio con el escaneo colgado.
    const idle = createScanQueue({ run: async () => undefined });
    const { scanId } = await createScan(
      t.db,
      t.store,
      {
        companyId: t.company.id,
        userId: t.user.id,
        clientId: 'old',
        capturedAt: new Date(),
        image: invoiceJpeg,
      },
      idle,
    );
    // Reciente: no se toca.
    expect(await recoverStuckScans(t.db, t.queue)).toBe(0);
    await t.db
      .update(scans)
      .set({ uploadedAt: new Date(Date.now() - 5 * 60_000) })
      .where(eq(scans.id, scanId));
    expect(await recoverStuckScans(t.db, t.queue)).toBe(1);
    await t.queue.idle();
    expect((await t.get(scanId)).status).toBe('listo');
    await t.pg.close();
  });

  it('cambiar los campos de la empresa no altera el snapshot anterior', async () => {
    const t = await setup();
    const { scanId } = await t.upload('snap');
    await t.queue.idle();
    const before = (await t.get(scanId)).pricePer1000Snapshot;
    await t.db
      .insert(companyFields)
      .values({ companyId: t.company.id, fieldKey: 'fact_item_codigo', enabled: true });
    expect(await computePricePer1000(t.db, t.company.id)).toBeGreaterThan(Number(before));
    expect((await t.get(scanId)).pricePer1000Snapshot).toBe(before);
    await t.pg.close();
  });

  it('reescanear oculta el anterior sin cambiar su estado', async () => {
    const t = await setup();
    const first = await t.upload('r-1');
    await t.queue.idle();
    const second = await t.upload('r-2', { replacesScanId: first.scanId });
    await t.queue.idle();
    const old = await t.get(first.scanId);
    expect(old.deletedAt).not.toBeNull();
    expect(old.status).toBe('listo');
    expect(isBillable(old)).toBe(true);
    expect((await t.get(second.scanId)).replacesScanId).toBe(first.scanId);
    await t.pg.close();
  });

  it('un modelo sin precio no falla el escaneo: costo null y se loguea', async () => {
    const t = await setup();
    await t.db.delete(modelPrices);
    const { scanId } = await t.upload('noprice');
    await t.queue.idle();
    const s = await t.get(scanId);
    expect(s.status).toBe('listo');
    expect(s.aiCostUsd).toBeNull();
    expect(t.logs.some((l) => l.event === 'scan.model_without_price')).toBe(true);
    await t.pg.close();
  });

  it('la cola respeta la concurrencia', async () => {
    let active = 0;
    let peak = 0;
    const q = createScanQueue({
      concurrency: 2,
      run: async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 10));
        active--;
      },
    });
    ['a', 'b', 'c', 'd', 'e'].forEach((id) => q.enqueue(id));
    await q.idle();
    expect(peak).toBe(2);
  });
});

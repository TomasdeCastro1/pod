import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prepareZXingModule, writeBarcode } from 'zxing-wasm/writer';
import type { ModelClient } from '../ai/client.js';
import { eq } from 'drizzle-orm';
import { scans } from '../db/schema.js';
import { seed, type AnyDb } from '../db/seed/index.js';
import { LocalStore } from '../storage/index.js';
import { createTestApp, type TestCtx } from '../test/helpers.js';
import { processScan } from './process.js';
import { createScanQueue, type ScanQueue } from './queue.js';

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

let aiCalls = 0;
const client: ModelClient = {
  messages: {
    async create() {
      aiCalls++;
      return {
        content: [{ type: 'text', text: AI_JSON }],
        usage: { input_tokens: 1200, output_tokens: 80 },
      };
    },
  },
};

let ctx: TestCtx;
let queue: ScanQueue;
let ana: { id: string; auth: string };
let beto: { id: string; auth: string };
let companyId: string;

beforeEach(async () => {
  aiCalls = 0;
  const store = new LocalStore(await mkdtemp(join(tmpdir(), 'scans-routes-')));
  let real: ScanQueue | undefined; // eslint-disable-line prefer-const
  const lazy: ScanQueue = {
    enqueue: (id) => real!.enqueue(id),
    idle: () => real!.idle(),
  };
  ctx = await createTestApp({ store, scanQueue: lazy });
  await seed(ctx.db as unknown as AnyDb);
  real = createScanQueue({
    run: (id) =>
      processScan(
        {
          db: ctx.db as unknown as AnyDb,
          store,
          client,
          models: { primary: 'claude-haiku-4-5-20251001', secondary: 'claude-sonnet-5-5' },
          routePaperReturnsToSecondary: false,
          retryDelaysMs: [1, 1],
          log: () => undefined,
        },
        id,
      ),
  });
  queue = lazy;
  ana = await ctx.createUser('ana@example.com', 'Ana');
  beto = await ctx.createUser('beto@example.com', 'Beto');
  const r = await request(ctx.app)
    .post('/companies')
    .set('Authorization', ana.auth)
    .send({ nombre: 'ACME', rut: COMPANY_RUT });
  companyId = r.body.company.id;
});
afterEach(async () => {
  await ctx.close();
});

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

const CLIENT_ID = '0b8f5c1e-3a52-4c1b-9d2e-7f6a1b2c3d4e';

function upload(auth: string, image: Buffer = invoiceJpeg, clientId = CLIENT_ID, cid = companyId) {
  return request(ctx.app)
    .post(`/companies/${cid}/scans`)
    .set('Authorization', auth)
    .field('client_id', clientId)
    .field('captured_at', '2026-09-24T12:00:00Z')
    .field('lat', '-34.9')
    .field('lng', '-56.16')
    .attach('image', image, { filename: 'a.jpg', contentType: 'image/jpeg' });
}

describe('POST /companies/:id/scans y GET /scans/:id', () => {
  it('sube, pasa de procesando a listo y devuelve la tarjeta completa', async () => {
    const up = await upload(ana.auth);
    expect(up.status).toBe(201);
    expect(up.body.status).toBe('procesando');
    const id = up.body.scan_id as string;

    const first = await request(ctx.app).get(`/scans/${id}`).set('Authorization', ana.auth);
    expect(first.status).toBe(200);
    expect(first.body.status).toBe('procesando');
    expect(first.body.alert).toBeNull();

    await queue.idle();
    const r = await request(ctx.app).get(`/scans/${id}`).set('Authorization', ana.auth);
    expect(r.body).toMatchObject({
      id,
      status: 'listo',
      doc_type: 'factura_emitida',
      conformidad_nivel: 'completa',
      cliente_nombre: 'Cliente SA',
      local: 'Sucursal 1',
      serie: 'A',
      numero: '6129',
      fecha_documento: '2026-09-24',
      total: 1727.91,
      revisar: [],
      reviewed: false,
      reviewed_at: null,
      captured_at: '2026-09-24T12:00:00.000Z',
      alert: null,
    });
    expect(r.body.fields.cliente_rut).toEqual({ value: '216981070018', corrected: false });
    expect(r.body.fields.numero.value).toBe(6129);
    expect(r.body.thumb_url).toContain(`/files/${id}/thumb?`);
  });

  it('el DTO no expone costo, tokens ni modelo', async () => {
    const id = (await upload(ana.auth)).body.scan_id as string;
    await queue.idle();
    const r = await request(ctx.app).get(`/scans/${id}`).set('Authorization', ana.auth);
    const text = JSON.stringify(r.body);
    for (const w of ['ai_cost', 'tokens', 'model', 'price_per', 'aiCost']) {
      expect(text).not.toContain(w);
    }
  });

  it('repetir el client_id devuelve el mismo scan_id sin reprocesar', async () => {
    const a = await upload(ana.auth);
    await queue.idle();
    const calls = aiCalls;
    const b = await upload(ana.auth);
    await queue.idle();
    expect(b.status).toBe(200);
    expect(b.body.scan_id).toBe(a.body.scan_id);
    expect(b.body.status).toBe('listo');
    expect(aiCalls).toBe(calls);
    expect(await ctx.db.select().from(scans)).toHaveLength(1);
  });

  it('más de 5 MB devuelve 413', async () => {
    const big = Buffer.concat([invoiceJpeg, Buffer.alloc(5 * 1024 * 1024 + 10)]);
    const r = await upload(ana.auth, big);
    expect(r.status).toBe(413);
    expect(await ctx.db.select().from(scans)).toHaveLength(0);
  });

  it('valida el cuerpo: sin imagen, no JPEG o client_id inválido dan 400', async () => {
    const noImage = await request(ctx.app)
      .post(`/companies/${companyId}/scans`)
      .set('Authorization', ana.auth)
      .field('client_id', CLIENT_ID)
      .field('captured_at', '2026-09-24T12:00:00Z');
    expect(noImage.status).toBe(400);
    expect((await upload(ana.auth, Buffer.from('no soy jpeg'))).status).toBe(400);
    expect((await upload(ana.auth, invoiceJpeg, 'abc')).status).toBe(400);
  });

  it('un usuario de otra empresa recibe 404 al subir y al consultar', async () => {
    expect((await upload(beto.auth)).status).toBe(404);
    const id = (await upload(ana.auth)).body.scan_id as string;
    for (const path of [`/scans/${id}`, `/scans/${id}/image`, `/scans/${id}/thumb`]) {
      expect((await request(ctx.app).get(path).set('Authorization', beto.auth)).status).toBe(404);
    }
    expect((await request(ctx.app).get(`/scans/${id}`)).status).toBe(401);
  });

  it('replaces_scan_id debe ser de la misma empresa', async () => {
    const id = (await upload(ana.auth)).body.scan_id as string;
    await queue.idle();
    const ok = await upload(ana.auth, invoiceJpeg, '1b8f5c1e-3a52-4c1b-9d2e-7f6a1b2c3d4e').field(
      'replaces_scan_id',
      id,
    );
    expect(ok.status).toBe(201);
    const bad = await upload(ana.auth, invoiceJpeg, '2b8f5c1e-3a52-4c1b-9d2e-7f6a1b2c3d4e').field(
      'replaces_scan_id',
      '3b8f5c1e-3a52-4c1b-9d2e-7f6a1b2c3d4e',
    );
    expect(bad.status).toBe(400);
  });

  it('un client_id de otra empresa no se revela', async () => {
    await upload(ana.auth);
    const c2 = await request(ctx.app)
      .post('/companies')
      .set('Authorization', beto.auth)
      .send({ nombre: 'Otra', rut: COMPANY_RUT });
    const r = await upload(beto.auth, invoiceJpeg, CLIENT_ID, c2.body.company.id);
    expect(r.status).toBe(404);
  });
});

describe('alertas', () => {
  it('error, sin_firma, no_reconocido y revisar', async () => {
    const id = (await upload(ana.auth)).body.scan_id as string;
    await queue.idle();
    const alertFor = async (patch: Partial<typeof scans.$inferInsert>) => {
      await ctx.db.update(scans).set(patch).where(eqId(id));
      const r = await request(ctx.app).get(`/scans/${id}`).set('Authorization', ana.auth);
      return r.body.alert;
    };
    expect(await alertFor({ conformidadNivel: 'dudosa' })).toBe('sin_firma');
    expect(await alertFor({ conformidadNivel: 'sin_firma' })).toBe('sin_firma');
    expect(await alertFor({ conformidadNivel: 'completa', docType: 'no_reconocido' })).toBe(
      'no_reconocido',
    );
    expect(
      await alertFor({
        docType: 'factura_emitida',
        extracted: { revisar: [{ campo: 'total', motivo: 'tapado' }] },
      }),
    ).toBe('revisar');
    expect(await alertFor({ status: 'error' })).toBe('error');
  });

  it('las correcciones se leen con corrected: true', async () => {
    const id = (await upload(ana.auth)).body.scan_id as string;
    await queue.idle();
    await ctx.db
      .update(scans)
      .set({ corrections: { cliente_rut: '111' } })
      .where(eqId(id));
    const r = await request(ctx.app).get(`/scans/${id}`).set('Authorization', ana.auth);
    expect(r.body.fields.cliente_rut).toEqual({
      value: '111',
      corrected: true,
      original: '216981070018',
    });
    expect(r.body.fields.numero).not.toHaveProperty('original');
  });
});

describe('URLs firmadas', () => {
  it('image y thumb devuelven una URL que sirve la imagen', async () => {
    const id = (await upload(ana.auth)).body.scan_id as string;
    for (const variant of ['image', 'thumb']) {
      const r = await request(ctx.app)
        .get(`/scans/${id}/${variant}`)
        .set('Authorization', ana.auth);
      expect(r.status).toBe(200);
      const exp = new Date(r.body.expires_at).getTime() - Date.now();
      expect(exp).toBeGreaterThan(290_000);
      expect(exp).toBeLessThanOrEqual(300_000);
      const u = new URL(r.body.url as string);
      const file = await request(ctx.app).get(u.pathname + u.search);
      expect(file.status).toBe(200);
      expect(file.headers['content-type']).toBe('image/jpeg');
    }
  });
});

function eqId(id: string) {
  return eq(scans.id, id);
}

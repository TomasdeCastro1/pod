import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { createRequire } from 'node:module';
import { prepareZXingModule, writeBarcode } from 'zxing-wasm/writer';
import { describe, expect, it } from 'vitest';
import { decodeQr } from './decode.js';
import { parseDgiQr } from './dgi.js';

const URL_DGI =
  'https://www.efactura.dgi.gub.uy/consultaQR/cfe?219419590017,111,A,6129,1727.91,24/09/2026,Zm9vYmFy';

let writerReady: Promise<unknown> | null = null;
async function qrPng(text: string): Promise<Buffer> {
  writerReady ??= (async () => {
    const path = createRequire(import.meta.url).resolve('zxing-wasm/writer/zxing_writer.wasm');
    const wasmBinary = readFileSync(path).buffer as ArrayBuffer;
    await prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true });
  })();
  await writerReady;
  const res = await writeBarcode(text, { format: 'QRCode', scale: 4, addQuietZones: true });
  if (!res.image) throw new Error(res.error || 'no QR image');
  return Buffer.from(await res.image.arrayBuffer());
}

/** Places the QR on a big white canvas, like a photo with the code somewhere inside. */
async function photoWithQr(text: string, gravity: 'south' | 'north' | 'centre'): Promise<Buffer> {
  const qr = await sharp(await qrPng(text))
    .resize(220, 220, { kernel: 'nearest' })
    .toBuffer();
  return sharp({ create: { width: 2400, height: 3200, channels: 3, background: '#f2f2f2' } })
    .composite([{ input: qr, gravity }])
    .jpeg({ quality: 80 })
    .toBuffer();
}

describe('decodeQr (synthetic)', () => {
  it.each(['south', 'north', 'centre'] as const)('reads a DGI QR placed at %s', async (g) => {
    const raw = await decodeQr(await photoWithQr(URL_DGI, g));
    expect(raw).toBe(URL_DGI);
    expect(parseDgiQr(raw!).data.numero).toBe(6129);
  });

  it('reads a small QR that needs the cropped strategies', async () => {
    const qr = await sharp(await qrPng(URL_DGI))
      .resize(140, 140, { kernel: 'nearest' })
      .toBuffer();
    const jpeg = await sharp({
      create: { width: 3000, height: 4000, channels: 3, background: '#fff' },
    })
      .composite([{ input: qr, gravity: 'south' }])
      .jpeg()
      .toBuffer();
    expect(await decodeQr(jpeg)).toBe(URL_DGI);
  });

  it('returns null when there is no QR', async () => {
    const blank = await sharp({
      create: { width: 1200, height: 1600, channels: 3, background: '#fff' },
    })
      .jpeg()
      .toBuffer();
    expect(await decodeQr(blank)).toBeNull();
  });

  it('returns null for garbage input', async () => {
    expect(await decodeQr(Buffer.from('not an image'))).toBeNull();
  });
});

const samples = resolve(import.meta.dirname, '../../../samples');
const has = (n: string) => existsSync(resolve(samples, n));
const read = (n: string) => readFileSync(resolve(samples, n));

describe.skipIf(!has('01.jpg'))('decodeQr (sample photos)', () => {
  it('01: e-Factura A 6129', async () => {
    const r = parseDgiQr((await decodeQr(read('01.jpg')))!);
    expect(r.isDgi).toBe(true);
    expect(r.data).toMatchObject({
      rut_emisor: '219419590017',
      serie: 'A',
      numero: 6129,
      total: 1727.91,
      fecha_documento: '2026-09-24',
    });
  });

  it.skipIf(!has('11.jpg'))('11: e-Remito S 2213900', async () => {
    const r = parseDgiQr((await decodeQr(read('11.jpg')))!);
    expect(r.data).toMatchObject({
      rut_emisor: '214214350013',
      serie: 'S',
      numero: 2213900,
      fecha_documento: '2026-10-02',
    });
  });

  it.skipIf(!has('02.jpg'))('02: QR that is not DGI', async () => {
    const raw = await decodeQr(read('02.jpg'));
    expect(raw).not.toBeNull();
    expect(parseDgiQr(raw!).isDgi).toBe(false);
  });

  it.each(['03.jpg', '04.jpg'])('%s: no QR', async (f) => {
    if (!has(f)) return;
    expect(await decodeQr(read(f))).toBeNull();
  });
});

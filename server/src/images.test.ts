import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { makeAiCopy, makeThumb, normalizeUpload } from './images.js';

const make = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#808080' } })
    .jpeg()
    .toBuffer();

describe('images', () => {
  it('normalizeUpload reduce a 1.600 px y respeta EXIF', async () => {
    const big = await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: '#fff' },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const meta = await sharp(await normalizeUpload(big)).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBeLessThan(meta.height!);
    expect(Math.max(meta.width!, meta.height!)).toBe(1600);
  });

  it('makeThumb da 300 px de lado largo', async () => {
    const meta = await sharp(await makeThumb(await make(1600, 2263))).metadata();
    expect(meta.height).toBe(300);
  });

  it('makeAiCopy: A4 de 1.600x2.263 respeta 1.568 px y 1,15 MP', async () => {
    const r = await makeAiCopy(await make(1600, 2263), { preclassifiedInvoice: false });
    expect(Math.max(r.width, r.height)).toBeLessThanOrEqual(1568);
    expect(r.width * r.height).toBeLessThanOrEqual(1_150_000);
    expect(r.width * r.height).toBeGreaterThan(1_000_000);
    const meta = await sharp(r.buffer).metadata();
    expect([meta.width, meta.height]).toEqual([r.width, r.height]);
  });

  it('makeAiCopy: térmica angosta de 600x1.600 limitada por el lado largo', async () => {
    const r = await makeAiCopy(await make(600, 1600), { preclassifiedInvoice: false });
    expect(r.height).toBeLessThanOrEqual(1568);
    expect(r.width * r.height).toBeLessThanOrEqual(1_150_000);
  });

  it('makeAiCopy: factura preclasificada a 1.000 px y no agranda', async () => {
    const r = await makeAiCopy(await make(600, 1600), { preclassifiedInvoice: true });
    expect(r.height).toBe(1000);
    const small = await makeAiCopy(await make(300, 500), { preclassifiedInvoice: true });
    expect([small.width, small.height]).toEqual([300, 500]);
  });
});

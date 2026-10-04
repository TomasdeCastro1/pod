import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { prepareZXingModule, readBarcodes, type ReaderOptions } from 'zxing-wasm/reader';

// By default zxing-wasm downloads its .wasm from a CDN; load it from disk instead
// so the server works offline and without a network dependency.
let ready: Promise<unknown> | null = null;
function prepareReader(): Promise<unknown> {
  ready ??= (async () => {
    const path = createRequire(import.meta.url).resolve('zxing-wasm/reader/zxing_reader.wasm');
    const wasmBinary = (await readFile(path)).buffer as ArrayBuffer;
    await prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true });
  })();
  return ready;
}

const READER_OPTIONS: ReaderOptions = {
  formats: ['QRCode'],
  tryHarder: true,
  tryRotate: true,
  tryInvert: true,
  maxNumberOfSymbols: 1,
};

type Attempt = { width: number; threshold: boolean; crop?: 'bottom' | 'top' };

/** Strategies in order; the first one that reads a QR wins. */
const ATTEMPTS: Attempt[] = [
  { width: 1600, threshold: false },
  { width: 1000, threshold: false },
  { width: 2000, threshold: false },
  { width: 1600, threshold: true },
  { width: 1600, threshold: false, crop: 'bottom' },
  { width: 1600, threshold: false, crop: 'top' },
  { width: 1600, threshold: true, crop: 'bottom' },
  { width: 1600, threshold: true, crop: 'top' },
];

async function tryRead(jpeg: Buffer, a: Attempt): Promise<string | null> {
  // Rotate first so EXIF orientation does not matter, then fix the long side.
  const base = await sharp(jpeg).rotate().toBuffer({ resolveWithObject: true });
  const { width } = base.info;
  let { height } = base.info;
  let pipeline = sharp(base.data);
  if (a.crop) {
    const h = Math.ceil(height / 3);
    pipeline = pipeline.extract({
      left: 0,
      top: a.crop === 'bottom' ? height - h : 0,
      width,
      height: h,
    });
    height = h;
  }
  const long = Math.max(width, height);
  const resizeOpts = long >= height && width >= height ? { width: a.width } : { height: a.width };
  pipeline = pipeline.resize({ ...resizeOpts, withoutEnlargement: false }).greyscale();
  if (a.threshold) pipeline = pipeline.normalize().threshold();
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });

  // zxing-wasm wants RGBA ImageData-like input.
  const rgba = new Uint8ClampedArray(info.width * info.height * 4);
  const channels = info.channels;
  for (let i = 0, j = 0; i < info.width * info.height; i++, j += 4) {
    const v = data[i * channels]!;
    rgba[j] = v;
    rgba[j + 1] = v;
    rgba[j + 2] = v;
    rgba[j + 3] = 255;
  }
  const results = await readBarcodes(
    { data: rgba, width: info.width, height: info.height, colorSpace: 'srgb' },
    READER_OPTIONS,
  );
  const hit = results.find((r) => r.isValid && r.text);
  return hit ? hit.text : null;
}

/** Looks for a QR in a JPEG and returns its text, or null if none is found. */
export async function decodeQr(jpeg: Buffer): Promise<string | null> {
  try {
    await prepareReader();
  } catch (err) {
    ready = null;
    throw err;
  }
  for (const attempt of ATTEMPTS) {
    try {
      const text = await tryRead(jpeg, attempt);
      if (text) return text;
    } catch {
      // A failing strategy must not prevent the next one from running.
    }
  }
  return null;
}

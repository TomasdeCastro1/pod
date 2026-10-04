import sharp from 'sharp';

const MAX_UPLOAD_PX = 1600;
const THUMB_PX = 300;
const AI_INVOICE_PX = 1000;
const AI_MAX_PX = 1568;
const AI_MAX_PIXELS = 1_150_000;

export interface AiCopy {
  buffer: Buffer;
  width: number;
  height: number;
}

/** Aplica la rotación EXIF, convierte a JPEG y limita el lado largo a 1.600 px. */
export async function normalizeUpload(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize({
      width: MAX_UPLOAD_PX,
      height: MAX_UPLOAD_PX,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 90 })
    .toBuffer();
}

/** Miniatura de 300 px de lado largo, JPEG calidad 75. */
export async function makeThumb(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize({ width: THUMB_PX, height: THUMB_PX, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 75 })
    .toBuffer();
}

/** Copia para la IA (no se guarda). Factura preclasificada: 1.000 px; resto: 1.568 px y 1,15 MP. */
export async function makeAiCopy(
  buffer: Buffer,
  opts: { preclassifiedInvoice: boolean },
): Promise<AiCopy> {
  const rotated = await sharp(buffer).rotate().toBuffer({ resolveWithObject: true });
  const { width: w0, height: h0 } = rotated.info;
  const longSide = Math.max(w0, h0);
  const maxLong = opts.preclassifiedInvoice ? AI_INVOICE_PX : AI_MAX_PX;
  let scale = Math.min(1, maxLong / longSide);
  if (!opts.preclassifiedInvoice) scale = Math.min(scale, Math.sqrt(AI_MAX_PIXELS / (w0 * h0)));
  // floor para no pasarse de los límites por redondeo.
  const width = Math.max(1, Math.floor(w0 * scale));
  const height = Math.max(1, Math.floor(h0 * scale));
  const out = await sharp(rotated.data)
    .resize({ width, height, fit: 'fill' })
    .jpeg({ quality: 85 })
    .toBuffer({ resolveWithObject: true });
  return { buffer: out.data, width: out.info.width, height: out.info.height };
}

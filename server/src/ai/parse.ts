import { logger } from '../logger.js';
import { z } from 'zod';

export const TIPOS_DOCUMENTO = [
  'factura_emitida',
  'nota_credito_emitida',
  'devolucion_cliente',
  'otro',
  'no_reconocido',
] as const;
export const CONFORMIDADES = ['completa', 'firma_sola', 'dudosa', 'sin_firma'] as const;

export type Scalar = string | number | boolean;
export type ExtractedItem = Record<string, Scalar>;
export interface ReviewEntry {
  campo: string;
  motivo: string;
}
export interface ExtractedData {
  items?: ExtractedItem[];
  revisar: ReviewEntry[];
  [key: string]: Scalar | ExtractedItem[] | ReviewEntry[] | undefined;
}

export type ParseOutcome =
  { ok: true; data: ExtractedData; droppedKeys: string[] } | { ok: false; error: string };

const scalar = z.union([z.string(), z.number(), z.boolean()]);

/** Quita ```json … ``` y texto alrededor; devuelve el objeto JSON como texto. */
export function extractJsonText(text: string): string {
  let s = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  if (fence) s = fence[1]!.trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  return s;
}

function stripNulls(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripNulls);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([, x]) => x !== null)
        .map(([k, x]) => [k, stripNulls(x)]),
    );
  }
  return v;
}

/** Esquema zod armado con las claves pedidas (spec 9.1). Las claves extra se descartan (strip). */
export function buildSchema(requestedKeys: string[], itemKeys: string[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const k of requestedKeys) {
    if (k === 'items' || k === 'revisar') continue;
    if (k === 'conformidad_nivel') shape[k] = z.enum(CONFORMIDADES).optional();
    else if (k === 'tipo_documento') shape[k] = z.enum(TIPOS_DOCUMENTO).optional();
    else shape[k] = scalar.optional();
  }
  const itemShape: Record<string, z.ZodTypeAny> = {};
  for (const k of itemKeys) itemShape[k] = scalar.optional();
  if (requestedKeys.includes('items') || itemKeys.length > 0) {
    shape.items = z.array(z.object(itemShape)).optional();
  }
  shape.revisar = z.array(z.object({ campo: z.string(), motivo: z.string() })).default([]);
  return z.object(shape);
}

export function parseResponse(
  text: string,
  requestedKeys: string[],
  itemKeys: string[],
): ParseOutcome {
  let raw: unknown;
  try {
    raw = JSON.parse(extractJsonText(text));
  } catch {
    return { ok: false, error: 'JSON inválido' };
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'La respuesta no es un objeto JSON' };
  }
  const cleaned = stripNulls(raw) as Record<string, unknown>;
  const schema = buildSchema(requestedKeys, itemKeys);
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    };
  }
  const known = new Set(Object.keys(schema.shape));
  const droppedKeys = Object.keys(cleaned).filter((k) => !known.has(k));
  if (droppedKeys.length > 0) {
    logger.debug({ event: 'ai.dropped_keys', keys: droppedKeys });
  }
  return { ok: true, data: parsed.data as ExtractedData, droppedKeys };
}

import { logger } from '../logger.js';
import { classifyFromQr, type DocType } from '@app/shared';
import { eq } from 'drizzle-orm';
import { buildPrompt, type QrData } from '../ai/buildPrompt.js';
import type { ModelClient } from '../ai/client.js';
import type { ModelPrices } from '../ai/cost.js';
import { extract } from '../ai/extract.js';
import { getCatalog, getCompanyFields, computePricePer1000 } from '../catalog.js';
import { companies, modelPrices, scans } from '../db/schema.js';
import type { AnyDb } from '../db/seed/index.js';
import { makeAiCopy } from '../images.js';
import { decodeQr } from '../qr/decode.js';
import { parseDgiQr } from '../qr/dgi.js';
import type { ObjectStore } from '../storage/index.js';

export interface PipelineDeps {
  db: AnyDb;
  store: ObjectStore;
  client: ModelClient;
  models: { primary: string; secondary: string };
  routePaperReturnsToSecondary: boolean;
  /** Waits between attempts after an exception. Default 1 s and 4 s (so 3 attempts). */
  retryDelaysMs?: number[];
  log?: (event: Record<string, unknown>) => void;
}

const DEFAULT_RETRY_DELAYS = [1000, 4000];
const ERROR_MESSAGE_AI = 'La IA no devolvió una respuesta válida';
const ERROR_MESSAGE_GENERIC = 'No se pudo procesar la imagen';

const defaultLog = (event: Record<string, unknown>) => logger.info(event);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function str(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

/**
 * Runs the whole pipeline for one scan and leaves it in a final state. Never throws:
 * after the retries (1 s, 4 s) the scan is marked `error` with a short message.
 */
export async function processScan(deps: PipelineDeps, scanId: string): Promise<void> {
  const delays = deps.retryDelaysMs ?? DEFAULT_RETRY_DELAYS;
  const log = deps.log ?? defaultLog;
  const t0 = performance.now();
  let lastError: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (attempt > 0) await sleep(delays[attempt - 1]!);
    try {
      const outcome = await runOnce(deps, scanId, log);
      if (outcome === 'skipped') return;
      log({
        event: 'scan.done',
        scanId,
        attempt: attempt + 1,
        ms_total: Math.round(performance.now() - t0),
      });
      return;
    } catch (err) {
      lastError = err;
      log({
        event: 'scan.attempt_failed',
        scanId,
        attempt: attempt + 1,
        // Only the error class: messages could include request content.
        error: err instanceof Error ? err.name : 'unknown',
      });
    }
  }
  log({
    event: 'scan.failed',
    scanId,
    error: lastError instanceof Error ? lastError.name : 'unknown',
    ms_total: Math.round(performance.now() - t0),
  });
  try {
    await deps.db
      .update(scans)
      .set({ status: 'error', errorMessage: ERROR_MESSAGE_GENERIC })
      .where(eq(scans.id, scanId));
  } catch {
    // The row stays `procesando`; startup recovery will pick it up again.
  }
}

async function runOnce(
  deps: PipelineDeps,
  scanId: string,
  log: (event: Record<string, unknown>) => void,
): Promise<'done' | 'skipped'> {
  const { db } = deps;
  const [scan] = await db.select().from(scans).where(eq(scans.id, scanId));
  if (!scan || scan.status !== 'procesando' || !scan.imageKey) return 'skipped';
  const [company] = await db.select().from(companies).where(eq(companies.id, scan.companyId));
  if (!company) throw new Error('company missing');

  const image = await deps.store.get(scan.imageKey);

  // QR
  const tQr = performance.now();
  const qrRaw = await decodeQr(image);
  const dgi = qrRaw ? parseDgiQr(qrRaw) : null;
  const qrData: QrData = dgi?.isDgi ? { ...dgi.data } : {};
  const ms_qr = Math.round(performance.now() - tQr);
  await db
    .update(scans)
    .set({
      qrRaw,
      qrData: dgi?.isDgi ? { ...dgi.data } : null,
      qrParcial: dgi?.isDgi ? dgi.partial : false,
    })
    .where(eq(scans.id, scanId));

  let preclassified: DocType | null = null;
  if (dgi?.isDgi && dgi.data.rut_emisor !== undefined && dgi.data.tipo_cfe !== undefined) {
    preclassified = classifyFromQr(dgi.data.rut_emisor, company.rut, dgi.data.tipo_cfe);
  }

  const aiCopy = await makeAiCopy(image, {
    preclassifiedInvoice: preclassified === 'factura_emitida',
  });

  // The company's fields at this moment, not when the scan was uploaded.
  const [catalog, fields] = await Promise.all([getCatalog(db), getCompanyFields(db, company.id)]);
  const prompt = buildPrompt({
    company: { nombre: company.nombre, rut: company.rut },
    catalog,
    enabledOptional: fields.filter((f) => f.enabled && !f.isBase).map((f) => f.key),
    preclassified,
    qrData,
  });
  await db.update(scans).set({ fieldsRequested: prompt.requestedKeys }).where(eq(scans.id, scanId));

  // Prices. A model without a price must not fail a scan the AI already read: use 0 so extract
  // does not throw, log it, and store the cost as null.
  const priceRows = await db.select().from(modelPrices);
  const prices: ModelPrices = Object.fromEntries(
    priceRows.map((r) => [
      r.model,
      { inputPerMtokUsd: r.inputPerMtokUsd, outputPerMtokUsd: r.outputPerMtokUsd },
    ]),
  );
  const missing = [deps.models.primary, deps.models.secondary].filter((m) => !(m in prices));
  for (const m of missing) prices[m] = { inputPerMtokUsd: 0, outputPerMtokUsd: 0 };

  const tAi = performance.now();
  const out = await extract({
    client: deps.client,
    models: deps.models,
    routePaperReturnsToSecondary: deps.routePaperReturnsToSecondary,
    modelPrices: prices,
    imageJpeg: aiCopy.buffer,
    prompt,
    qrData,
    companyRut: company.rut,
    preclassified,
  });
  const ms_ai = Math.round(performance.now() - tAi);

  const usedUnpriced = out.calls.some((c) => missing.includes(c.model));
  if (usedUnpriced) log({ event: 'scan.model_without_price', scanId, models: missing });

  const pricePer1000 = await computePricePer1000(db, company.id);
  const x = (out.extracted ?? {}) as Record<string, unknown>;
  const conformidad = str(x.conformidad_nivel);
  await db.transaction(async (tx) => {
    await tx
      .update(scans)
      .set({
        status: out.status,
        errorMessage: out.status === 'error' ? ERROR_MESSAGE_AI : null,
        docType: out.docType,
        extracted: out.extracted,
        clienteRut: str(x.cliente_rut),
        clienteNombre: str(x.cliente_nombre),
        local: str(x.local),
        numero: str(x.numero),
        serie: str(x.serie),
        fechaDocumento: str(x.fecha_documento),
        total: str(x.total),
        conformidadNivel: ['completa', 'firma_sola', 'dudosa', 'sin_firma'].includes(
          conformidad ?? '',
        )
          ? (conformidad as 'completa' | 'firma_sola' | 'dudosa' | 'sin_firma')
          : null,
        selloTexto: str(x.sello_texto),
        modelUsed: out.modelUsed,
        escalated: out.escalated,
        inputTokens: out.inputTokens,
        outputTokens: out.outputTokens,
        aiCostUsd: usedUnpriced ? null : String(out.aiCostUsd),
        pricePer1000Snapshot: String(pricePer1000),
      })
      .where(eq(scans.id, scanId));
  });

  log({
    event: 'scan.steps',
    scanId,
    ms_qr,
    ms_ai,
    status: out.status,
    escalated: out.escalated,
    qr: dgi === null ? 'none' : dgi.isDgi ? (dgi.partial ? 'partial' : 'ok') : 'not_dgi',
  });
  return 'done';
}

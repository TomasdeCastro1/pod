import type { DocType } from '@app/shared';
import { callModel, type CallModelResult, type ModelClient } from './client.js';
import type { QrData } from './buildPrompt.js';
import { costUsd, type ModelPrices } from './cost.js';
import { parseResponse, type ExtractedData } from './parse.js';
import { validate } from './validate.js';

export interface ExtractInput {
  client: ModelClient;
  models: { primary: string; secondary: string };
  routePaperReturnsToSecondary: boolean;
  modelPrices: ModelPrices;
  imageJpeg: Buffer;
  prompt: {
    system: string;
    userText: string;
    requestedKeys: string[];
    itemKeys: string[];
    maxTokens: number;
  };
  qrData: QrData;
  companyRut: string;
  preclassified: DocType | null;
}

export interface CallLog {
  model: string;
  inputTokens: number;
  outputTokens: number;
  validJson: boolean;
  droppedKeys: string[];
}

export interface ExtractOutput {
  status: 'listo' | 'revisar' | 'error';
  docType: DocType;
  extracted: ExtractedData | null;
  modelUsed: string;
  escalated: boolean;
  inputTokens: number;
  outputTokens: number;
  aiCostUsd: number;
  calls: CallLog[];
}

interface Attempt {
  validated: ReturnType<typeof validate> | null;
}

/** Orquesta la llamada al modelo primario, validación, reintento y escalado (spec 9.1 y 9.2). */
export async function extract(input: ExtractInput): Promise<ExtractOutput> {
  const calls: CallLog[] = [];
  const cost = { usd: 0, inTok: 0, outTok: 0 };

  const run = async (model: string): Promise<Attempt> => {
    const res: CallModelResult = await callModel({
      client: input.client,
      model,
      system: input.prompt.system,
      imageJpeg: input.imageJpeg,
      userText: input.prompt.userText,
      maxTokens: input.prompt.maxTokens,
    });
    const parsed = parseResponse(res.text, input.prompt.requestedKeys, input.prompt.itemKeys);
    calls.push({
      model,
      inputTokens: res.inputTokens,
      outputTokens: res.outputTokens,
      validJson: parsed.ok,
      droppedKeys: parsed.ok ? parsed.droppedKeys : [],
    });
    cost.inTok += res.inputTokens;
    cost.outTok += res.outputTokens;
    cost.usd += costUsd(model, res.inputTokens, res.outputTokens, input.modelPrices);
    if (!parsed.ok) return { validated: null };
    return {
      validated: validate(parsed.data, {
        qrData: input.qrData,
        companyRut: input.companyRut,
        preclassified: input.preclassified,
        requestedKeys: input.prompt.requestedKeys,
      }),
    };
  };

  const { primary, secondary } = input.models;
  // «Devolución sin QR de DGI»: sin QR el tipo no se conoce antes de la llamada, así que se
  // usa la ausencia de preclasificación como señal y se va directo al secundario.
  const direct = input.routePaperReturnsToSecondary && input.preclassified === null;

  let modelUsed = direct ? secondary : primary;
  let escalated = false;
  let escalationFailed = false;
  let attempt = await run(modelUsed);
  if (!direct && attempt.validated === null) attempt = await run(primary); // reintento, mismo modelo

  let final = attempt.validated;
  if (!direct && (final === null || final.mustEscalate)) {
    escalated = true;
    const second = await run(secondary);
    // Si el secundario no devolvió JSON válido, se conserva el resultado del primario (si hubo)
    // y queda a revisar.
    if (second.validated !== null) {
      final = second.validated;
      modelUsed = secondary;
    } else {
      escalationFailed = true;
    }
  }

  const base = {
    modelUsed,
    escalated,
    inputTokens: cost.inTok,
    outputTokens: cost.outTok,
    aiCostUsd: Math.round(cost.usd * 1e6) / 1e6,
    calls,
  };
  if (final === null) {
    return { ...base, status: 'error', docType: 'no_reconocido', extracted: null };
  }
  const extracted = final.result;
  const docType = (extracted.tipo_documento as DocType | undefined) ?? 'no_reconocido';
  const stillDoubtful = extracted.revisar.length > 0 || escalationFailed;
  return {
    ...base,
    status: stillDoubtful ? 'revisar' : 'listo',
    docType,
    extracted,
  };
}

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAnthropicClient } from './client.js';
import { extract } from './extract.js';

const sample = resolve(__dirname, '../../../samples/06.jpg');
const enabled = Boolean(process.env.ANTHROPIC_API_KEY) && existsSync(sample);

describe.skipIf(!enabled)('extract (API real)', () => {
  it('procesa samples/06.jpg', { timeout: 60_000 }, async () => {
    const r = await extract({
      client: createAnthropicClient(process.env.ANTHROPIC_API_KEY!),
      models: {
        primary: process.env.MODEL_PRIMARY ?? 'claude-haiku-4-5-20251001',
        secondary: process.env.MODEL_SECONDARY ?? 'claude-sonnet-5-5',
      },
      routePaperReturnsToSecondary: false,
      modelPrices: {
        'claude-haiku-4-5-20251001': { inputPerMtokUsd: 1, outputPerMtokUsd: 5 },
        'claude-sonnet-5-5': { inputPerMtokUsd: 3, outputPerMtokUsd: 15 },
      },
      imageJpeg: readFileSync(sample),
      prompt: {
        system:
          'Extraé datos de un comprobante uruguayo. Respondé solo con JSON compacto con las claves tipo_documento, rut_emisor, cliente_nombre, conformidad_nivel y revisar.',
        userText: 'Sin QR de DGI: clasificá el documento',
        requestedKeys: ['tipo_documento', 'rut_emisor', 'cliente_nombre', 'conformidad_nivel'],
        itemKeys: [],
        maxTokens: 500,
      },
      qrData: {},
      companyRut: '219419590017',
      preclassified: null,
    });
    expect(['listo', 'revisar']).toContain(r.status);
    expect(r.inputTokens).toBeGreaterThan(0);
  });
});

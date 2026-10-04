import { describe, expect, it } from 'vitest';
import type { ModelClient } from './client.js';
import { costUsd } from './cost.js';
import { extract, type ExtractInput } from './extract.js';
import { parseResponse } from './parse.js';

const COMPANY = '219419590017';
const GOOD_RUT = '216981070018';
const prices = {
  'haiku-x': { inputPerMtokUsd: '1.0000', outputPerMtokUsd: '5.0000' },
  'sonnet-x': { inputPerMtokUsd: 3, outputPerMtokUsd: 15 },
};

function fakeClient(responses: string[]) {
  const calls: Array<{ model: string; temperature?: number; params: unknown }> = [];
  const client: ModelClient = {
    messages: {
      async create(params) {
        const text = responses[calls.length];
        if (text === undefined) throw new Error('sin más respuestas');
        calls.push({ model: params.model, temperature: params.temperature, params });
        return {
          content: [{ type: 'text', text }],
          usage: { input_tokens: 1000, output_tokens: 100 },
        };
      },
    },
  };
  return { client, calls };
}

const baseKeys = ['cliente_rut', 'cliente_nombre', 'conformidad_nivel', 'sello_texto'];

function input(client: ModelClient, over: Partial<ExtractInput> = {}): ExtractInput {
  return {
    client,
    models: { primary: 'haiku-x', secondary: 'sonnet-x' },
    routePaperReturnsToSecondary: false,
    modelPrices: prices,
    imageJpeg: Buffer.from('jpg'),
    prompt: {
      system: 'sys',
      userText: 'txt',
      requestedKeys: baseKeys,
      itemKeys: [],
      maxTokens: 500,
    },
    qrData: {},
    companyRut: COMPANY,
    preclassified: 'factura_emitida',
    ...over,
  };
}

const ok = JSON.stringify({
  cliente_rut: GOOD_RUT,
  cliente_nombre: 'X SA',
  conformidad_nivel: 'completa',
});

describe('extract', () => {
  it('JSON válido y limpio: una llamada, listo', async () => {
    const { client, calls } = fakeClient([ok]);
    const r = await extract(input(client));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.temperature).toBe(0);
    expect(r.status).toBe('listo');
    expect(r.escalated).toBe(false);
    expect(r.docType).toBe('factura_emitida');
  });

  it('JSON roto y luego válido: dos llamadas al primario', async () => {
    const { client, calls } = fakeClient(['{roto', '```json\n' + ok + '\n```']);
    const r = await extract(input(client));
    expect(calls.map((c) => c.model)).toEqual(['haiku-x', 'haiku-x']);
    expect(r.escalated).toBe(false);
    expect(r.status).toBe('listo');
  });

  it('JSON roto dos veces: escala; si el secundario sirve, listo', async () => {
    const { client, calls } = fakeClient(['x', 'y', ok]);
    const r = await extract(input(client));
    expect(calls.map((c) => c.model)).toEqual(['haiku-x', 'haiku-x', 'sonnet-x']);
    expect(r.escalated).toBe(true);
    expect(r.status).toBe('listo');
  });

  it('nunca hubo JSON válido: error', async () => {
    const { client } = fakeClient(['x', 'y', 'z']);
    const r = await extract(input(client));
    expect(r.status).toBe('error');
    expect(r.extracted).toBeNull();
  });

  it('RUT inválido: escala, el secundario corrige, tokens sumados', async () => {
    const bad = JSON.stringify({ cliente_rut: '216981070019', conformidad_nivel: 'completa' });
    const { client, calls } = fakeClient([bad, ok]);
    const r = await extract(input(client));
    expect(calls).toHaveLength(2);
    expect(r.escalated).toBe(true);
    expect(r.modelUsed).toBe('sonnet-x');
    expect(r.status).toBe('listo');
    expect(r.inputTokens).toBe(2000);
    expect(r.outputTokens).toBe(200);
    expect(r.aiCostUsd).toBeCloseTo(
      costUsd('haiku-x', 1000, 100, prices) + costUsd('sonnet-x', 1000, 100, prices),
      9,
    );
  });

  it('dudosa: escala; el secundario también dice dudosa: listo con dudosa', async () => {
    const dudosa = JSON.stringify({ cliente_rut: GOOD_RUT, conformidad_nivel: 'dudosa' });
    const { client } = fakeClient([dudosa, dudosa]);
    const r = await extract(input(client));
    expect(r.escalated).toBe(true);
    expect(r.status).toBe('listo');
    expect(r.extracted?.conformidad_nivel).toBe('dudosa');
  });

  it('discrepancia QR/IA en número: gana el QR, queda en revisar', async () => {
    const keys = [...baseKeys, 'numero'];
    const resp = JSON.stringify({ cliente_rut: GOOD_RUT, numero: '6205' });
    const { client, calls } = fakeClient([resp, resp]);
    const r = await extract(
      input(client, {
        prompt: { system: '', userText: '', requestedKeys: keys, itemKeys: [], maxTokens: 1 },
        qrData: { numero: '6204', total: '1994.94' },
      }),
    );
    expect(calls).toHaveLength(2);
    expect(r.extracted?.numero).toBe('6204');
    expect(r.extracted?.total).toBe(1994.94);
    expect(r.extracted?.revisar.map((x) => x.campo)).toContain('numero');
    expect(r.status).toBe('revisar');
  });

  it('aritmética que no cierra: revisar sin escalar', async () => {
    const resp = JSON.stringify({
      cliente_rut: GOOD_RUT,
      subtotal: '100,00',
      iva: 22,
      total: 130,
      items: [{ cantidad: 1, importe: 100 }],
    });
    const { client, calls } = fakeClient([resp]);
    const r = await extract(
      input(client, {
        prompt: {
          system: '',
          userText: '',
          requestedKeys: ['cliente_rut', 'subtotal', 'iva', 'total', 'items'],
          itemKeys: ['cantidad', 'importe'],
          maxTokens: 1,
        },
      }),
    );
    expect(calls).toHaveLength(1);
    expect(r.escalated).toBe(false);
    expect(r.status).toBe('revisar');
    expect(r.extracted?.revisar[0]?.campo).toBe('total');
    expect(r.extracted?.subtotal).toBe(100);
  });

  it('aritmética correcta con tolerancia: listo', async () => {
    const resp = JSON.stringify({
      subtotal: 100,
      iva: 22,
      total: 122.04,
      items: [
        { cantidad: 2, importe: 60 },
        { cantidad: 1, importe: 40 },
      ],
    });
    const { client } = fakeClient([resp]);
    const r = await extract(
      input(client, {
        prompt: {
          system: '',
          userText: '',
          requestedKeys: ['subtotal', 'iva', 'total', 'items'],
          itemKeys: ['cantidad', 'importe'],
          maxTokens: 1,
        },
      }),
    );
    expect(r.status).toBe('listo');
  });

  it('cantidad no positiva: revisar sin escalar', async () => {
    const resp = JSON.stringify({ items: [{ codigo: 'A', cantidad: 0 }] });
    const { client, calls } = fakeClient([resp]);
    const r = await extract(
      input(client, {
        preclassified: 'devolucion_cliente',
        prompt: {
          system: '',
          userText: '',
          requestedKeys: ['items'],
          itemKeys: ['codigo', 'cantidad'],
          maxTokens: 1,
        },
      }),
    );
    expect(calls).toHaveLength(1);
    expect(r.status).toBe('revisar');
  });

  it('ROUTE_PAPER_RETURNS_TO_SECONDARY y sin QR: una sola llamada al secundario', async () => {
    const resp = JSON.stringify({ tipo_documento: 'devolucion_cliente', cliente_rut: GOOD_RUT });
    const { client, calls } = fakeClient([resp]);
    const r = await extract(
      input(client, {
        routePaperReturnsToSecondary: true,
        preclassified: null,
        prompt: {
          system: '',
          userText: '',
          requestedKeys: ['tipo_documento', 'cliente_rut'],
          itemKeys: [],
          maxTokens: 1,
        },
      }),
    );
    expect(calls.map((c) => c.model)).toEqual(['sonnet-x']);
    expect(r.status).toBe('listo');
    expect(r.docType).toBe('devolucion_cliente');
    expect(r.escalated).toBe(false);
  });

  it('el QR fuerza el tipo y no_reconocido queda listo', async () => {
    const { client } = fakeClient([JSON.stringify({ tipo_documento: 'no_reconocido' })]);
    const r = await extract(
      input(client, {
        preclassified: null,
        prompt: {
          system: '',
          userText: '',
          requestedKeys: ['tipo_documento'],
          itemKeys: [],
          maxTokens: 1,
        },
      }),
    );
    expect(r.docType).toBe('no_reconocido');
    expect(r.status).toBe('listo');
  });
});

describe('costUsd', () => {
  it('coincide con la fórmula', () => {
    // 2000 × 1 / 1e6 + 500 × 5 / 1e6 = 0,0045
    expect(costUsd('haiku-x', 2000, 500, prices)).toBeCloseTo(0.0045, 9);
    expect(() => costUsd('otro', 1, 1, prices)).toThrow();
  });
});

describe('parseResponse', () => {
  it('descarta claves extra y tolera null y cercos', () => {
    const r = parseResponse(
      '```json\n{"cliente_nombre":"A","extra":1,"local":null}\n```',
      ['cliente_nombre', 'local'],
      [],
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.droppedKeys).toEqual(['extra']);
      expect(r.data).toEqual({ cliente_nombre: 'A', revisar: [] });
    }
  });
  it('rechaza enums inválidos', () => {
    expect(parseResponse('{"conformidad_nivel":"mala"}', ['conformidad_nivel'], []).ok).toBe(false);
  });
});

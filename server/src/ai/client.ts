import Anthropic from '@anthropic-ai/sdk';

/** Subconjunto mínimo del SDK que usamos; permite inyectar un cliente falso en tests. */
export interface ModelClient {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<{
      content: Array<{ type: string; text?: string }>;
      usage: { input_tokens: number; output_tokens: number };
    }>;
  };
}

export function createAnthropicClient(apiKey: string): ModelClient {
  return new Anthropic({ apiKey }) as unknown as ModelClient;
}

export interface CallModelInput {
  client: ModelClient;
  model: string;
  system: string;
  imageJpeg: Buffer;
  userText: string;
  maxTokens: number;
}

export interface CallModelResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

/**
 * Una llamada al modelo: imagen y después texto, temperature 0.
 * Sin tool use y sin prompt caching (spec 8.4).
 */
export async function callModel(input: CallModelInput): Promise<CallModelResult> {
  const res = await input.client.messages.create({
    model: input.model,
    max_tokens: input.maxTokens,
    temperature: 0,
    system: input.system,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: input.imageJpeg.toString('base64'),
            },
          },
          { type: 'text', text: input.userText },
        ],
      },
    ],
  });
  const text = res.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('');
  return {
    text,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
    model: input.model,
  };
}

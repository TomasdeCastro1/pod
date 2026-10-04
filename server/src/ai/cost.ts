export interface ModelPrice {
  /** USD por millón de tokens (acepta string porque Postgres devuelve numeric como texto). */
  inputPerMtokUsd: number | string;
  outputPerMtokUsd: number | string;
}

export type ModelPrices = Record<string, ModelPrice>;

/** Costo real en USD de una llamada: tokens × precio por millón. Redondeado a 6 decimales. */
export function costUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  modelPrices: ModelPrices,
): number {
  const price = Object.hasOwn(modelPrices, model) ? modelPrices[model] : undefined;
  if (!price) throw new Error(`Sin precio configurado para el modelo ${model}`);
  const usd =
    (inputTokens * Number(price.inputPerMtokUsd) + outputTokens * Number(price.outputPerMtokUsd)) /
    1_000_000;
  return Math.round(usd * 1e6) / 1e6;
}

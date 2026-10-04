import { sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { fieldCatalog, modelPrices, priceSettings } from '../schema.js';
import type * as schema from '../schema.js';
import { FIELD_CATALOG_SEED } from './fieldCatalog.js';

/** Base de datos de cualquier driver (node-postgres en producción, PGlite en tests). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDb = PgDatabase<any, typeof schema>;

export const MODEL_HAIKU = 'claude-haiku-4-5-20251001';
export const DEFAULT_MODEL_SECONDARY = 'claude-sonnet-5-5';
export const DEFAULT_BASE_PRICE_USD = '40';

/**
 * Carga idempotente: el catálogo se actualiza solo en label, instruction y estimaciones
 * (los precios editados en la base no se pisan); price_settings y model_prices no se tocan
 * si ya existen.
 */
export async function seed(db: AnyDb, opts: { modelSecondary?: string } = {}): Promise<void> {
  const modelSecondary = opts.modelSecondary ?? DEFAULT_MODEL_SECONDARY;

  await db
    .insert(fieldCatalog)
    .values(FIELD_CATALOG_SEED)
    .onConflictDoUpdate({
      target: fieldCatalog.key,
      set: {
        label: sql`excluded.label`,
        instruction: sql`excluded.instruction`,
        estInTokens: sql`excluded.est_in_tokens`,
        estOutTokens: sql`excluded.est_out_tokens`,
      },
    });

  await db
    .insert(priceSettings)
    .values({ id: 1, basePricePer1000Usd: DEFAULT_BASE_PRICE_USD })
    .onConflictDoNothing();

  // TODO: verificar el precio vigente de Sonnet en https://docs.anthropic.com (página de
  // precios); 3,00 / 15,00 es el valor de la especificación (§9.4) sin verificar.
  const models = [
    { model: MODEL_HAIKU, inputPerMtokUsd: '1', outputPerMtokUsd: '5' },
    { model: modelSecondary, inputPerMtokUsd: '3', outputPerMtokUsd: '15' },
  ].filter((m, i, arr) => arr.findIndex((x) => x.model === m.model) === i);
  await db.insert(modelPrices).values(models).onConflictDoNothing();
}

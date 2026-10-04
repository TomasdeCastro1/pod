import { z } from 'zod';

const boolFromString = z.enum(['true', 'false']).transform((v) => v === 'true');

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());

export const envSchema = z.object({
  PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(3000)),
  DATABASE_URL: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  ADMIN_TOKEN: z.string().min(1),
  SIGNED_URL_SECRET: z.string().min(1),
  RESEND_API_KEY: optionalString,
  MODEL_PRIMARY: z.preprocess(emptyToUndefined, z.string().default('claude-haiku-4-5-20251001')),
  MODEL_SECONDARY: z.preprocess(emptyToUndefined, z.string().default('claude-sonnet-5-5')),
  ROUTE_PAPER_RETURNS_TO_SECONDARY: z.preprocess(emptyToUndefined, boolFromString.default(false)),
  STORAGE_DRIVER: z.preprocess(emptyToUndefined, z.enum(['replit', 'local']).default('local')),
  LOCAL_STORAGE_DIR: z.preprocess(emptyToUndefined, z.string().default('.storage')),
  PUBLIC_BASE_URL: optionalString,
  REVIEW_EMAIL: optionalString,
  REVIEW_CODE: optionalString,
  EMAIL_DRIVER: z.preprocess(emptyToUndefined, z.enum(['resend', 'console']).default('console')),
});

export type Config = z.infer<typeof envSchema>;

/** Valida las variables de entorno; lanza un error legible si falta alguna obligatoria. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const detail = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuración inválida: ${detail}`);
  }
  return result.data;
}

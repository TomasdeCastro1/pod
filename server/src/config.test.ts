import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const required = {
  DATABASE_URL: 'postgres://x',
  ANTHROPIC_API_KEY: 'k',
  JWT_SECRET: 's',
  ADMIN_TOKEN: 't',
  SIGNED_URL_SECRET: 'u',
};

describe('loadConfig', () => {
  it('aplica los valores por defecto', () => {
    const c = loadConfig(required);
    expect(c.MODEL_PRIMARY).toBe('claude-haiku-4-5-20251001');
    expect(c.MODEL_SECONDARY).toBe('claude-sonnet-5-5');
    expect(c.ROUTE_PAPER_RETURNS_TO_SECONDARY).toBe(false);
    expect(c.STORAGE_DRIVER).toBe('local');
    expect(c.EMAIL_DRIVER).toBe('console');
  });

  it('trata variables vacías como ausentes', () => {
    const c = loadConfig({ ...required, MODEL_PRIMARY: '', STORAGE_DRIVER: '' });
    expect(c.MODEL_PRIMARY).toBe('claude-haiku-4-5-20251001');
    expect(c.STORAGE_DRIVER).toBe('local');
  });

  it('falla si falta una obligatoria', () => {
    const rest: Partial<typeof required> = { ...required };
    delete rest.JWT_SECRET;
    expect(() => loadConfig(rest)).toThrow(/JWT_SECRET/);
  });
});

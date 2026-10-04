import type { scans } from './schema.js';

type ScanJson = Pick<typeof scans.$inferSelect, 'extracted' | 'corrections'>;

/** Regla de lectura de §10: corrections[key] si existe; si no, extracted[key]. */
export function effectiveValue(scan: ScanJson, key: string): unknown {
  if (scan.corrections && Object.hasOwn(scan.corrections, key)) {
    return scan.corrections[key];
  }
  return scan.extracted?.[key];
}

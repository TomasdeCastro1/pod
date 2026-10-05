import type { CaptureRow, CaptureStore } from './types';

/** Parte de `SQLiteDatabase` (expo-sqlite) que usa la cola; permite inyectar uno falso. */
export interface SqlDb {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: (string | number | null)[]): Promise<unknown>;
  getAllAsync<T>(sql: string): Promise<T[]>;
}

export const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS captures (
  client_id TEXT PRIMARY KEY NOT NULL,
  company_id TEXT NOT NULL,
  file_uri TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  lat REAL,
  lng REAL,
  replaces_scan_id TEXT,
  state TEXT NOT NULL,
  scan_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL
);`;

const COLUMNS = [
  'client_id',
  'company_id',
  'file_uri',
  'captured_at',
  'lat',
  'lng',
  'replaces_scan_id',
  'state',
  'scan_id',
  'attempts',
  'last_error',
  'created_at',
] as const satisfies readonly (keyof CaptureRow)[];

export function sqliteStore(open: () => Promise<SqlDb>): CaptureStore {
  let dbp: Promise<SqlDb> | null = null;
  const db = () => (dbp ??= open());

  return {
    async init() {
      await (await db()).execAsync(CREATE_TABLE_SQL);
    },
    async insert(row) {
      const marks = COLUMNS.map(() => '?').join(', ');
      await (
        await db()
      ).runAsync(
        `INSERT OR IGNORE INTO captures (${COLUMNS.join(', ')}) VALUES (${marks})`,
        COLUMNS.map((c) => row[c]),
      );
    },
    async update(clientId, patch) {
      const keys = COLUMNS.filter(
        (c): c is Exclude<(typeof COLUMNS)[number], 'client_id'> => c !== 'client_id' && c in patch,
      );
      if (keys.length === 0) return;
      await (
        await db()
      ).runAsync(
        `UPDATE captures SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE client_id = ?`,
        [...keys.map((k) => (patch[k] ?? null) as string | number | null), clientId],
      );
    },
    async list() {
      return (await db()).getAllAsync<CaptureRow>(
        'SELECT * FROM captures ORDER BY created_at DESC, rowid DESC',
      );
    },
    async remove(ids) {
      const d = await db();
      for (const id of ids) await d.runAsync('DELETE FROM captures WHERE client_id = ?', [id]);
    },
  };
}

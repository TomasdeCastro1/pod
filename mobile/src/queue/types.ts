export type CaptureState = 'pendiente' | 'subiendo' | 'subido' | 'fallido';

/** Fila de la tabla `captures` (§5 de la especificación). */
export interface CaptureRow {
  client_id: string;
  company_id: string;
  /** Imagen en documentDirectory/captures; vacío cuando ya se borró (escaneo en estado final). */
  file_uri: string;
  captured_at: string;
  lat: number | null;
  lng: number | null;
  replaces_scan_id: string | null;
  state: CaptureState;
  scan_id: string | null;
  attempts: number;
  last_error: string | null;
  created_at: string;
}

/** Persistencia de la cola. La implementación real es SQLite (`sqliteStore`); los tests usan una en memoria. */
export interface CaptureStore {
  init(): Promise<void>;
  insert(row: CaptureRow): Promise<void>;
  update(clientId: string, patch: Partial<Omit<CaptureRow, 'client_id'>>): Promise<void>;
  list(): Promise<CaptureRow[]>;
  remove(clientIds: string[]): Promise<void>;
}

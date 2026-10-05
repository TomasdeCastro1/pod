/**
 * Tipos de la API REST (§11), compartidos entre el servidor y la app.
 * Reflejan lo que devuelven las rutas de `server/src/**` (nombres en español donde la API los usa).
 */
import type { Conformidad } from './documents.js';

export type Role = 'admin' | 'miembro';
export type ScanStatus = 'procesando' | 'listo' | 'revisar' | 'error';
export type ScanAlert = 'sin_firma' | 'no_reconocido' | 'revisar' | 'error';

/** Cuerpo de error de toda respuesta no exitosa. */
export interface ApiErrorBody {
  error: { code: string; message: string };
}

export interface ApiUser {
  id: string;
  email: string;
  nombre: string | null;
}

/** Empresa tal como la devuelven /auth/verify y /me. */
export interface MeCompany {
  id: string;
  nombre: string;
  rut: string;
  role: Role;
}

/** Empresa tal como la devuelven /companies. */
export interface Company extends MeCompany {
  inviteCode: string;
}

export interface MeResponse {
  user: ApiUser;
  companies: MeCompany[];
}

export interface VerifyResponse extends MeResponse {
  token: string;
}

export interface MessageResponse {
  message: string;
}

export interface Member {
  id: string;
  nombre: string | null;
  email: string;
  role: Role;
}

export interface FieldView {
  key: string;
  label: string;
  doc_types: string[];
  is_base: boolean;
  enabled: boolean;
  price: number;
}

export interface FieldGroup {
  name: string;
  fields: FieldView[];
}

export interface CompanyFieldsResponse {
  base_price: number;
  currency: string;
  price_per_1000: number;
  groups: FieldGroup[];
}

export interface UsageMonth {
  month: string;
  images: number;
  amount_usd: number;
}

export interface UsageResponse {
  month: string;
  images: number;
  price_per_1000_current: number;
  amount_usd: number;
  history: UsageMonth[];
}

export interface ScanDto {
  id: string;
  status: ScanStatus;
  doc_type: string | null;
  conformidad_nivel: Conformidad | null;
  cliente_nombre: string | null;
  local: string | null;
  serie: string | null;
  numero: string | null;
  fecha_documento: string | null;
  total: number | null;
  revisar: Array<{ campo: string; motivo: string }>;
  fields: Record<string, { value: unknown; corrected: boolean }>;
  captured_at: string;
  thumb_url: string | null;
  alert: ScanAlert | null;
}

export interface UploadScanResponse {
  scan_id: string;
  status: ScanStatus;
}

/** Filtros de GET /companies/:id/scans y scans.csv (T2.4). */
export interface ScanListQuery {
  q?: string;
  type?: 'factura' | 'devolucion' | 'otro';
  conformidad?: Conformidad[];
  revisar?: boolean;
  /** Fechas de captura AAAA-MM-DD, inclusive, hora de Uruguay. */
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

export interface ScanListResponse {
  items: ScanDto[];
  next_cursor: string | null;
}

/** Cuerpo de PATCH /scans/:id (T2.4). `null` borra la corrección. */
export interface PatchScanBody {
  corrections?: Record<string, unknown>;
  reviewed?: boolean;
}

export interface SignedImageResponse {
  url: string;
  expires_at: string;
}

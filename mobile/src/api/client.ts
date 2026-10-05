import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import type {
  ApiErrorBody,
  Company,
  CompanyFieldsResponse,
  Member,
  MeResponse,
  MessageResponse,
  PatchScanBody,
  Role,
  ScanDto,
  ScanListQuery,
  ScanListResponse,
  SignedImageResponse,
  UploadScanResponse,
  UsageResponse,
  VerifyResponse,
} from '@app/shared';

const TOKEN_KEY = 'auth_token';

/** Error de la API con el código y mensaje del servidor (`{ error: { code, message } }`). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** Empresas donde bloquea la acción (409 `last_admin` de DELETE /me). */
  readonly companies?: Array<{ id: string; nombre: string }>;

  constructor(
    status: number,
    code: string,
    message: string,
    companies?: Array<{ id: string; nombre: string }>,
  ) {
    super(message);
    this.companies = companies;
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** No hubo respuesta (sin conexión, timeout, servidor caído). */
export class NetworkError extends Error {
  constructor(message = 'No hay conexión con el servidor') {
    super(message);
    this.name = 'NetworkError';
  }
}

export function getApiBaseUrl(): string {
  const extra = Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined;
  return (extra?.apiBaseUrl ?? 'http://localhost:3000').replace(/\/+$/, '');
}

// --- Sesión (JWT en expo-secure-store, decisión 7 del plan) ---

let cachedToken: string | null | undefined;
let unauthorizedHandler: (() => void) | null = null;

export async function getToken(): Promise<string | null> {
  if (cachedToken === undefined) cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
  return cachedToken;
}

export async function setToken(token: string | null): Promise<void> {
  cachedToken = token;
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

/** Registra qué hacer ante un 401 con sesión (la app cierra sesión). Devuelve cómo desregistrar. */
export function onUnauthorized(handler: () => void): () => void {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = null;
  };
}

// --- Núcleo ---

type Query = Record<string, string | number | boolean | string[] | undefined>;

interface RequestOptions {
  query?: Query;
  /** Cuerpo JSON. */
  json?: unknown;
  /** Cuerpo multipart (subida de imagen). */
  form?: FormData;
  /** false para los endpoints públicos de login. */
  auth?: boolean;
  signal?: AbortSignal;
}

function buildQuery(query?: Query): string {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined) continue;
    p.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const useAuth = opts.auth !== false;
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = useAuth ? await getToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form; // fetch define el Content-Type con el boundary
  } else if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.json);
  }

  let res: Response;
  try {
    res = await fetch(`${getApiBaseUrl()}${path}${buildQuery(opts.query)}`, {
      method,
      headers,
      body,
      signal: opts.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    throw new NetworkError();
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }

  if (!res.ok) {
    const e = (data as Partial<ApiErrorBody> | undefined)?.error as
      (Partial<ApiErrorBody['error']> & { companies?: unknown }) | undefined;
    const companies = Array.isArray(e?.companies)
      ? (e.companies as Array<{ id: string; nombre: string }>)
      : undefined;
    const err = new ApiError(
      res.status,
      e?.code ?? 'http_error',
      e?.message ?? `Error ${res.status}`,
      companies,
    );
    // 401 con sesión: el token venció o es inválido. Los de login (auth: false) no cuentan.
    if (res.status === 401 && useAuth && token) {
      await setToken(null);
      unauthorizedHandler?.();
    }
    throw err;
  }
  return data as T;
}

// --- Endpoints (§11) ---

export const api = {
  auth: {
    requestCode: (email: string) =>
      request<MessageResponse>('POST', '/auth/request-code', { json: { email }, auth: false }),
    verify: (email: string, code: string) =>
      request<VerifyResponse>('POST', '/auth/verify', { json: { email, code }, auth: false }),
  },
  me: {
    get: () => request<MeResponse>('GET', '/me'),
    update: (nombre: string) => request<MeResponse>('PATCH', '/me', { json: { nombre } }),
    /** Elimina la cuenta (204). 409 `last_admin` con `companies` si es el único admin de alguna. */
    remove: () => request<void>('DELETE', '/me'),
  },
  companies: {
    list: () => request<{ companies: Company[] }>('GET', '/companies'),
    create: (nombre: string, rut: string) =>
      request<{ company: Company }>('POST', '/companies', { json: { nombre, rut } }),
    join: (code: string) =>
      request<{ company: Company }>('POST', '/companies/join', { json: { code } }),
    update: (id: string, data: { nombre?: string; rut?: string }) =>
      request<{ company: Company }>('PATCH', `/companies/${id}`, { json: data }),
    regenerateInviteCode: (id: string) =>
      request<{ company: Company }>('POST', `/companies/${id}/invite-code`),
    members: (id: string) => request<{ members: Member[] }>('GET', `/companies/${id}/members`),
    setMemberRole: (id: string, userId: string, role: Role) =>
      request<{ ok: true }>('PATCH', `/companies/${id}/members/${userId}`, { json: { role } }),
    removeMember: (id: string, userId: string) =>
      request<void>('DELETE', `/companies/${id}/members/${userId}`),
  },
  fields: {
    get: (companyId: string) =>
      request<CompanyFieldsResponse>('GET', `/companies/${companyId}/fields`),
    save: (companyId: string, enabled: string[]) =>
      request<CompanyFieldsResponse>('PUT', `/companies/${companyId}/fields`, {
        json: { enabled },
      }),
  },
  usage: {
    get: (companyId: string, month?: string) =>
      request<UsageResponse>('GET', `/companies/${companyId}/usage`, { query: { month } }),
  },
  scans: {
    /** Subida multipart idempotente por `client_id`. `imageUri` es un archivo local JPEG. */
    upload: (
      companyId: string,
      p: {
        imageUri: string;
        clientId: string;
        capturedAt: string;
        lat?: number;
        lng?: number;
        replacesScanId?: string;
      },
    ) => {
      const form = new FormData();
      // React Native acepta { uri, name, type } como parte de archivo.
      form.append('image', {
        uri: p.imageUri,
        name: `${p.clientId}.jpg`,
        type: 'image/jpeg',
      } as unknown as Blob);
      form.append('client_id', p.clientId);
      form.append('captured_at', p.capturedAt);
      if (p.lat !== undefined) form.append('lat', String(p.lat));
      if (p.lng !== undefined) form.append('lng', String(p.lng));
      if (p.replacesScanId) form.append('replaces_scan_id', p.replacesScanId);
      return request<UploadScanResponse>('POST', `/companies/${companyId}/scans`, { form });
    },
    get: (id: string) => request<ScanDto>('GET', `/scans/${id}`),
    list: (companyId: string, query: ScanListQuery = {}) =>
      request<ScanListResponse>('GET', `/companies/${companyId}/scans`, {
        query: { ...query, conformidad: query.conformidad },
      }),
    /** URL del CSV con los mismos filtros (se descarga con expo-file-system, con el token). */
    csvUrl: (companyId: string, query: ScanListQuery = {}) =>
      `${getApiBaseUrl()}/companies/${companyId}/scans.csv${buildQuery({
        ...query,
        cursor: undefined,
        limit: undefined,
      })}`,
    patch: (id: string, body: PatchScanBody) =>
      request<ScanDto>('PATCH', `/scans/${id}`, { json: body }),
    remove: (id: string) => request<void>('DELETE', `/scans/${id}`),
    imageUrl: (id: string) => request<SignedImageResponse>('GET', `/scans/${id}/image`),
    thumbUrl: (id: string) => request<SignedImageResponse>('GET', `/scans/${id}/thumb`),
  },
};

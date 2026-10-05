import type { MeCompany } from '@app/shared';

/** Lógica pura de sesión y navegación (sin React Native), para poder testearla. */

export type SessionStatus = 'loading' | 'signedOut' | 'signedIn';

export type StartRoute = '/(auth)/login' | '/(auth)/empresa' | '/(tabs)/escanear';

/** A dónde va la app al arrancar según el estado de la sesión. */
export function decideStartRoute(status: SessionStatus, companies: MeCompany[]): StartRoute | null {
  if (status === 'loading') return null;
  if (status === 'signedOut') return '/(auth)/login';
  return companies.length === 0 ? '/(auth)/empresa' : '/(tabs)/escanear';
}

/** Empresa activa: la guardada si todavía existe; si no, la primera; sin empresas, null. */
export function pickActiveCompany(
  companies: MeCompany[],
  storedId: string | null | undefined,
): MeCompany | null {
  if (companies.length === 0) return null;
  return companies.find((c) => c.id === storedId) ?? companies[0] ?? null;
}

/** Agrega o reemplaza una empresa en la lista (por id). */
export function upsertCompany(companies: MeCompany[], company: MeCompany): MeCompany[] {
  const i = companies.findIndex((c) => c.id === company.id);
  if (i === -1) return [...companies, company];
  const next = [...companies];
  next[i] = company;
  return next;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

export function isPlausibleEmail(input: string): boolean {
  return EMAIL_RE.test(normalizeEmail(input));
}

/** Deja solo dígitos, hasta 6 (el código del email). */
export function normalizeOtp(input: string): string {
  return input.replace(/\D/g, '').slice(0, 6);
}

/** Código de invitación: mayúsculas, solo letras y números, hasta 6. */
export function normalizeInviteCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

/** Segundos que faltan para poder reenviar el código (0 = ya se puede). */
export function resendSecondsLeft(sentAt: number, now: number, cooldownMs = 30_000): number {
  return Math.max(0, Math.ceil((sentAt + cooldownMs - now) / 1000));
}

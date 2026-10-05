import { describe, expect, it } from 'vitest';
import type { MeCompany } from '@app/shared';
import {
  decideStartRoute,
  isPlausibleEmail,
  normalizeInviteCode,
  normalizeOtp,
  pickActiveCompany,
  resendSecondsLeft,
  upsertCompany,
} from './session';

const a: MeCompany = { id: 'a', nombre: 'A', rut: '1', role: 'admin' };
const b: MeCompany = { id: 'b', nombre: 'B', rut: '2', role: 'miembro' };

describe('decideStartRoute', () => {
  it('espera mientras carga', () => expect(decideStartRoute('loading', [])).toBeNull());
  it('sin sesión va al login', () =>
    expect(decideStartRoute('signedOut', [a])).toBe('/(auth)/login'));
  it('con sesión y sin empresas va a empresa', () =>
    expect(decideStartRoute('signedIn', [])).toBe('/(auth)/empresa'));
  it('con todo va directo al escáner', () =>
    expect(decideStartRoute('signedIn', [a])).toBe('/(tabs)/escanear'));
});

describe('pickActiveCompany', () => {
  it('usa la guardada si existe', () => expect(pickActiveCompany([a, b], 'b')).toBe(b));
  it('cae a la primera si la guardada ya no existe', () =>
    expect(pickActiveCompany([a, b], 'zzz')).toBe(a));
  it('cae a la primera sin guardada', () => expect(pickActiveCompany([a, b], null)).toBe(a));
  it('null sin empresas', () => expect(pickActiveCompany([], 'a')).toBeNull());
});

describe('upsertCompany', () => {
  it('agrega una nueva', () => expect(upsertCompany([a], b)).toEqual([a, b]));
  it('reemplaza por id', () => {
    const a2 = { ...a, nombre: 'A2' };
    expect(upsertCompany([a, b], a2)).toEqual([a2, b]);
  });
});

describe('normalizadores', () => {
  it('email', () => {
    expect(isPlausibleEmail(' Juan@Mail.com ')).toBe(true);
    expect(isPlausibleEmail('juan@mail')).toBe(false);
    expect(isPlausibleEmail('')).toBe(false);
  });
  it('otp', () => expect(normalizeOtp('12 34-56789')).toBe('123456'));
  it('código de invitación', () => expect(normalizeInviteCode('ab-c12 3xyz')).toBe('ABC123'));
  it('reenvío', () => {
    expect(resendSecondsLeft(0, 0)).toBe(30);
    expect(resendSecondsLeft(0, 29_100)).toBe(1);
    expect(resendSecondsLeft(0, 30_000)).toBe(0);
    expect(resendSecondsLeft(0, 99_000)).toBe(0);
  });
});

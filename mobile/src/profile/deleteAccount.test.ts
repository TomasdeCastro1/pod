import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({ default: {} }));
vi.mock('expo-secure-store', () => ({}));

import { ApiError, NetworkError } from '../api/client';
import { isDeleteConfirmed, lastAdminCompanies } from './deleteAccount';

describe('isDeleteConfirmed', () => {
  it('acepta ELIMINAR sin importar mayúsculas ni espacios', () => {
    expect(isDeleteConfirmed('ELIMINAR')).toBe(true);
    expect(isDeleteConfirmed(' eliminar ')).toBe(true);
  });
  it('rechaza otra cosa', () => {
    expect(isDeleteConfirmed('')).toBe(false);
    expect(isDeleteConfirmed('ELIMINA')).toBe(false);
    expect(isDeleteConfirmed('borrar')).toBe(false);
  });
});

describe('lastAdminCompanies', () => {
  it('devuelve las empresas del 409 last_admin', () => {
    const err = new ApiError(409, 'last_admin', 'x', [{ id: 'c1', nombre: 'Acme' }]);
    expect(lastAdminCompanies(err)).toEqual([{ id: 'c1', nombre: 'Acme' }]);
  });
  it('devuelve null para otros errores', () => {
    expect(lastAdminCompanies(new ApiError(409, 'otra', 'x'))).toBeNull();
    expect(lastAdminCompanies(new ApiError(500, 'last_admin', 'x'))).toBeNull();
    expect(lastAdminCompanies(new NetworkError())).toBeNull();
  });
});

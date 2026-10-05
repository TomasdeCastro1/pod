import { ApiError } from '../api/client';

/** Palabra que hay que escribir para confirmar la eliminación. */
export const DELETE_CONFIRM_WORD = 'ELIMINAR';

export function isDeleteConfirmed(text: string): boolean {
  return text.trim().toUpperCase() === DELETE_CONFIRM_WORD;
}

/** Empresas donde hay que nombrar otro administrador antes de eliminar (409 `last_admin`), o null. */
export function lastAdminCompanies(err: unknown): Array<{ id: string; nombre: string }> | null {
  if (err instanceof ApiError && err.status === 409 && err.code === 'last_admin') {
    return err.companies ?? [];
  }
  return null;
}

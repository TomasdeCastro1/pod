import { ApiError, NetworkError } from './client';

/** Texto en castellano para mostrarle al usuario ante un error de la API. */
export function errorMessage(err: unknown): string {
  if (err instanceof NetworkError) {
    return 'No hay conexión. Revisá tu internet y probá de nuevo.';
  }
  if (err instanceof ApiError) return err.message;
  return 'Algo salió mal. Probá de nuevo.';
}

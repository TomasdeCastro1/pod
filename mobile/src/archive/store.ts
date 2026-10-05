import { useSyncExternalStore } from 'react';
import { EMPTY_FILTERS, type ArchiveFilters } from './filters';

/**
 * Store de búsqueda y filtros del Archivo. Vive fuera de los componentes para que la
 * exportación a CSV (T4.2) use exactamente lo que se ve filtrado.
 */
let state: ArchiveFilters = EMPTY_FILTERS;
const listeners = new Set<() => void>();

export function getArchiveFilters(): ArchiveFilters {
  return state;
}

export function setArchiveFilters(next: ArchiveFilters): void {
  state = next;
  listeners.forEach((l) => l());
}

export function updateArchiveFilters(fn: (prev: ArchiveFilters) => ArchiveFilters): void {
  setArchiveFilters(fn(state));
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useArchiveFilters(): ArchiveFilters {
  return useSyncExternalStore(subscribe, getArchiveFilters, getArchiveFilters);
}

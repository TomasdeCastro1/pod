import type { Conformidad } from './documents.js';

/** Colores del indicador de conformidad (§4.1): los usan Escanear y Archivo. */
export const CONFORMIDAD_COLORS: Readonly<Record<Conformidad, string>> = {
  completa: '#2E9E5B', // verde
  firma_sola: '#E8B422', // amarillo
  dudosa: '#EE8A2B', // naranja
  sin_firma: '#D8382F', // rojo
};

export const CONFORMIDAD_LABELS: Readonly<Record<Conformidad, string>> = {
  completa: 'Completa',
  firma_sola: 'Solo firma',
  dudosa: 'Dudosa',
  sin_firma: 'Sin firma',
};

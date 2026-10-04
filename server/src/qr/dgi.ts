import { CFE_TYPES, ddmmyyyyToIso, isValidRut, normalizeRut, parseUyNumber } from '@app/shared';

export interface DgiQrData {
  rut_emisor?: string;
  tipo_cfe?: number;
  serie?: string;
  numero?: number;
  /** Total in pesos. */
  total?: number;
  /** ISO date (aaaa-mm-dd). */
  fecha_documento?: string;
}

export interface DgiQrResult {
  isDgi: boolean;
  /** True when any of the six expected values is missing or invalid. */
  partial: boolean;
  data: DgiQrData;
}

const FIELDS = [
  'rut_emisor',
  'tipo_cfe',
  'serie',
  'numero',
  'total',
  'fecha_documento',
] as const satisfies readonly (keyof DgiQrData)[];

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function dgiHost(raw: string): string | null {
  const text = raw.trim();
  try {
    return new URL(text).hostname.toLowerCase();
  } catch {
    // Not a parseable absolute URL: try to pull the host out by hand.
    const m = /^(?:[a-z][a-z0-9+.-]*:\/\/)?([^/?#\s]+)/i.exec(text);
    return m ? m[1]!.toLowerCase() : null;
  }
}

/** Parses the text of a QR code; only URLs on dgi.gub.uy count as DGI. */
export function parseDgiQr(raw: string): DgiQrResult {
  const host = dgiHost(raw);
  if (!host || !host.includes('dgi.gub.uy')) return { isDgi: false, partial: false, data: {} };

  const data: DgiQrData = {};
  const q = raw.indexOf('?');
  const query = q >= 0 ? safeDecode(raw.slice(q + 1).trim()) : '';
  const tokens = query
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t !== '');

  const integers: string[] = [];
  let invalidRut = false;
  for (const token of tokens) {
    if (/^\d{12}$/.test(normalizeRut(token)) && !token.includes('/')) {
      const rut = normalizeRut(token);
      if (data.rut_emisor === undefined && isValidRut(rut)) data.rut_emisor = rut;
      else if (data.rut_emisor === undefined) invalidRut = true;
    } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(token)) {
      const iso = ddmmyyyyToIso(token);
      if (iso && data.fecha_documento === undefined) data.fecha_documento = iso;
    } else if (/^[A-Za-z]{1,3}$/.test(token)) {
      if (data.serie === undefined) data.serie = token.toUpperCase();
    } else if (/^\d+$/.test(token)) {
      if (
        data.tipo_cfe === undefined &&
        token.length === 3 &&
        Object.hasOwn(CFE_TYPES, Number(token))
      ) {
        data.tipo_cfe = Number(token);
      } else {
        integers.push(token);
      }
    } else if (/^-?[\d.,]+$/.test(token)) {
      const n = parseUyNumber(token);
      if (n !== null && data.total === undefined) data.total = n;
    }
    // Anything else (the trailing hash) is ignored.
  }

  // Plain integers left over: first is the number; if the total came without
  // decimals ("1728") it is the second one.
  if (integers[0] !== undefined) data.numero = Number(integers[0]);
  if (integers[1] !== undefined && data.total === undefined) data.total = Number(integers[1]);

  const partial = invalidRut || FIELDS.some((f) => data[f] === undefined);
  return { isDgi: true, partial, data };
}

/**
 * Parses a number written in Uruguayan format ("1.416,32") or plain ("1416.32").
 * Accepts currency symbols, spaces and a leading minus. Returns null if it cannot be parsed.
 */
export function parseUyNumber(input: string): number | null {
  let s = input.replace(/[$\s]/g, '').replace(/^(?:UYU|USD|U\$S)/i, '');
  let negative = false;
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  } else if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s === '') return null;

  let normalized: string;
  if (s.includes(',')) {
    // Comma is the decimal separator; dots are thousands separators.
    if (!/^\d{1,3}(\.\d{3})*,\d+$|^\d+,\d+$/.test(s)) return null;
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3}){2,}$/.test(s) || /^\d{1,3}\.\d{3}$/.test(s)) {
    // Only dots in thousands groups: "1.416" or "1.234.567".
    normalized = s.replace(/\./g, '');
  } else if (/^\d+(\.\d+)?$/.test(s)) {
    normalized = s;
  } else {
    return null;
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

/**
 * Parses a quantity as printed in remitos, where the comma is the decimal
 * separator: "3,000" -> 3, "2,500" -> 2.5. Returns null if it cannot be parsed.
 */
export function parseRemitoQuantity(input: string): number | null {
  const s = input.trim();
  if (/^\d+,\d+$/.test(s)) return Number(s.replace(',', '.'));
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.'));
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  return null;
}

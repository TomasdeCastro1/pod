const WEIGHTS = [4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/** Removes dots, dashes and whitespace. */
export function normalizeRut(input: string): string {
  return input.replace(/[.\-\s]/g, '');
}

/** Validates a 12-digit Uruguayan RUT, including its check digit. */
export function isValidRut(rut: string): boolean {
  if (!/^\d{12}$/.test(rut)) return false;
  let sum = 0;
  for (let i = 0; i < 11; i++) sum += Number(rut[i]) * WEIGHTS[i]!;
  let check = 11 - (sum % 11);
  if (check === 10) return false;
  if (check === 11) check = 0;
  return check === Number(rut[11]);
}

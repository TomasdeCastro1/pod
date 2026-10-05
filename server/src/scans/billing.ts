/** Billing rule (spec 5 and 12): only scans that ended `listo` or `revisar` are charged. */
export function isBillable(scan: { status: string }): boolean {
  return scan.status === 'listo' || scan.status === 'revisar';
}

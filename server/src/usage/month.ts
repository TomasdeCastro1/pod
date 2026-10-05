const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isMonth(v: unknown): v is string {
  return typeof v === 'string' && MONTH_RE.test(v);
}

/** Mes actual (AAAA-MM) en America/Montevideo. */
export function currentMonth(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Montevideo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}`;
}

/** Los `count` meses que terminan en `month`, del más viejo al más nuevo. */
export function lastMonths(month: string, count: number): string[] {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const idx = y * 12 + (m - 1) - i;
    out.push(`${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`);
  }
  return out;
}

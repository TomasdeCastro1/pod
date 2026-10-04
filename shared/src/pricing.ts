/** Price per 1,000 images: base price plus the enabled optional field prices. */
export function pricePer1000(base: number, enabledOptionalPrices: number[]): number {
  const total = enabledOptionalPrices.reduce((acc, p) => acc + p, base);
  return Math.round(total * 100) / 100;
}

/** Monthly amount: sum of per-scan price snapshots / 1,000, rounded to 2 decimals. */
export function monthlyAmount(snapshots: number[]): number {
  const sum = snapshots.reduce((acc, p) => acc + p, 0);
  return Math.round((sum / 1000) * 100) / 100;
}

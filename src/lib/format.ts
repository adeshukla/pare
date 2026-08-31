/**
 * Law 5: honest reporting. Never round savings up, never inflate a percentage.
 */

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/** Reduction as a whole percent, rounded DOWN. 87.9% reports as 87%. */
export function reduction(before: number, after: number): number {
  if (before <= 0 || after >= before) return 0;
  return Math.floor(((before - after) / before) * 100);
}

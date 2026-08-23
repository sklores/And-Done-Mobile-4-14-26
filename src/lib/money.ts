/** Currency with the sign OUTSIDE the symbol: -$36, not $-36. */
export function money(n: number): string {
  const r = Math.round(n);
  return `${r < 0 ? "-" : ""}$${Math.abs(r).toLocaleString()}`;
}

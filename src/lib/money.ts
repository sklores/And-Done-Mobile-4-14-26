/** Currency with the sign OUTSIDE the symbol: -$36, not $-36.
 *  A number we do not have is not a dollar figure: anything non-finite
 *  (a missing read that reached the arithmetic) prints as "--", never $NaN
 *  and never $0. */
export function money(n: number): string {
  if (!Number.isFinite(n)) return "--";
  const r = Math.round(n);
  return `${r < 0 ? "-" : ""}$${Math.abs(r).toLocaleString()}`;
}

/** Same rule, to the cent: -$36.50, not $-36.50. The drill-downs used to
 *  carry six private copies of this; a vendor credit printed "$-450" on the
 *  sheet and "-$450" on the tile above it. One spelling, one place. */
export function money2(n: number): string {
  if (!Number.isFinite(n)) return "--";
  const r = Math.round(n * 100) / 100;
  return `${r < 0 ? "-" : ""}$${Math.abs(r).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

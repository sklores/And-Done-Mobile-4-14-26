// Fixed cost configuration.
//
// The monthly line items live on the seed (fixed_costs / org_rates, the rows
// the Pro Forma room edits), and the seed's heartbeat is what amortizes them:
// every fixed-cost dollar this app shows arrives on the snapshot as
// rent_dollars / amortized_dollars / mr_dollars / fixed_total.
//
// The client-side re-computation that used to live here -- RENT_PCT = 10% of
// sales, dailyFixed(), dailyLineItem(), getAmortizationFactor() (a 10am-4pm
// America/New_York window hard-coded for one restaurant) and hourlyAmortized()
// -- was dead code with no callers, and each one was a second interpreter of a
// fact the seed already owns: it read $0 out of an un-hydrated store and out
// of any hour before 10am ET, which is exactly the fabricated zero the sheets
// must never print. Deleted rather than left lying around; use the snapshot's
// numbers (useKpiStore.netDetail) and the org's own rent shape
// (useFixedCostStore.rent).

/** Fixed cost score based on % of net sales. Scoring a percentage the seed
 *  computed -- the caller must pass null-scored tiles through the neutral
 *  path instead of calling this with a made-up percent. */
export function fixedScore(pct: number): number {
  if (pct <= 20) return 8;
  if (pct <= 23) return 7;
  if (pct <= 26) return 6;
  if (pct <= 30) return 5;
  if (pct <= 35) return 4;
  if (pct <= 42) return 3;
  return 2;
}

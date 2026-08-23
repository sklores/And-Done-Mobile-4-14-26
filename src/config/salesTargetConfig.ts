// Sales scoring.
//
// V1 kept per-day-of-week dollar targets and 10am-4pm business hours in this
// file -- hard-coded for one restaurant. The seed now sends, with every
// snapshot, `expected_to_date`: the same-weekday average of the last four
// weeks for every day in the selected period, today's share prorated by how
// far through the org's OWN open hours we are. The score is actual / that.
// No targets in the app; no hours in the app.

import type { SnapshotStatus } from "../stores/useKpiStore";

// projection / expected -> 1..8
const SCORE_BUCKETS: Array<[number, number]> = [
  [1.20, 8], // Excellent  -- >= 120% of expected
  [1.10, 7], // Good
  [1.00, 6], // Watch
  [0.90, 5], // Caution
  [0.80, 4], // Alert
  [0.65, 3], // Bad
  [0.00, 2], // Critical
];

/** null = nothing to score (no data, no baseline, or the day hasn't started). */
export function scoreAgainstExpected(actual: number, expected: number | null, status: SnapshotStatus): number | null {
  if (status !== "ready" || expected == null || expected <= 0 || actual <= 0) return null;
  const ratio = actual / expected;
  for (const [min, score] of SCORE_BUCKETS) if (ratio >= min) return score;
  return 2;
}

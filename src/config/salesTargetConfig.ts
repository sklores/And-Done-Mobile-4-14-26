// Sales scoring config — projection-based.
//
// Approach: anchor scoring to "% of today's operating window elapsed" (not
// wall-clock), project end-of-day total from running sales, score the
// projection against a per-day-of-week target.
//
// Why projection beats raw pace:
//   pace      = actual_now / expected_now           ← whiplashes (one big
//                                                      check looks great,
//                                                      one slow hour looks
//                                                      terrible)
//   projection = actual_now / shape_curve(elapsed)   ← stable (same data
//                                                      reframed as "where
//                                                      will we land?")
//
// Targets sourced from the last 28 days of kpi_snapshots (averages,
// rounded to clean numbers, lightly tuned upward).

// ── Per-day targets (Sunday=0 ... Saturday=6) ───────────────────────────────
// Set to 0 for closed days — tile renders as "Closed", no scoring.
export const DAILY_TARGETS: Record<number, number> = {
  0: 0,      // Sunday — currently no sales recorded
  1: 1400,   // Monday
  2: 1400,   // Tuesday
  3: 1300,   // Wednesday
  4: 1500,   // Thursday
  5: 1800,   // Friday
  6: 2300,   // Saturday
};

// ── Default operating windows per day-of-week (HH:MM:SS) ────────────────────
// Used when shift_shifts has no rows for today (forgot to enter the week,
// new location bootstrapping, etc.). Sourced from the last 28 days of
// actual shift windows. Real shifts override these via fetchTodayScheduled.
type Window = { start: string; end: string };
export const DEFAULT_WINDOWS: Record<number, Window | null> = {
  0: { start: "10:00:00", end: "16:00:00" }, // Sun
  1: { start: "06:00:00", end: "16:30:00" }, // Mon
  2: { start: "06:00:00", end: "16:30:00" }, // Tue
  3: { start: "06:00:00", end: "16:30:00" }, // Wed
  4: { start: "06:00:00", end: "16:30:00" }, // Thu
  5: { start: "07:00:00", end: "19:30:00" }, // Fri
  6: { start: "09:30:00", end: "19:30:00" }, // Sat
};

// ── Shape curve: window-elapsed-% → expected-done-% ─────────────────────────
// One curve shared across days. Lunch-rush peak is roughly mid-window, so
// expected % accumulates faster in the middle than at the edges. Tune by
// inspecting actual hour-by-hour distribution from kpi_snapshots if needed.
const SHAPE_CURVE: Array<[number, number]> = [
  [0.00, 0.00],
  [0.15, 0.10],   // first hour or so — slow open
  [0.35, 0.35],   // ramping into lunch
  [0.55, 0.65],   // lunch rush peaks ~mid-window
  [0.75, 0.85],   // afternoon slowdown
  [1.00, 1.00],   // close
];

// Below this elapsed-pct, projection becomes too noisy (small denominator).
// Show a "Just opened" state instead of a flickering score.
const MIN_ELAPSED_FOR_SCORING = 0.10;

// Score thresholds — projection / target → 1..8
const SCORE_BUCKETS: Array<[number, number]> = [
  [1.20, 8], // Excellent  — >= 120% of target
  [1.10, 7], // Good
  [1.00, 6], // Watch
  [0.90, 5], // Caution
  [0.80, 4], // Alert
  [0.65, 3], // Bad
  [0.50, 2], // Critical
];

// ── Time helpers (Eastern Time, DST-aware) ──────────────────────────────────

/** Today's day-of-week in ET. 0 = Sunday, 6 = Saturday. */
export function dowET(d = new Date()): number {
  const isoET = d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const [y, m, day] = isoET.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).getUTCDay();
}

/** Current ET wall-clock hour as decimal (e.g. 14.5 = 2:30pm ET). */
export function nowETHours(d = new Date()): number {
  const s = d.toLocaleString("sv-SE", { timeZone: "America/New_York" });
  const time = s.split(" ")[1] ?? "00:00:00";
  const [h, m = "0", sec = "0"] = time.split(":");
  return Number(h) + Number(m) / 60 + Number(sec) / 3600;
}

/** "14:30:00" or "14:30" → 14.5 */
function timeStrToHours(t: string): number {
  const [h, m = "0", s = "0"] = t.split(":");
  return Number(h) + Number(m) / 60 + Number(s) / 3600;
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Today's daily target $. Returns 0 if closed. */
export function getDailyTarget(d = new Date()): number {
  return DAILY_TARGETS[dowET(d)] ?? 1400;
}

/** Linear-interpolate the shape curve. Returns expected % done given elapsed %. */
export function expectedDonePct(elapsedPct: number): number {
  if (elapsedPct <= 0) return 0;
  if (elapsedPct >= 1) return 1;
  for (let i = 1; i < SHAPE_CURVE.length; i++) {
    const [x0, y0] = SHAPE_CURVE[i - 1];
    const [x1, y1] = SHAPE_CURVE[i];
    if (elapsedPct <= x1) {
      const t = (elapsedPct - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return 1;
}

/** Elapsed % of today's operating window. Returns 0 pre-open, 1 post-close. */
export function elapsedWindowPct(
  todayWindowStart: string | null,
  todayWindowEnd: string | null,
  d = new Date(),
): number | null {
  if (!todayWindowStart || !todayWindowEnd) return null;
  const open  = timeStrToHours(todayWindowStart);
  const close = timeStrToHours(todayWindowEnd);
  if (close <= open) return null;
  const now = nowETHours(d);
  if (now <= open)  return 0;
  if (now >= close) return 1;
  return (now - open) / (close - open);
}

export type SalesScoreState =
  | { state: "closed";       score: 5; projected: null; pace: null;   message: string; usingDefaultWindow?: boolean }
  | { state: "no-schedule";  score: 5; projected: null; pace: null;   message: string; usingDefaultWindow?: boolean }
  | { state: "pre-open";     score: 5; projected: null; pace: null;   message: string; usingDefaultWindow?: boolean }
  | { state: "just-opened";  score: 5; projected: null; pace: number; message: string; usingDefaultWindow?: boolean }
  | { state: "in-progress";  score: number; projected: number; pace: number; message: string; usingDefaultWindow?: boolean }
  | { state: "post-close";   score: number; projected: number; pace: 1;     message: string; usingDefaultWindow?: boolean };

/** Map a projection/target ratio to a 1..8 score. */
function bucketRatio(ratio: number): number {
  for (const [threshold, score] of SCORE_BUCKETS) {
    if (ratio >= threshold) return score;
  }
  return 1;
}

/**
 * Compute the projection-based sales score + supporting display data.
 *
 * @param actualSales running sales total today
 * @param windowStart "HH:MM:SS" — earliest shift start today
 * @param windowEnd   "HH:MM:SS" — latest shift end today
 * @param target      today's daily $ target (0 = closed)
 * @param now         override for testing
 */
export function computeSalesState(
  actualSales: number,
  windowStart: string | null,
  windowEnd: string | null,
  target: number,
  now = new Date(),
): SalesScoreState {
  if (target <= 0) {
    return {
      state: "closed",
      score: 5,
      projected: null,
      pace: null,
      message: "Closed today",
    };
  }

  // Fall back to default per-day-of-week window when no shifts entered.
  // Lets the tile keep scoring even if the schedule isn't filled in yet.
  let usingDefaultWindow = false;
  let resolvedStart = windowStart;
  let resolvedEnd   = windowEnd;
  if (!resolvedStart || !resolvedEnd) {
    const fallback = DEFAULT_WINDOWS[dowET(now)];
    if (fallback) {
      resolvedStart = fallback.start;
      resolvedEnd   = fallback.end;
      usingDefaultWindow = true;
    }
  }

  const elapsed = elapsedWindowPct(resolvedStart, resolvedEnd, now);
  if (elapsed === null) {
    return {
      state: "no-schedule",
      score: 5,
      projected: null,
      pace: null,
      message: "No schedule today",
      usingDefaultWindow,
    };
  }

  if (elapsed === 0) {
    return {
      state: "pre-open",
      score: 5,
      projected: null,
      pace: null,
      message: resolvedStart ? `Opens at ${formatTime(resolvedStart)}` : "Pre-open",
      usingDefaultWindow,
    };
  }

  const donePct = expectedDonePct(elapsed);

  // Post-close: projection = actual exactly. Score on actual / target.
  if (elapsed >= 1) {
    const ratio = actualSales / target;
    return {
      state: "post-close",
      score: bucketRatio(ratio),
      projected: actualSales,
      pace: 1,
      message: `Final $${Math.round(actualSales)} · ${Math.round(ratio * 100)}% of target`,
      usingDefaultWindow,
    };
  }

  // Just-opened: too early to project — show pace only, neutral score.
  if (elapsed < MIN_ELAPSED_FOR_SCORING) {
    const expectedNow = target * donePct;
    const pace = expectedNow > 0 ? actualSales / expectedNow : 1;
    return {
      state: "just-opened",
      score: 5,
      projected: null,
      pace,
      message: "Just opened — too early to project",
      usingDefaultWindow,
    };
  }

  // In-progress: project EOD, score the projection.
  const projected = actualSales / donePct;
  const ratio     = projected / target;
  const expectedNow = target * donePct;
  const pace      = expectedNow > 0 ? actualSales / expectedNow : 1;
  return {
    state: "in-progress",
    score: bucketRatio(ratio),
    projected,
    pace,
    message: `Proj $${Math.round(projected).toLocaleString()} · ${Math.round(ratio * 100)}% of target`,
    usingDefaultWindow,
  };
}

/** "11:00:00" → "11:00am" */
function formatTime(hms: string): string {
  const h = parseInt(hms.split(":")[0], 10);
  const m = parseInt(hms.split(":")[1] ?? "0", 10);
  const period = h >= 12 ? "pm" : "am";
  const h12 = ((h + 11) % 12) + 1;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, "0")}${period}`;
}

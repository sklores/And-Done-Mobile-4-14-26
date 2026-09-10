import { ownerRead } from "./ownerFetch";
import type { ReadResult } from "./ownerFetch";
// A/P aging — reads the latest snapshot of what the business OWES.
//
// Source: the And Done seed's `ap_aging_snapshots` (the QuickBooks A/P Aging
// Summary that lands by email), through /api/seed?view=aging (D15). Mobile
// only ever reads it; nothing here writes.
//
// Three answers, never collapsed into one: a snapshot ("ready"), no A/P report
// on file yet ("empty"), and a read that failed ("error", with the message).
// Only the first is a statement about what the business owes.

export type AgingVendor = {
  vendor_name: string;
  total: number;
  current: number;
  days_1_30: number;
  days_31_60: number;
  days_61_90: number;
  days_over_90: number;
};

export type AgingSnapshot = {
  /** The report's as-of date, or null when the row carries none. An undated
   *  balance is still a balance -- only the date is the unknown thing, and the
   *  screen says so instead of printing "undefined". */
  reportDate: string | null;
  totalOpen: number;
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  over90: number;
  /** Everything past due — total minus the current bucket. */
  overdue: number;
  vendors: AgingVendor[];
  source: string | null;
};

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

export type AgingResult = ReadResult<AgingSnapshot>;

/** The A/P aging snapshot, with what happened to the read attached. */
export async function fetchAgingResult(): Promise<AgingResult> {
  const read = await ownerRead<Record<string, unknown>>("/api/seed?view=aging");
  if (read.status !== "ready") return read;
  const data = read.data;

  // A missing as-of does not discard the balance, the vendors or the buckets:
  // it is the date alone that is unknown, and the tile/sheet prints that.
  const reportDate = typeof data.report_date === "string" && data.report_date ? data.report_date : null;

  const rawVendors = Array.isArray(data.vendors) ? data.vendors : [];
  const vendors: AgingVendor[] = rawVendors
    .map((v: Record<string, unknown>) => ({
      vendor_name:  String(v.vendor_name ?? "Unknown"),
      total:        num(v.total),
      current:      num(v.current),
      days_1_30:    num(v.days_1_30),
      days_31_60:   num(v.days_31_60),
      days_61_90:   num(v.days_61_90),
      days_over_90: num(v.days_over_90),
    }))
    .filter((v) => v.total !== 0)
    .sort((a, b) => b.total - a.total);

  const totalOpen = num(data.total_open);
  const current   = num(data.total_current);

  const snapshot: AgingSnapshot = {
    reportDate,
    totalOpen,
    current,
    d1_30:   num(data.total_1_30),
    d31_60:  num(data.total_31_60),
    d61_90:  num(data.total_61_90),
    over90:  num(data.total_over_90),
    overdue: Math.max(0, totalOpen - current),
    vendors,
    source: (data.source as string) ?? null,
  };
  return { status: "ready", data: snapshot, error: null };
}

/** Back-compat convenience: the snapshot alone. Callers that need to tell "no
 *  A/P report" from "the read failed" use fetchAgingResult(). */
export async function fetchAging(): Promise<AgingSnapshot | null> {
  return (await fetchAgingResult()).data;
}

/** Whole days between the report's as-of and today; null when the age cannot
 *  be established -- no date on the row, or a date this parse doesn't
 *  understand. The seed sends `report_date` as a bare YYYY-MM-DD today, but a
 *  full ISO timestamp is the same date, so both are read; anything else is
 *  "age unknown", which is not the same as "old". */
export function agingAgeDays(reportDate: string | null | undefined): number | null {
  if (!reportDate) return null;
  // A bare YYYY-MM-DD is read as local midnight (parsed as UTC it lands a day
  // early west of Greenwich); anything carrying a time is already complete.
  const t = new Date(reportDate.includes("T") ? reportDate : `${reportDate}T00:00:00`).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

/** A/P aging arrives as an emailed report. Past this many days the screen
 *  calls out how old the newest one on file is, in place of its as-of date.
 *
 *  DESCRIPTIVE ONLY — it does not gate the score. How old a report is, is a
 *  thing to say out loud; how old is too old to score is a policy nobody has
 *  decided, and it is not this adapter's to invent. */
export const AGING_STALE_DAYS = 35;

/**
 * Debt score 1–8 (8 = best) driven by the 90+ bucket, NOT the total.
 *
 * A large balance that's entirely current is healthy — it just means bills
 * haven't come due. Money rotting past 90 days is the actual alarm, so
 * that's what colors the tile.
 *
 * Returns null — the app's no-score value, which paints the neutral tile —
 * only when there is nothing to score: no snapshot at all (a failed or empty
 * read must never come out 8, the greenest stop on the scale), or a bucket
 * that isn't a finite number. A snapshot that READ is scored as it stands,
 * however old its as-of: the balance on file is known, and only its age is
 * old. The age rides alongside as a note (see AGING_STALE_DAYS) rather than
 * silently withholding a colour the report had earned the day before.
 *
 * Pass the SNAPSHOT, not a bare bucket: defaulting one (`over90 ?? 0`) scores
 * the absence of an A/P report as a clean one — the failure this returns null
 * for.
 */
export function agingToDebtScore(aging: AgingSnapshot | number | null | undefined): number | null {
  if (aging == null) return null;
  const over90 = typeof aging === "number" ? aging : aging.over90;
  if (!Number.isFinite(over90)) return null;
  if (over90 <= 0)    return 8;
  if (over90 < 500)   return 7;
  if (over90 < 1500)  return 6;
  if (over90 < 3000)  return 5;
  if (over90 < 5000)  return 4;
  if (over90 < 8000)  return 3;
  return 2;
}

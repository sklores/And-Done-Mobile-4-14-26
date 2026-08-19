// A/P aging — reads the latest snapshot of what the business OWES.
//
// Source: `ap_aging_snapshots`, populated on the desktop side from the
// QuickBooks A/P Aging Summary that lands by email (~2x/day). Mobile only
// ever reads it; nothing here writes.

import { supabase, supabaseReady } from "../lib/supabase";

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
  reportDate: string;
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

export async function fetchAging(): Promise<AgingSnapshot | null> {
  if (!supabaseReady) return null;
  try {
    // Order by report_date THEN received_at: the feed can deliver two
    // snapshots for the same business day, and we want the later one.
    const { data, error } = await supabase
      .from("ap_aging_snapshots")
      .select("report_date, received_at, total_open, total_current, total_1_30, total_31_60, total_61_90, total_over_90, vendors, source")
      .order("report_date", { ascending: false })
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

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

    return {
      reportDate: String(data.report_date),
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
  } catch {
    return null;
  }
}

/**
 * Debt score 1–8 (8 = best) driven by the 90+ bucket, NOT the total.
 *
 * A large balance that's entirely current is healthy — it just means bills
 * haven't come due. Money rotting past 90 days is the actual alarm, so
 * that's what colors the tile.
 */
export function agingToDebtScore(over90: number): number {
  if (over90 <= 0)    return 8;
  if (over90 < 500)   return 7;
  if (over90 < 1500)  return 6;
  if (over90 < 3000)  return 5;
  if (over90 < 5000)  return 4;
  if (over90 < 8000)  return 3;
  return 2;
}

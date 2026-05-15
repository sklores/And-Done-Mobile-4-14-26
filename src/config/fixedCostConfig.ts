// Fixed cost configuration.
// Monthly line items now live in Supabase at
// org_settings.pro_forma_json.fixed.projected — hydrated by
// useFixedCostStore on app boot. This module exposes pure sync helpers
// that read from the store at call time.
//
// Rent is variable (RENT_PCT × today's net sales) and stays a constant here.

import { useFixedCostStore, type FixedLineItem } from "../stores/useFixedCostStore";

export const RENT_PCT = 0.10; // 10% of daily net sales

export type { FixedLineItem };

/** Current monthly total of non-live-computed line items (from store). */
export function getMonthlyFixedTotal(): number {
  return useFixedCostStore.getState().monthlyTotal;
}

/** Daily amortized cost for a given month (monthly total / days in month). */
export function dailyFixed(date = new Date()): number {
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return getMonthlyFixedTotal() / daysInMonth;
}

/** Daily cost per line item. */
export function dailyLineItem(item: FixedLineItem, date = new Date()): number {
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return item.monthlyAmount / daysInMonth;
}

/**
 * Progress factor (0 → 1) for how much of the operating window has elapsed.
 * Operating window: 10 AM → 4 PM ET (6 hours).
 * Before 10 AM → 0.  After 4 PM → 1.  Intra-window → proportional.
 */
export function getAmortizationFactor(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);

  const hour   = parseInt(parts.find((p) => p.type === "hour")!.value,   10);
  const minute = parseInt(parts.find((p) => p.type === "minute")!.value, 10);
  const etDecimal = hour + minute / 60;

  const WINDOW_START = 10; // 10 AM ET
  const WINDOW_END   = 16; //  4 PM ET
  const WINDOW_HOURS = WINDOW_END - WINDOW_START; // 6

  if (etDecimal < WINDOW_START) return 0;
  if (etDecimal >= WINDOW_END)  return 1;
  return (etDecimal - WINDOW_START) / WINDOW_HOURS;
}

/**
 * Overhead cost earned so far today.
 * Drips from $0 at 10 AM ET to the full daily amount at 4 PM ET.
 * Stays at the full daily amount after 4 PM.
 */
export function hourlyAmortized(now = new Date()): number {
  return dailyFixed(now) * getAmortizationFactor(now);
}

/** Fixed cost score based on % of net sales */
export function fixedScore(pct: number): number {
  if (pct <= 20) return 8;
  if (pct <= 23) return 7;
  if (pct <= 26) return 6;
  if (pct <= 30) return 5;
  if (pct <= 35) return 4;
  if (pct <= 42) return 3;
  return 2;
}

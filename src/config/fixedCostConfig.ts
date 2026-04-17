// Fixed cost configuration — edit monthly amounts here, logic is automatic.
// Costs are amortized daily using days in the current calendar month.
// Rent is variable: RENT_PCT × today's net sales.

export const RENT_PCT = 0.10; // 10% of daily net sales

export type FixedLineItem = {
  key: string;
  label: string;
  monthlyAmount: number;
  note?: string;
};

export const FIXED_LINE_ITEMS: FixedLineItem[] = [
  { key: "pest",       label: "Pest Control",     monthlyAmount: 220  },
  { key: "dishwasher", label: "Dishwasher Rental", monthlyAmount: 270  },
  { key: "insurance",  label: "Insurance",         monthlyAmount: 1500 },
  { key: "utilities",  label: "Utilities",         monthlyAmount: 2200, note: "seasonal avg" },
  { key: "bookkeeper", label: "Bookkeeper",         monthlyAmount: 1000 },
  { key: "loan",       label: "Loan Payment",      monthlyAmount: 2000, note: "principal + interest" },
];

export const MONTHLY_FIXED_TOTAL = FIXED_LINE_ITEMS.reduce((s, i) => s + i.monthlyAmount, 0);
// = $7,190 / month

/** Daily amortized cost for a given month */
export function dailyFixed(date = new Date()): number {
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return MONTHLY_FIXED_TOTAL / daysInMonth;
}

/** Daily cost per line item */
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

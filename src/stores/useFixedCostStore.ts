// Fixed-cost line items, hydrated from org_settings.pro_forma_json.fixed.projected.
// Desktop's "expenses > breakdown" is the source of truth.
//
// Four line items are computed live elsewhere and excluded from the
// amortized monthly total (to avoid double-counting them in the Fixed
// Cost tile):
//   - Rent          → computed as RENT_PCT × today's sales
//   - Labor         → computed from Toast time entries + schedule salary
//   - Payroll Tax   → computed as 11% of labor
//   - M&R           → today's entries from `maintenance_entries` table
//
// We still keep those four in the line-item list (tagged liveComputed=true)
// so the drill-down can surface them with their own live values.

import { create } from "zustand";
import { supabase, supabaseReady } from "../lib/supabase";

const GCDC_ORG_ID = "dd261210-9748-436e-899b-a8d3f154bcff";

const LIVE_COMPUTED_LABELS = new Set([
  "rent",
  "labor",
  "payroll tax",
  "m&r",
  "mr",
]);

export type FixedLineItem = {
  label: string;
  monthlyAmount: number;
  liveComputed: boolean;
};

type State = {
  lineItems: FixedLineItem[];      // all items, including live-computed ones
  monthlyTotal: number;            // sum of NON-live items, for amortization
  hydrated: boolean;
  hydrate: () => Promise<void>;
};

// Fallback values matched to the values committed in pro_forma_json on
// 2026-05-15 (in case Supabase fetch fails on cold start). When the hydrate
// completes, real numbers replace these.
const FALLBACK_LINE_ITEMS: FixedLineItem[] = [
  { label: "Rent",           monthlyAmount: 0,    liveComputed: true  },
  { label: "Pest",           monthlyAmount: 220,  liveComputed: false },
  { label: "Insurance",      monthlyAmount: 1500, liveComputed: false },
  { label: "Equipment",      monthlyAmount: 220,  liveComputed: false },
  { label: "Knives",         monthlyAmount: 70,   liveComputed: false },
  { label: "Chemical",       monthlyAmount: 250,  liveComputed: false },
  { label: "Internet",       monthlyAmount: 120,  liveComputed: false },
  { label: "Utilities",      monthlyAmount: 2500, liveComputed: false },
  { label: "Book Keeper",    monthlyAmount: 500,  liveComputed: false },
  { label: "Payroll Tax",    monthlyAmount: 0,    liveComputed: true  },
  { label: "SBA Loans",      monthlyAmount: 770,  liveComputed: false },
  { label: "M&R",            monthlyAmount: 600,  liveComputed: true  },
  { label: "CPA",            monthlyAmount: 400,  liveComputed: false },
  { label: "Linen",          monthlyAmount: 700,  liveComputed: false },
  { label: "POS",            monthlyAmount: 700,  liveComputed: false },
  { label: "And Done",       monthlyAmount: 500,  liveComputed: false },
  { label: "STK Loan",       monthlyAmount: 2000, liveComputed: false },
  { label: "Marketing",      monthlyAmount: 0,    liveComputed: false },
  { label: "Labor",          monthlyAmount: 13000,liveComputed: true  },
  { label: "DC Biz",         monthlyAmount: 200,  liveComputed: false },
  { label: "Liquor License", monthlyAmount: 100,  liveComputed: false },
];

function sumNonLive(items: FixedLineItem[]): number {
  return items.filter((i) => !i.liveComputed).reduce((s, i) => s + i.monthlyAmount, 0);
}

export const useFixedCostStore = create<State>((set) => ({
  lineItems: FALLBACK_LINE_ITEMS,
  monthlyTotal: sumNonLive(FALLBACK_LINE_ITEMS),
  hydrated: false,
  hydrate: async () => {
    if (!supabaseReady) {
      set({ hydrated: true });
      return;
    }
    try {
      const { data, error } = await supabase
        .from("org_settings")
        .select("pro_forma_json")
        .eq("org_id", GCDC_ORG_ID)
        .single();
      if (error || !data) {
        console.warn("[fixed-cost] hydrate error:", error?.message);
        set({ hydrated: true });
        return;
      }
      const raw = (data as { pro_forma_json?: { fixed?: { projected?: Array<{ label: string; amount: number }> } } })
        .pro_forma_json?.fixed?.projected;
      if (!Array.isArray(raw)) {
        set({ hydrated: true });
        return;
      }
      const items: FixedLineItem[] = raw.map((r) => {
        const cleanLabel = String(r.label ?? "").trim();
        return {
          label: cleanLabel,
          monthlyAmount: Number(r.amount) || 0,
          liveComputed: LIVE_COMPUTED_LABELS.has(cleanLabel.toLowerCase()),
        };
      });
      set({
        lineItems: items,
        monthlyTotal: sumNonLive(items),
        hydrated: true,
      });
    } catch (err) {
      console.warn("[fixed-cost] hydrate threw:", (err as Error).message);
      set({ hydrated: true });
    }
  },
}));

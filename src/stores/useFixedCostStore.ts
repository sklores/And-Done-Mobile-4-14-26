// The restaurant's fixed-cost list (label + monthly amount) and how rent is
// shaped -- from the seed's effective-dated fixed_costs / org_rates rows, the
// same ones the Pro Forma room edits and the heartbeat amortizes. No
// fallback numbers: until it loads, the list is empty and says so.

import { create } from "zustand";
import { ownerRead } from "../data/ownerFetch";
import type { FetchStatus } from "../data/ownerFetch";

export type FixedLineItem = { label: string; monthlyAmount: number };
export type RentShape = { kind: "pct_of_sales"; pct: number } | { kind: "flat"; monthly: number };

type State = {
  lineItems: FixedLineItem[];
  monthlyTotal: number;
  rent: RentShape | null;
  hydrated: boolean;
  /** The hydrate phase: idle -> loading -> ready | error. "error" means the
   *  empty list below is a failed read, not a restaurant with no fixed costs. */
  status: FetchStatus;
  error: string | null;
  hydrate: () => Promise<void>;
};

export const useFixedCostStore = create<State>((set) => ({
  lineItems: [],
  monthlyTotal: 0,
  rent: null,
  hydrated: false,
  status: "idle",
  error: null,
  hydrate: async () => {
    set((s) => ({ status: s.status === "ready" ? s.status : "loading", error: null }));
    const read = await ownerRead<{ projected?: Array<{ label: string; amount: number }>; rent?: RentShape | null; monthlyFixed?: number | null }>("/api/seed?view=fixed-costs");
    if (read.status !== "ready") {
      const message = read.status === "error" ? read.error : "fixed costs came back empty";
      console.warn("[fixed-cost] hydrate failed:", message);
      // hydrated stays false: nothing here has been read, so nothing here is
      // a fact about this restaurant's overhead.
      set({ status: "error", error: message });
      return;
    }
    const data = read.data;
    const items: FixedLineItem[] = (data.projected ?? []).map((x) => ({ label: String(x.label ?? "").trim(), monthlyAmount: Number(x.amount) || 0 }));
    // org_rates.monthly_fixed as the seed sent it -- this is the number the
    // heartbeat amortizes, and the screen compares it against the line items
    // to surface the drift between the two. Reinterpreting a 0 here would hide
    // that comparison; only an absent number falls back to the list's own sum.
    const monthlyFixed = data.monthlyFixed == null ? NaN : Number(data.monthlyFixed);
    const monthlyTotal = Number.isFinite(monthlyFixed)
      ? monthlyFixed
      : items.reduce((s, i) => s + i.monthlyAmount, 0);
    set({ lineItems: items, monthlyTotal, rent: data.rent ?? null, hydrated: true, status: "ready", error: null });
  },
}));

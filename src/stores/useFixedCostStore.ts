// The restaurant's fixed-cost list (label + monthly amount) and how rent is
// shaped -- from the seed's effective-dated fixed_costs / org_rates rows, the
// same ones the Pro Forma room edits and the heartbeat amortizes. No
// fallback numbers: until it loads, the list is empty and says so.

import { create } from "zustand";
import { ownerFetch } from "../data/ownerFetch";

export type FixedLineItem = { label: string; monthlyAmount: number };
export type RentShape = { kind: "pct_of_sales"; pct: number } | { kind: "flat"; monthly: number };

type State = {
  lineItems: FixedLineItem[];
  monthlyTotal: number;
  rent: RentShape | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
};

export const useFixedCostStore = create<State>((set) => ({
  lineItems: [],
  monthlyTotal: 0,
  rent: null,
  hydrated: false,
  hydrate: async () => {
    try {
      const r = await ownerFetch("/api/seed?view=fixed-costs");
      if (!r.ok) { set({ hydrated: true }); return; }
      const data = (await r.json()) as { projected?: Array<{ label: string; amount: number }>; rent?: RentShape | null; monthlyFixed?: number | null };
      const items: FixedLineItem[] = (data.projected ?? []).map((x) => ({ label: String(x.label ?? "").trim(), monthlyAmount: Number(x.amount) || 0 }));
      set({ lineItems: items, monthlyTotal: data.monthlyFixed ?? items.reduce((s, i) => s + i.monthlyAmount, 0), rent: data.rent ?? null, hydrated: true });
    } catch (err) {
      console.warn("[fixed-cost] hydrate threw:", (err as Error).message);
      set({ hydrated: true });
    }
  },
}));

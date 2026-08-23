import { create } from "zustand";
import { ownerFetch } from "../data/ownerFetch";
import type { Period } from "./useKpiStore";

// Maintenance & repair the owner logs from the phone. Lives on the seed
// (mr_entries) -- the same rows the tiles and the P&L count as fixed cost.
// The list follows the selected period.

export type MaintenanceEntry = {
  id: string;
  date: string;        // YYYY-MM-DD
  amount: number;
  description: string;
};

type MaintenanceState = {
  entries: MaintenanceEntry[];
  period: Period | null;
  total: number;
  loaded: boolean;
  hydrate: (period: Period) => Promise<void>;
  addEntry: (amount: number, description: string) => Promise<void>;
  removeEntry: (id: string) => Promise<void>;
};

let pending: Period | null = null;   // the period of the most recent hydrate call

export const useMaintenanceStore = create<MaintenanceState>((set, get) => ({
  entries: [],
  period: null,
  total: 0,
  loaded: false,

  hydrate: async (period) => {
    pending = period;
    try {
      const r = await ownerFetch(`/api/seed?view=mr&period=${period}`);
      if (!r.ok) return;
      const j = (await r.json()) as { entries: MaintenanceEntry[]; total: number };
      if (pending !== period) return;   // the selector moved on while this was in flight
      set({ entries: j.entries, total: j.total, period, loaded: true });
    } catch (e) {
      console.warn("[mr] hydrate failed", e);
    }
  },

  addEntry: async (amount, description) => {
    const r = await ownerFetch("/api/seed?view=mr-add", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ amount, description }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "could not save");
    const e = (await r.json()) as MaintenanceEntry;
    set((s) => ({ entries: [e, ...s.entries], total: s.total + e.amount }));
  },

  removeEntry: async (id) => {
    const prev = get().entries;
    const gone = prev.find((e) => e.id === id);
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id), total: s.total - (gone?.amount ?? 0) }));
    const r = await ownerFetch("/api/seed?view=mr-delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
    if (!r.ok) set({ entries: prev, total: prev.reduce((a, e) => a + e.amount, 0) });
  },
}));

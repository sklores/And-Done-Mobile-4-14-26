import { create } from "zustand";
import { ownerFetch, ownerRead } from "../data/ownerFetch";
import type { FetchStatus } from "../data/ownerFetch";
import type { Period } from "./useKpiStore";

// Maintenance & repair the owner logs from the phone. Lives on the seed
// (mr_entries) -- the same rows the tiles and the P&L count as fixed cost.
// The list follows the selected period.
//
// Like useKpiStore's tiles, the list is cleared the moment the period changes:
// last month's entries and last month's total must never sit under this week's
// label, least of all with a delete button next to each row.

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
  /** True only while `entries` are this period's rows, as the seed sent them.
   *  A failed read leaves it false: there is nothing here to call this
   *  period's M&R, and the screen offers a retry instead of a total. */
  loaded: boolean;
  /** The hydrate phase for `period`: idle -> loading -> ready | error. */
  status: FetchStatus;
  /** Why the last read or write failed, in words the screen can print. */
  error: string | null;
  hydrate: (period: Period) => Promise<void>;
  addEntry: (amount: number, description: string) => Promise<void>;
  removeEntry: (id: string) => Promise<void>;
};

let pending: Period | null = null;   // the period of the most recent hydrate call

const errText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : String(e ?? "")) || fallback;

export const useMaintenanceStore = create<MaintenanceState>((set, get) => ({
  entries: [],
  period: null,
  total: 0,
  loaded: false,
  status: "idle",
  error: null,

  hydrate: async (period) => {
    pending = period;
    if (get().period !== period) {
      // The rows on screen belong to the OLD period. Clear them, and go back to
      // "loading" with them: an emptied list still labelled "ready" is this
      // period positively reporting no M&R, which nothing has told us yet.
      set({ entries: [], total: 0, period, loaded: false, status: "loading", error: null });
    } else {
      // Same period, refetch: the rows already on screen stay, so the status
      // stays "ready" -- there is nothing unknown on the screen to announce.
      set((s) => ({ status: s.status === "ready" ? s.status : "loading", error: null }));
    }
    const read = await ownerRead<{ entries: MaintenanceEntry[]; total: number }>(`/api/seed?view=mr&period=${period}`);
    if (pending !== period) return;   // the selector moved on while this was in flight
    if (read.status !== "ready") {
      const message = read.status === "error" ? read.error : "M&R came back empty";
      console.warn("[mr] hydrate failed", message);
      // `loaded` stays false on purpose: it means "these rows are this period's
      // M&R", and after a failed read there are no such rows. The screen keys
      // its "couldn't load -- tap to retry" off exactly that, and flipping it
      // true here would print "no M&R logged" over a read that never landed.
      set({ status: "error", error: message });
      return;
    }
    set({ entries: read.data.entries ?? [], total: Number(read.data.total) || 0, period, loaded: true, status: "ready", error: null });
  },

  addEntry: async (amount, description) => {
    try {
      const r = await ownerFetch("/api/seed?view=mr-add", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ amount, description }) });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `could not save (HTTP ${r.status})`);
      const e = (await r.json()) as MaintenanceEntry;
      set((s) => ({ entries: [e, ...s.entries], total: s.total + e.amount, error: null }));
    } catch (e) {
      // Nothing was written. The form keeps what the owner typed and shows this.
      const message = errText(e, "could not save");
      set({ error: message });
      throw new Error(message);
    }
  },

  removeEntry: async (id) => {
    const prev = get().entries;
    const gone = prev.find((e) => e.id === id);
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id), total: s.total - (gone?.amount ?? 0) }));
    try {
      const r = await ownerFetch("/api/seed?view=mr-delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `could not delete (HTTP ${r.status})`);
      set({ error: null });
    } catch (e) {
      // Still on the seed -- and still fixed cost. Put it back and say so.
      const message = errText(e, "could not delete");
      set({ entries: prev, total: prev.reduce((a, e) => a + e.amount, 0), error: message });
      throw new Error(message);
    }
  },
}));

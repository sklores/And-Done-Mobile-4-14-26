// Maintenance & Repair log — backed by the Supabase `maintenance_entries`
// table. Local Zustand state is a hydrated mirror so the existing
// synchronous helpers (getTodayMRTotal, getTodayEntries) keep working
// for callers like applySnapshot. Writes go to Supabase + local state in
// parallel; reads come from the local mirror.
//
// One-time migration: any entries previously written to localStorage
// (under STORAGE_KEY) are pushed up to Supabase on first hydrate when the
// table is empty for that org. Then the localStorage cache is cleared.

import { create } from "zustand";
import { supabase, supabaseReady } from "../lib/supabase";

const GCDC_ORG_ID = "dd261210-9748-436e-899b-a8d3f154bcff";
const STORAGE_KEY = "anddone:maintenance";

export type MaintenanceEntry = {
  id: string;
  date: string;        // YYYY-MM-DD (entry_date)
  amount: number;
  description: string;
  flagged?: boolean;   // reserved: bank transaction match
};

type DBRow = {
  id: string;
  org_id: string | null;
  entry_date: string;
  amount: number | string;
  description: string | null;
  created_at: string;
};

function rowToEntry(r: DBRow): MaintenanceEntry {
  return {
    id: r.id,
    date: r.entry_date,
    amount: Number(r.amount),
    description: r.description ?? "",
  };
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ── Local-only helpers (read from hydrated state, called sync) ─────────────
export function getTodayEntries(): MaintenanceEntry[] {
  const today = todayStr();
  return useMaintenanceStore.getState().entries.filter((e) => e.date === today);
}
export function getTodayMRTotal(): number {
  return getTodayEntries().reduce((s, e) => s + e.amount, 0);
}

// ── Legacy localStorage helpers (used only for the one-time migration) ────
function loadLocal(): MaintenanceEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function clearLocal() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

// ── Store ─────────────────────────────────────────────────────────────────
type MaintenanceState = {
  entries: MaintenanceEntry[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  addEntry: (amount: number, description: string) => Promise<void>;
  removeEntry: (id: string) => Promise<void>;
};

export const useMaintenanceStore = create<MaintenanceState>((set, get) => ({
  // Seed with localStorage so synchronous reads work before hydrate finishes.
  entries: loadLocal(),
  hydrated: false,

  hydrate: async () => {
    if (!supabaseReady) {
      // No Supabase — fall back to localStorage only (dev mode, env not set).
      set({ hydrated: true });
      return;
    }
    try {
      const { data, error } = await supabase
        .from("maintenance_entries")
        .select("id, org_id, entry_date, amount, description, created_at")
        .eq("org_id", GCDC_ORG_ID)
        .order("entry_date", { ascending: false });

      if (error) {
        console.warn("[maintenance] hydrate failed:", error.message);
        set({ hydrated: true });
        return;
      }

      const remote = (data as DBRow[]).map(rowToEntry);

      // One-time migration: if the table is empty for this org and we have
      // legacy localStorage entries, push them up.
      const local = loadLocal();
      if (remote.length === 0 && local.length > 0) {
        console.log(`[maintenance] migrating ${local.length} legacy localStorage entries to Supabase`);
        const inserts = local.map((e) => ({
          org_id: GCDC_ORG_ID,
          entry_date: e.date,
          amount: e.amount,
          description: e.description,
        }));
        const { data: inserted, error: insertErr } = await supabase
          .from("maintenance_entries")
          .insert(inserts)
          .select("id, org_id, entry_date, amount, description, created_at");
        if (insertErr) {
          console.warn("[maintenance] migration failed:", insertErr.message);
          set({ entries: local, hydrated: true });
          return;
        }
        clearLocal();
        const migrated = (inserted as DBRow[]).map(rowToEntry);
        set({ entries: migrated, hydrated: true });
        return;
      }

      set({ entries: remote, hydrated: true });
    } catch (err) {
      console.warn("[maintenance] hydrate threw:", (err as Error).message);
      set({ hydrated: true });
    }
  },

  addEntry: async (amount, description) => {
    const optimistic: MaintenanceEntry = {
      id: `pending-${Date.now()}`,
      date: todayStr(),
      amount,
      description: description.trim(),
    };
    set((s) => ({ entries: [optimistic, ...s.entries] }));

    if (!supabaseReady) return;

    try {
      const { data, error } = await supabase
        .from("maintenance_entries")
        .insert({
          org_id: GCDC_ORG_ID,
          entry_date: optimistic.date,
          amount,
          description: optimistic.description,
        })
        .select("id, org_id, entry_date, amount, description, created_at")
        .single();

      if (error || !data) {
        console.warn("[maintenance] insert failed:", error?.message);
        // Roll back the optimistic insert
        set((s) => ({ entries: s.entries.filter((e) => e.id !== optimistic.id) }));
        return;
      }

      const real = rowToEntry(data as DBRow);
      set((s) => ({
        entries: s.entries.map((e) => (e.id === optimistic.id ? real : e)),
      }));
    } catch (err) {
      console.warn("[maintenance] insert threw:", (err as Error).message);
      set((s) => ({ entries: s.entries.filter((e) => e.id !== optimistic.id) }));
    }
  },

  removeEntry: async (id) => {
    const previous = get().entries;
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));

    if (!supabaseReady || id.startsWith("pending-")) return;

    try {
      const { error } = await supabase
        .from("maintenance_entries")
        .delete()
        .eq("id", id);
      if (error) {
        console.warn("[maintenance] delete failed:", error.message);
        set({ entries: previous }); // restore
      }
    } catch (err) {
      console.warn("[maintenance] delete threw:", (err as Error).message);
      set({ entries: previous });
    }
  },
}));

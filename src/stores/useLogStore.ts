// useLogStore — now backed by the Supabase `activity_log` table.
// Realtime subscription means Gizmo's inserts appear instantly in the
// Log tab without a refresh. Falls back to in-memory if Supabase isn't
// configured (dev / offline).

import { create } from "zustand";
import { supabase, supabaseReady } from "../lib/supabase";

export type LogEntry = {
  id: string;
  timestamp: string; // ISO
  text: string;
  type: "manual" | "auto" | "gizmo";
};

type LogState = {
  entries: LogEntry[];
  loaded: boolean;
  addEntry: (text: string, type?: "manual" | "auto" | "gizmo") => Promise<void>;
  removeEntry: (id: string) => Promise<void>;
  hydrate: () => Promise<void>;
};

// ── DB row → LogEntry ────────────────────────────────────────────────────────
type Row = { id: string; created_at: string; text: string; type: string };
function rowToEntry(r: Row): LogEntry {
  const t = (r.type === "manual" || r.type === "auto" || r.type === "gizmo")
    ? (r.type as LogEntry["type"])
    : "manual";
  return { id: r.id, timestamp: r.created_at, text: r.text, type: t };
}

export const useLogStore = create<LogState>((set, get) => ({
  entries: [],
  loaded: false,

  hydrate: async () => {
    if (!supabaseReady) {
      set({ loaded: true });
      return;
    }
    const { data, error } = await supabase
      .from("activity_log")
      .select("id, created_at, text, type")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      console.warn("activity_log fetch failed:", error.message);
      set({ loaded: true });
      return;
    }
    set({ entries: (data ?? []).map(rowToEntry), loaded: true });

    // Realtime: push-based sync for inserts/deletes by anyone (incl Gizmo).
    supabase
      .channel("activity_log_changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_log" },
        (payload) => {
          const entry = rowToEntry(payload.new as Row);
          set((s) => {
            if (s.entries.some((e) => e.id === entry.id)) return s;
            return { entries: [entry, ...s.entries] };
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "activity_log" },
        (payload) => {
          const id = (payload.old as { id: string }).id;
          set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
        },
      )
      .subscribe();
  },

  addEntry: async (text, type = "manual") => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Optimistic insert for snappy UI
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const optimistic: LogEntry = {
      id: tempId,
      timestamp: new Date().toISOString(),
      text: trimmed,
      type,
    };
    set((s) => ({ entries: [optimistic, ...s.entries] }));

    if (!supabaseReady) return;

    const { data, error } = await supabase
      .from("activity_log")
      .insert({ text: trimmed, type, source: type === "manual" ? "user" : type })
      .select("id, created_at, text, type")
      .single();

    if (error) {
      // Roll back optimistic insert
      set((s) => ({ entries: s.entries.filter((e) => e.id !== tempId) }));
      console.warn("activity_log insert failed:", error.message);
      return;
    }
    // Swap temp row for real row
    const real = rowToEntry(data as Row);
    set((s) => ({
      entries: s.entries.some((e) => e.id === real.id)
        ? s.entries.filter((e) => e.id !== tempId)
        : s.entries.map((e) => (e.id === tempId ? real : e)),
    }));
  },

  removeEntry: async (id) => {
    const prev = get().entries;
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
    if (!supabaseReady || id.startsWith("tmp-")) return;
    const { error } = await supabase.from("activity_log").delete().eq("id", id);
    if (error) {
      console.warn("activity_log delete failed:", error.message);
      set({ entries: prev });
    }
  },
}));

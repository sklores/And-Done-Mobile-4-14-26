import { create } from "zustand";

export type LogEntry = {
  id: string;
  timestamp: string; // ISO
  text: string;
  type: "manual" | "auto";
};

type LogState = {
  entries: LogEntry[];
  addEntry: (text: string, type?: "manual" | "auto") => void;
  removeEntry: (id: string) => void;
};

const STORAGE_KEY = "anddone:log";

function load(): LogEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch { return []; }
}

function save(entries: LogEntry[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); } catch {}
}

// Seed with a few mock auto-events if store is empty
const SEED: LogEntry[] = [
  { id: "seed-1", timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(), text: "Sales crossed $500 milestone", type: "auto" },
  { id: "seed-2", timestamp: new Date(Date.now() - 1000 * 60 * 90).toISOString(), text: "5 employees clocked in", type: "auto" },
  { id: "seed-3", timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString(), text: "Store opened", type: "auto" },
];

export const useLogStore = create<LogState>((set) => {
  const stored = load();
  return {
    entries: stored.length ? stored : SEED,

    addEntry: (text, type = "manual") => {
      const entry: LogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        text: text.trim(),
        type,
      };
      set((s) => {
        const entries = [entry, ...s.entries];
        save(entries);
        return { entries };
      });
    },

    removeEntry: (id) => {
      set((s) => {
        const entries = s.entries.filter((e) => e.id !== id);
        save(entries);
        return { entries };
      });
    },
  };
});

// Maintenance & Repair log — persisted to localStorage.
// Entries are keyed by date (YYYY-MM-DD) so today's M&R shows in
// the Fixed Cost tile and drill-down.
// Future: flag entries as matched bank transactions.

import { create } from "zustand";

export type MaintenanceEntry = {
  id: string;
  date: string;        // YYYY-MM-DD
  amount: number;
  description: string;
  flagged?: boolean;   // reserved: bank transaction match
};

type MaintenanceState = {
  entries: MaintenanceEntry[];
  addEntry: (amount: number, description: string) => void;
  removeEntry: (id: string) => void;
  todayEntries: () => MaintenanceEntry[];
  todayTotal: () => number;
};

const STORAGE_KEY = "anddone:maintenance";

function load(): MaintenanceEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function save(entries: MaintenanceEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch { /* storage full — ignore */ }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export const useMaintenanceStore = create<MaintenanceState>((set, get) => ({
  entries: load(),

  addEntry: (amount, description) => {
    const entry: MaintenanceEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: todayStr(),
      amount,
      description: description.trim(),
    };
    set((s) => {
      const entries = [...s.entries, entry];
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

  todayEntries: () => {
    const today = todayStr();
    return get().entries.filter((e) => e.date === today);
  },

  todayTotal: () => {
    const today = todayStr();
    return get()
      .entries.filter((e) => e.date === today)
      .reduce((s, e) => s + e.amount, 0);
  },
}));

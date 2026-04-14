import { create } from "zustand";
import { fetchTodaySales } from "../data/toastAdapter";

export type KpiKey =
  | "sales"
  | "cogs"
  | "labor"
  | "prime"
  | "expenses"
  | "reviews"
  | "social"
  | "net";

export type Kpi = {
  key: KpiKey;
  label: string;
  value: string;
  status: string;
  score: number; // 1-8
};

type KpiState = {
  sales: { value: number; label: string; sub: string };
  net: { value: string; label: string; sub: string };
  tiles: Kpi[];
  lastRefresh: number | null;
  refresh: () => Promise<void>;
};

// Reference mock values from Coastal reference HTML
const referenceTiles: Kpi[] = [
  { key: "cogs", label: "COGS", value: "26.4%", status: "Excellent", score: 8 },
  { key: "labor", label: "Labor", value: "31.2%", status: "Caution", score: 4 },
  { key: "prime", label: "Prime Cost", value: "57.6%", status: "Good", score: 6 },
  { key: "expenses", label: "Expenses", value: "38.1%", status: "Critical", score: 2 },
  { key: "reviews", label: "Reviews", value: "4.8", status: "Excellent", score: 8 },
  { key: "social", label: "Social", value: "+142", status: "Watch", score: 4 },
];

export const useKpiStore = create<KpiState>((set) => ({
  sales: { value: 12450, label: "Sales", sub: "Today" },
  net: { value: "18.2%", label: "Net", sub: "Today" },
  tiles: referenceTiles,
  lastRefresh: null,
  refresh: async () => {
    try {
      const total = await fetchTodaySales();
      if (total !== null) {
        set((s) => ({
          sales: { ...s.sales, value: total },
          lastRefresh: Date.now(),
        }));
      } else {
        set({ lastRefresh: Date.now() });
      }
    } catch {
      set({ lastRefresh: Date.now() });
    }
  },
}));

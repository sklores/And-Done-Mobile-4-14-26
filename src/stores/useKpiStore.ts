import { create } from "zustand";
import { fetchTodaySales, fetchTodayLabor } from "../data/toastAdapter";

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
  score: number;
};

type KpiState = {
  sales: { value: number; label: string; sub: string };
  net: { value: string; label: string; sub: string };
  tiles: Kpi[];
  lastRefresh: number | null;
  lastError: string | null;
  refresh: () => Promise<void>;
};

function laborScore(pct: number): number {
  if (pct <= 28) return 8;
  if (pct <= 30) return 7;
  if (pct <= 32) return 6;
  if (pct <= 34) return 5;
  if (pct <= 36) return 4;
  if (pct <= 38) return 3;
  return 2;
}

function laborStatus(score: number): string {
  const labels: Record<number, string> = {
    8: "Excellent", 7: "Good", 6: "Watch",
    5: "Caution", 4: "Alert", 3: "Bad", 2: "Critical",
  };
  return labels[score] ?? "Critical";
}

const placeholderTiles: Kpi[] = [
  { key: "cogs", label: "COGS", value: "26.4%", status: "Excellent", score: 8 },
  { key: "labor", label: "Labor", value: "--", status: "Loading", score: 5 },
  { key: "prime", label: "Prime Cost", value: "57.6%", status: "Good", score: 6 },
  { key: "expenses", label: "Expenses", value: "38.1%", status: "Critical", score: 2 },
  { key: "reviews", label: "Reviews", value: "4.8", status: "Excellent", score: 8 },
  { key: "social", label: "Social", value: "+142", status: "Watch", score: 4 },
];

export const useKpiStore = create<KpiState>((set) => ({
  sales: { value: 0, label: "Sales", sub: "Today" },
  net: { value: "18.2%", label: "Net", sub: "Today" },
  tiles: placeholderTiles,
  lastRefresh: null,
  lastError: null,

  refresh: async () => {
    const [salesResult, laborResult] = await Promise.all([
      fetchTodaySales(),
      fetchTodayLabor(),
    ]);

    set((s) => {
      const totalSales = salesResult?.total ?? s.sales.value;

      let laborTile: Kpi = s.tiles.find((t) => t.key === "labor") ?? placeholderTiles[1];

      if (laborResult && totalSales > 0) {
        const laborPct = (laborResult.totalLaborCost / totalSales) * 100;
        const score = laborScore(laborPct);
        laborTile = {
          key: "labor",
          label: "Labor",
          value: `${laborPct.toFixed(1)}%`,
          status: laborStatus(score),
          score,
        };
      } else if (laborResult && totalSales === 0) {
        laborTile = {
          key: "labor",
          label: "Labor",
          value: `$${laborResult.totalLaborCost.toFixed(0)}`,
          status: "Live",
          score: 5,
        };
      }

      const updatedTiles = s.tiles.map((t) =>
        t.key === "labor" ? laborTile : t
      );

      return {
        sales: { ...s.sales, value: totalSales },
        tiles: updatedTiles,
        lastRefresh: Date.now(),
        lastError: null,
      };
    });
  },
}));

import { create } from "zustand";
import { fetchTodaySales, fetchTodayLabor, fetchSalesDetail } from "../data/toastAdapter";
import type { SalesDetailResult } from "../data/toastAdapter";

export type KpiKey =
  | "sales" | "cogs" | "labor" | "prime"
  | "expenses" | "reviews" | "social" | "net";

export type Kpi = {
  key: KpiKey;
  label: string;
  value: string;
  status: string;
  score: number;
};

export type LaborDetail = {
  laborCost: number;
  hoursWorked: number;
  employeeCount: number;
  openCount: number;
  totalSales: number;
  totalTips: number;
  salesPerManHour: number | null;
  tipPct: number | null;
};

type KpiState = {
  sales: { value: number; label: string; sub: string };
  net: { value: string; label: string; sub: string };
  tiles: Kpi[];
  laborDetail: LaborDetail | null;
  salesDetail: SalesDetailResult | null;
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

function primeScore(pct: number): number {
  if (pct <= 55) return 8;
  if (pct <= 60) return 7;
  if (pct <= 65) return 6;
  if (pct <= 68) return 5;
  if (pct <= 72) return 4;
  if (pct <= 78) return 3;
  return 2;
}

function scoreStatus(score: number): string {
  const labels: Record<number, string> = {
    8: "Excellent", 7: "Good", 6: "Watch",
    5: "Caution", 4: "Alert", 3: "Bad", 2: "Critical",
  };
  return labels[score] ?? "Critical";
}

const COGS_PCT_MOCK = 26.4;

const placeholderTiles: Kpi[] = [
  { key: "cogs",     label: "COGS",       value: "26.4%",  status: "Excellent", score: 8 },
  { key: "labor",    label: "Labor",      value: "--",     status: "Loading",   score: 5 },
  { key: "prime",    label: "Prime Cost", value: "--",     status: "Loading",   score: 5 },
  { key: "expenses", label: "Expenses",   value: "38.1%",  status: "Critical",  score: 2 },
  { key: "reviews",  label: "Reviews",    value: "4.8",    status: "Excellent", score: 8 },
  { key: "social",   label: "Social",     value: "+142",   status: "Watch",     score: 4 },
];

export const useKpiStore = create<KpiState>((set) => ({
  sales: { value: 0, label: "Sales", sub: "Today" },
  net: { value: "18.2%", label: "Net", sub: "Today" },
  tiles: placeholderTiles,
  laborDetail: null,
  salesDetail: null,
  lastRefresh: null,
  lastError: null,

  refresh: async () => {
    const [salesResult, laborResult, salesDetailResult] = await Promise.all([
      fetchTodaySales(),
      fetchTodayLabor(),
      fetchSalesDetail(),
    ]);

    set((s) => {
      const totalSales = salesResult?.total ?? s.sales.value;
      const totalTips = salesResult?.totalTips ?? 0;

      let laborTile: Kpi = s.tiles.find((t) => t.key === "labor") ?? placeholderTiles[1];
      let primeTile: Kpi = s.tiles.find((t) => t.key === "prime") ?? placeholderTiles[2];
      let laborDetail: LaborDetail | null = s.laborDetail;

      if (laborResult) {
        const hoursWorked = laborResult.totalHours;
        const laborCost   = laborResult.totalLaborCost;

        laborDetail = {
          laborCost,
          hoursWorked,
          employeeCount: laborResult.employeeCount,
          openCount: laborResult.openCount,
          totalSales,
          totalTips,
          salesPerManHour: hoursWorked > 0 ? totalSales / hoursWorked : null,
          tipPct: totalSales > 0 ? (totalTips / totalSales) * 100 : null,
        };

        if (totalSales > 0) {
          const laborPct = (laborCost / totalSales) * 100;
          const lScore   = laborScore(laborPct);
          laborTile = {
            key: "labor", label: "Labor",
            value: `${laborPct.toFixed(1)}%`,
            status: scoreStatus(lScore), score: lScore,
          };
          const primePct = laborPct + COGS_PCT_MOCK;
          const pScore   = primeScore(primePct);
          primeTile = {
            key: "prime", label: "Prime Cost",
            value: `${primePct.toFixed(1)}%`,
            status: scoreStatus(pScore), score: pScore,
          };
        } else if (laborCost > 0) {
          laborTile = { key: "labor", label: "Labor", value: `$${laborCost.toFixed(0)}`, status: "No Sales", score: 2 };
          primeTile = { key: "prime", label: "Prime Cost", value: "No Sales", status: "Critical", score: 2 };
        } else {
          laborTile = { key: "labor", label: "Labor", value: "--", status: "Idle", score: 5 };
          primeTile = { key: "prime", label: "Prime Cost", value: "--", status: "Idle", score: 5 };
        }
      }

      const updatedTiles = s.tiles.map((t) => {
        if (t.key === "labor") return laborTile;
        if (t.key === "prime") return primeTile;
        return t;
      });

      return {
        sales: { ...s.sales, value: totalSales },
        tiles: updatedTiles,
        laborDetail,
        salesDetail: salesDetailResult ?? s.salesDetail,
        lastRefresh: Date.now(),
        lastError: null,
      };
    });
  },
}));

import { create } from "zustand";
import { fetchTodaySales, fetchTodayLabor, fetchSalesDetail, fetchLaborDetail, fetchCOGSDetail } from "../data/toastAdapter";
import type { SalesDetailResult, LaborDetailResult, COGSDetailResult } from "../data/toastAdapter";
import { RENT_PCT, dailyFixed, fixedScore } from "../config/fixedCostConfig";
import { getTodayMRTotal } from "./useMaintenanceStore";

export type KpiKey =
  | "sales" | "cogs" | "labor" | "prime"
  | "fixed" | "reviews" | "social" | "net";

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

export type NetDetail = {
  salesDollars: number;
  laborDollars: number;
  cogsDollars: number;
  primeDollars: number;
  primePct: number;
  fixedDollars: number;
  fixedPct: number;
  rentDollars: number;
  amortizedDollars: number;
  mrDollars: number;
  netDollars: number;
  netPct: number;
};

function netScore(pct: number): number {
  if (pct >= 20) return 8;
  if (pct >= 15) return 7;
  if (pct >= 10) return 6;
  if (pct >=  5) return 5;
  if (pct >=  2) return 4;
  if (pct >=  0) return 3;
  return 2; // losing money
}

type KpiState = {
  sales: { value: number; label: string; sub: string };
  net: { value: string; dollars: number; label: string; sub: string; score: number };
  netDetail: NetDetail | null;
  tiles: Kpi[];
  laborDetail: LaborDetail | null;
  salesDetail: SalesDetailResult | null;
  laborDetailRich: LaborDetailResult | null;
  cogsDetail: COGSDetailResult | null;
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
  { key: "cogs",    label: "COGS",       value: "26.4%", status: "Excellent", score: 8 },
  { key: "labor",   label: "Labor",      value: "--",    status: "Loading",   score: 5 },
  { key: "prime",   label: "Prime Cost", value: "--",    status: "Loading",   score: 5 },
  { key: "fixed",   label: "Fixed Cost", value: "--",    status: "Loading",   score: 5 },
  { key: "reviews", label: "Reviews",    value: "4.8",   status: "Excellent", score: 8 },
  { key: "social",  label: "Social",     value: "+142",  status: "Watch",     score: 4 },
];

export const useKpiStore = create<KpiState>((set) => ({
  sales: { value: 0, label: "Sales", sub: "Today" },
  net: { value: "--", dollars: 0, label: "Net Profit", sub: "Today", score: 5 },
  netDetail: null,
  tiles: placeholderTiles,
  laborDetail: null,
  salesDetail: null,
  laborDetailRich: null,
  cogsDetail: null,
  lastRefresh: null,
  lastError: null,

  refresh: async () => {
    const [salesResult, laborResult, salesDetailResult, laborDetailRich, cogsDetailResult] = await Promise.all([
      fetchTodaySales(),
      fetchTodayLabor(),
      fetchSalesDetail(),
      fetchLaborDetail(),
      fetchCOGSDetail(),
    ]);

    set((s) => {
      const totalSales = salesResult?.total ?? s.sales.value;
      const totalTips  = salesResult?.totalTips ?? 0;

      // ── COGS tile (real if available, mock fallback) ───────────────
      let cogsTile: Kpi = s.tiles.find((t) => t.key === "cogs") ?? placeholderTiles[0];
      const cogsPctActual    = cogsDetailResult?.effectiveCOGSPct ?? COGS_PCT_MOCK;
      const cogsDollarsActual = cogsDetailResult?.effectiveCOGS
        ?? (totalSales * COGS_PCT_MOCK / 100);

      function cogsScore(pct: number): number {
        if (pct <= 25) return 8;
        if (pct <= 28) return 7;
        if (pct <= 31) return 6;
        if (pct <= 34) return 5;
        if (pct <= 37) return 4;
        if (pct <= 42) return 3;
        return 2;
      }
      if (cogsDetailResult && totalSales > 0) {
        const cScore = cogsScore(cogsPctActual);
        cogsTile = {
          key: "cogs", label: "COGS",
          value: `${cogsPctActual.toFixed(1)}%`,
          status: scoreStatus(cScore), score: cScore,
        };
      }

      // ── Labor ──────────────────────────────────────────────────────
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
          const primePct = laborPct + cogsPctActual;
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

      // ── Fixed Cost ─────────────────────────────────────────────────
      const todayMR       = getTodayMRTotal();
      const rentCost      = totalSales * RENT_PCT;
      const amortizedCost = dailyFixed();
      const totalFixed    = rentCost + amortizedCost + todayMR;

      let fixedTile: Kpi;
      if (totalSales > 0) {
        const fixedPct = (totalFixed / totalSales) * 100;
        const fScore   = fixedScore(fixedPct);
        fixedTile = {
          key: "fixed", label: "Fixed Cost",
          value: `${fixedPct.toFixed(1)}%`,
          status: scoreStatus(fScore), score: fScore,
        };
      } else {
        // No sales yet — show raw daily burden in dollars
        fixedTile = {
          key: "fixed", label: "Fixed Cost",
          value: `$${Math.round(amortizedCost + todayMR)}`,
          status: "No Sales", score: 4,
        };
      }

      const updatedTiles = s.tiles.map((t) => {
        if (t.key === "cogs")  return cogsTile;
        if (t.key === "labor") return laborTile;
        if (t.key === "prime") return primeTile;
        if (t.key === "fixed") return fixedTile;
        return t;
      });

      // ── Net Profit ─────────────────────────────────────────────────
      const laborCostFinal  = laborResult?.totalLaborCost ?? 0;
      const cogsDollars     = cogsDollarsActual;
      const primeDollars    = laborCostFinal + cogsDollars;
      const netDollars      = totalSales - primeDollars - totalFixed;
      const netPct          = totalSales > 0 ? (netDollars / totalSales) * 100 : 0;
      const nScore          = totalSales > 0 ? netScore(netPct) : 5;

      const netDetail: NetDetail | null = totalSales > 0 ? {
        salesDollars:     totalSales,
        laborDollars:     laborCostFinal,
        cogsDollars:      Math.round(cogsDollarsActual * 100) / 100,
        primeDollars:     Math.round(primeDollars * 100) / 100,
        primePct:         totalSales > 0 ? (primeDollars / totalSales) * 100 : 0,
        fixedDollars:     Math.round(totalFixed * 100) / 100,
        fixedPct:         totalSales > 0 ? (totalFixed / totalSales) * 100 : 0,
        rentDollars:      Math.round(rentCost * 100) / 100,
        amortizedDollars: Math.round(amortizedCost * 100) / 100,
        mrDollars:        Math.round(todayMR * 100) / 100,
        netDollars:       Math.round(netDollars * 100) / 100,
        netPct:           Math.round(netPct * 10) / 10,
      } : s.netDetail;

      const netState = totalSales > 0
        ? {
            value:   `${netPct.toFixed(1)}%`,
            dollars: Math.round(netDollars),
            label:   "Net Profit",
            sub:     `$${Math.round(netDollars).toLocaleString()} today`,
            score:   nScore,
          }
        : { value: "--", dollars: 0, label: "Net Profit", sub: "Today", score: 5 };

      return {
        sales: { ...s.sales, value: totalSales },
        net: netState,
        netDetail,
        tiles: updatedTiles,
        laborDetail,
        salesDetail: salesDetailResult ?? s.salesDetail,
        laborDetailRich: laborDetailRich ?? s.laborDetailRich,
        cogsDetail: cogsDetailResult ?? s.cogsDetail,
        lastRefresh: Date.now(),
        lastError: null,
      };
    });
  },
}));

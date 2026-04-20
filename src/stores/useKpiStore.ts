import { create } from "zustand";
import { fetchTodaySales, fetchTodayLabor, fetchSalesDetail, fetchLaborDetail, fetchCOGSDetail } from "../data/toastAdapter";
import type { SalesDetailResult, LaborDetailResult, COGSDetailResult } from "../data/toastAdapter";
import { fetchTodayScheduled } from "../data/scheduleAdapter";
import type { ScheduledLaborResult } from "../data/scheduleAdapter";
import { RENT_PCT, hourlyAmortized, fixedScore } from "../config/fixedCostConfig";
import { getTodayMRTotal } from "./useMaintenanceStore";
import { supabase, supabaseReady } from "../lib/supabase";

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
  laborCost: number;       // grand total: hourly + salary + payroll tax
  hourlyCost: number;      // raw Toast clock-in wages only
  salaryCost: number;      // prorated daily salary for salaried staff
  payrollTax: number;      // est. employer payroll taxes (FICA + FUTA + SUTA)
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

// Shape of a kpi_snapshots row from Supabase
type KpiSnapshot = {
  sales_total: number;
  sales_tips: number;
  sales_instore: number;
  sales_takeout: number;
  sales_delivery: number;
  check_average: number | null;
  covers: number | null;
  labor_total: number;
  labor_pct: number;
  worked_hours: number | null;
  cogs_total: number;
  cogs_pct: number;
  cogs_food: number | null;
  cogs_beverage: number | null;
  cogs_alcohol: number | null;
  prime_cost_pct: number;
  net_profit: number;
  net_profit_pct: number;
  captured_at: string;
};

type KpiState = {
  sales: { value: number; label: string; sub: string };
  net: { value: string; dollars: number; label: string; sub: string; score: number };
  netDetail: NetDetail | null;
  tiles: Kpi[];
  laborDetail: LaborDetail | null;
  salesDetail: SalesDetailResult | null;
  laborDetailRich: LaborDetailResult | null;
  cogsDetail: COGSDetailResult | null;
  scheduleDetail: ScheduledLaborResult | null;
  lastRefresh: number | null;
  lastError: string | null;
  lastSnapshotAt: string | null;
  refresh: () => Promise<void>;
  applySnapshot: (snap: KpiSnapshot) => void;
  subscribeToSnapshots: () => () => void;
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

// ── Employer payroll tax estimate (FICA 7.65% + FUTA 0.6% + DC SUTA 2.7%) ─
const PAYROLL_TAX_RATE = 0.11;

const placeholderTiles: Kpi[] = [
  { key: "cogs",    label: "COGS",       value: "26.4%", status: "Excellent", score: 8 },
  { key: "labor",   label: "Labor",      value: "--",    status: "Loading",   score: 5 },
  { key: "prime",   label: "Prime Cost", value: "--",    status: "Loading",   score: 5 },
  { key: "fixed",   label: "Fixed Cost", value: "--",    status: "Loading",   score: 5 },
];

export const useKpiStore = create<KpiState>((set, get) => ({
  sales: { value: 0, label: "Sales", sub: "Today" },
  net: { value: "--", dollars: 0, label: "Net Profit", sub: "Today", score: 5 },
  netDetail: null,
  tiles: placeholderTiles,
  laborDetail: null,
  salesDetail: null,
  laborDetailRich: null,
  cogsDetail: null,
  scheduleDetail: null,
  lastRefresh: null,
  lastError: null,
  lastSnapshotAt: null,

  // ── Apply a kpi_snapshots row to the store ──────────────────────────────
  applySnapshot: (snap: KpiSnapshot) => {
    const totalSales = snap.sales_total ?? 0;
    if (totalSales <= 0) return;

    // Fixed costs (still computed locally)
    const todayMR       = getTodayMRTotal();
    const rentCost      = totalSales * RENT_PCT;
    const amortizedCost = hourlyAmortized(); // drips 10 AM → 4 PM ET
    const totalFixed    = rentCost + amortizedCost + todayMR;

    const laborCost = snap.labor_total ?? 0;
    const cogsDollars = snap.cogs_total ?? 0;
    const netDollars = totalSales - cogsDollars - laborCost - totalFixed;
    const netPct     = (netDollars / totalSales) * 100;
    const nScore     = netScore(netPct);

    function cogsScore(pct: number) {
      if (pct <= 25) return 8; if (pct <= 28) return 7; if (pct <= 31) return 6;
      if (pct <= 34) return 5; if (pct <= 37) return 4; if (pct <= 42) return 3;
      return 2;
    }
    const cogsPct  = snap.cogs_pct  ?? 0;
    const laborPct = snap.labor_pct ?? 0;
    const primePct = snap.prime_cost_pct ?? 0;
    const fixedPct = (totalFixed / totalSales) * 100;

    const updatedTiles = get().tiles.map((t) => {
      if (t.key === "cogs") {
        const s = cogsScore(cogsPct);
        return { key: "cogs" as const, label: "COGS", value: `${cogsPct.toFixed(1)}%`, status: scoreStatus(s), score: s };
      }
      if (t.key === "labor") {
        const s = laborScore(laborPct);
        return { key: "labor" as const, label: "Labor", value: `${laborPct.toFixed(1)}%`, status: scoreStatus(s), score: s };
      }
      if (t.key === "prime") {
        const s = primeScore(primePct);
        return { key: "prime" as const, label: "Prime Cost", value: `${primePct.toFixed(1)}%`, status: scoreStatus(s), score: s };
      }
      if (t.key === "fixed") {
        const s = fixedScore(fixedPct);
        return { key: "fixed" as const, label: "Fixed Cost", value: `${fixedPct.toFixed(1)}%`, status: scoreStatus(s), score: s };
      }
      return t;
    });

    const netDetail: NetDetail = {
      salesDollars:     totalSales,
      laborDollars:     Math.round(laborCost * 100) / 100,
      cogsDollars:      Math.round(cogsDollars * 100) / 100,
      primeDollars:     Math.round((laborCost + cogsDollars) * 100) / 100,
      primePct:         primePct,
      fixedDollars:     Math.round(totalFixed * 100) / 100,
      fixedPct:         fixedPct,
      rentDollars:      Math.round(rentCost * 100) / 100,
      amortizedDollars: Math.round(amortizedCost * 100) / 100,
      mrDollars:        Math.round(todayMR * 100) / 100,
      netDollars:       Math.round(netDollars * 100) / 100,
      netPct:           Math.round(netPct * 10) / 10,
    };

    set({
      sales: { value: totalSales, label: "Sales", sub: "Today" },
      tiles: updatedTiles,
      net: {
        value:   `${netPct.toFixed(1)}%`,
        dollars: Math.round(netDollars),
        label:   "Net Profit",
        sub:     `$${Math.round(netDollars).toLocaleString()} today`,
        score:   nScore,
      },
      netDetail,
      lastSnapshotAt: snap.captured_at,
      lastRefresh: Date.now(),
    });
  },

  // ── Real-time subscription to kpi_snapshots ─────────────────────────────
  subscribeToSnapshots: () => {
    if (!supabaseReady) {
      console.warn("[supabase] Skipping subscription — env vars not set");
      return () => {};
    }
    // Load the latest snapshot immediately on subscribe
    supabase
      .from("kpi_snapshots")
      .select("*")
      .order("captured_at", { ascending: false })
      .limit(1)
      .single()
      .then(({ data, error }) => {
        if (!error && data) get().applySnapshot(data as KpiSnapshot);
      });

    // Subscribe to real-time inserts
    const channel = supabase
      .channel("kpi-snapshots-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "kpi_snapshots" },
        (payload) => {
          console.log("[supabase] new snapshot received");
          get().applySnapshot(payload.new as KpiSnapshot);
        },
      )
      .subscribe();

    // Return unsubscribe function
    return () => { supabase.removeChannel(channel); };
  },

  refresh: async () => {
    const [salesResult, laborResult, salesDetailResult, laborDetailRich, cogsDetailResult, scheduledResult] = await Promise.all([
      fetchTodaySales(),
      fetchTodayLabor(),
      fetchSalesDetail(),
      fetchLaborDetail(),
      fetchCOGSDetail(),
      fetchTodayScheduled(),
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
        const hoursWorked  = laborResult.totalHours;
        const hourlyCost   = laborResult.totalLaborCost;

        // Salary is now schedule-driven: the weekly_salary pool (from
        // shift_settings) amortized across the sum of daily operating
        // windows (Mon–Sun earliest-start → latest-end). `scheduledResult`
        // carries the live accrued-today figure.
        const salaryCost = scheduledResult?.salaryAccruedToday ?? 0;

        const payrollTax   = Math.round((hourlyCost + salaryCost) * PAYROLL_TAX_RATE * 100) / 100;
        const laborCost    = hourlyCost + salaryCost + payrollTax;

        laborDetail = {
          laborCost,
          hourlyCost,
          salaryCost,
          payrollTax,
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
          laborTile = { key: "labor", label: "Labor", value: `$${Math.round(laborCost)}`, status: "No Sales", score: 2 };
          primeTile = { key: "prime", label: "Prime Cost", value: "No Sales", status: "Critical", score: 2 };
        } else {
          laborTile = { key: "labor", label: "Labor", value: `$${Math.round(salaryCost + (salaryCost * PAYROLL_TAX_RATE))}`, status: "Idle", score: 5 };
          primeTile = { key: "prime", label: "Prime Cost", value: "--", status: "Idle", score: 5 };
        }
      }

      // ── Fixed Cost ─────────────────────────────────────────────────
      const todayMR       = getTodayMRTotal();
      const rentCost      = totalSales * RENT_PCT;
      const amortizedCost = hourlyAmortized(); // drips 10 AM → 4 PM ET
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
      const laborCostFinal  = laborDetail?.laborCost ?? 0; // full cost: hourly + salary + payroll tax
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
        scheduleDetail: scheduledResult ?? s.scheduleDetail,
        lastRefresh: Date.now(),
        lastError: null,
      };
    });
  },
}));

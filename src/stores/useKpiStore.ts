import { create } from "zustand";
import { fetchSalesDetail, fetchLaborDetail, fetchCOGSDetail } from "../data/toastAdapter";
import type { SalesDetailResult, LaborDetailResult, COGSDetailResult } from "../data/toastAdapter";
import { fetchTodayScheduled } from "../data/scheduleAdapter";
import type { ScheduledLaborResult } from "../data/scheduleAdapter";
import { fixedScore } from "../config/fixedCostConfig";
import { money } from "../lib/money";

export type KpiKey =
  | "sales" | "cogs" | "labor" | "prime"
  | "fixed" | "reviews" | "social" | "net";

export type Kpi = {
  key: KpiKey;
  label: string;
  value: string;
  status: string;
  /** 1-8 benchmark score; null = no data to score (neutral tile, never a fake green). */
  score: number | null;
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
  period?: string;
  has_data?: boolean;
  has_tick?: boolean;
  as_of?: string | null;
  days_expected?: number;
  days_closed?: number;
  days_partial?: number;
  days_missing?: number;
  expected_to_date?: number | null;
  open_fraction?: number;
  labor_estimated?: boolean;
  sales_total: number;
  sales_tips: number;
  sales_instore: number;
  sales_takeout: number;
  sales_delivery: number;
  check_average: number | null;
  covers: number | null;
  // Labor breakouts (added 2026-05-10 with the full P&L migration; older
  // snapshots have these as null and we fall back to deriving from labor_total)
  labor_hourly: number | null;
  salary_total: number | null;
  payroll_tax: number | null;
  labor_total: number;
  labor_pct: number;
  worked_hours: number | null;
  cogs_total: number;
  cogs_pct: number;
  cogs_food: number | null;
  cogs_beverage: number | null;
  cogs_alcohol: number | null;
  prime_cost_pct: number;
  // Fixed cost breakouts (also new). Mobile prefers these from the
  // snapshot but recomputes M&R locally so a fresh entry doesn't have to
  // wait 5 min for the next sync.
  rent_dollars: number | null;
  amortized_dollars: number | null;
  mr_dollars: number | null;
  fixed_total: number | null;
  fixed_pct: number | null;
  net_profit: number;
  net_profit_pct: number;
  captured_at: string;
};

export type Period = "day" | "wtd" | "mtd";
export const PERIOD_LABEL: Record<Period, string> = { day: "Today", wtd: "Week to date", mtd: "Month to date" };
const PERIOD_KEY = "and-done.period";
const readPeriod = (): Period => { try { const v = localStorage.getItem(PERIOD_KEY); return v === "wtd" || v === "mtd" ? v : "day"; } catch { return "day"; } };

export type SnapshotStatus = "loading" | "ready" | "empty" | "error";
export type PeriodMeta = { daysExpected: number; daysClosed: number; daysPartial: number; daysMissing: number; laborEstimated: boolean; hasTick: boolean; expectedToDate: number | null };

type KpiState = {
  period: Period;
  setPeriod: (p: Period) => void;
  /** What the tiles are showing right now: loading (switching / first pull),
   *  ready, empty (no data for this period yet), error (last pull failed). */
  status: SnapshotStatus;
  /** When the newest number on screen was captured -- the only honest clock. */
  asOf: string | null;
  meta: PeriodMeta | null;
  sales: { value: number; label: string; sub: string };
  net: { value: string; dollars: number; label: string; sub: string; score: number | null };
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
  pullSnapshot: () => Promise<void>;
  applySnapshot: (snap: KpiSnapshot, requested: Period) => void;
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


// No placeholder numbers, ever: a tile without data says so, in neutral.
const TILE_KEYS = [["cogs", "COGS"], ["labor", "Labor"], ["prime", "Prime Cost"], ["fixed", "Fixed Cost"]] as const;
const tilesWith = (status: string): Kpi[] => TILE_KEYS.map(([key, label]) => ({ key, label, value: "--", status, score: null }));
const placeholderTiles: Kpi[] = tilesWith("");
let pullGeneration = 0;   // every pull gets a number; a reply from an older pull is ignored

export const useKpiStore = create<KpiState>((set, get) => ({
  period: readPeriod(),
  setPeriod: (p) => {
    if (p === get().period) return;
    try { localStorage.setItem(PERIOD_KEY, p); } catch { /* private mode */ }
    // The numbers on screen belong to the OLD period. Clear them until the
    // new period's numbers land -- never show one period under another's label.
    set({ period: p, status: "loading", asOf: null, meta: null, sales: { value: 0, label: "Sales", sub: PERIOD_LABEL[p] }, net: { value: "--", dollars: 0, label: "Net Profit", sub: PERIOD_LABEL[p], score: null }, netDetail: null, tiles: tilesWith(""), laborDetail: null, salesDetail: null, laborDetailRich: null, cogsDetail: null });
    void get().pullSnapshot();
    void get().refresh();
  },
  status: "loading",
  asOf: null,
  meta: null,
  sales: { value: 0, label: "Sales", sub: PERIOD_LABEL[readPeriod()] },
  net: { value: "--", dollars: 0, label: "Net Profit", sub: PERIOD_LABEL[readPeriod()], score: null },
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

  // ── Apply a snapshot row for ONE period ──────────────────────────────────
  // The seed's row is the truth for the tiles: totals, percents, net -- all
  // summed server-side over the same closes the desk uses. Three states:
  //   has_data false  -> empty: nothing for this period yet (before the first tick)
  //   sales 0         -> ready, but every ratio is "--" (nothing to divide by)
  //   otherwise       -> ready, scored
  applySnapshot: (snap: KpiSnapshot, requested: Period) => {
    if (requested !== get().period) return;   // the selector moved while this was in flight
    const period = requested;
    const periodWord = period === "day" ? "today" : period === "wtd" ? "this week" : "this month";
    const meta: PeriodMeta = {
      daysExpected: snap.days_expected ?? 1, daysClosed: snap.days_closed ?? 0, daysPartial: snap.days_partial ?? 0, daysMissing: snap.days_missing ?? 0,
      laborEstimated: snap.labor_estimated === true, hasTick: snap.has_tick === true, expectedToDate: snap.expected_to_date ?? null,
    };
    const asOf = snap.as_of ?? snap.captured_at ?? null;
    const common = { asOf, meta, lastSnapshotAt: snap.captured_at ?? null, lastRefresh: Date.now(), lastError: null };

    if (snap.has_data === false) {
      set({ ...common, status: "empty", sales: { value: 0, label: "Sales", sub: PERIOD_LABEL[period] }, tiles: tilesWith(""), net: { value: "--", dollars: 0, label: "Net Profit", sub: PERIOD_LABEL[period], score: null }, netDetail: null });
      return;
    }
    const totalSales = snap.sales_total ?? 0;
    const laborCost = snap.labor_total ?? 0, cogsDollars = snap.cogs_total ?? 0;
    const rentCost = snap.rent_dollars ?? 0, amortizedCost = snap.amortized_dollars ?? 0, mrDollars = snap.mr_dollars ?? 0;
    const totalFixed = snap.fixed_total ?? rentCost + amortizedCost + mrDollars;
    const netDollars = snap.net_profit ?? totalSales - cogsDollars - laborCost - totalFixed;

    if (totalSales <= 0) {
      set({ ...common, status: "ready", sales: { value: 0, label: "Sales", sub: PERIOD_LABEL[period] }, tiles: tilesWith(""), net: { value: "--", dollars: Math.round(netDollars), label: "Net Profit", sub: `${money(netDollars)} ${periodWord}`, score: null }, netDetail: null });
      return;
    }

    function cogsScore(pct: number) {
      if (pct <= 25) return 8; if (pct <= 28) return 7; if (pct <= 31) return 6;
      if (pct <= 34) return 5; if (pct <= 37) return 4; if (pct <= 42) return 3;
      return 2;
    }
    const cogsPct = snap.cogs_pct ?? (cogsDollars / totalSales) * 100;
    const laborPct = snap.labor_pct ?? (laborCost / totalSales) * 100;
    const primePct = snap.prime_cost_pct ?? ((cogsDollars + laborCost) / totalSales) * 100;
    const fixedPct = snap.fixed_pct ?? (totalFixed / totalSales) * 100;
    const netPct = snap.net_profit_pct ?? (netDollars / totalSales) * 100;
    const tile = (key: Kpi["key"], label: string, pct: number, score: number): Kpi => ({ key, label, value: `${pct.toFixed(1)}%`, status: scoreStatus(score), score });
    const tiles: Kpi[] = [
      tile("cogs", "COGS", cogsPct, cogsScore(cogsPct)),
      tile("labor", "Labor", laborPct, laborScore(laborPct)),
      tile("prime", "Prime Cost", primePct, primeScore(primePct)),
      tile("fixed", "Fixed Cost", fixedPct, fixedScore(fixedPct)),
    ];
    const netDetail: NetDetail = {
      salesDollars: totalSales,
      laborDollars: Math.round(laborCost * 100) / 100,
      cogsDollars: Math.round(cogsDollars * 100) / 100,
      primeDollars: Math.round((laborCost + cogsDollars) * 100) / 100,
      primePct,
      fixedDollars: Math.round(totalFixed * 100) / 100,
      fixedPct,
      rentDollars: Math.round(rentCost * 100) / 100,
      amortizedDollars: Math.round(amortizedCost * 100) / 100,
      mrDollars: Math.round(mrDollars * 100) / 100,
      netDollars: Math.round(netDollars * 100) / 100,
      netPct: Math.round(netPct * 10) / 10,
    };
    set({
      ...common, status: "ready",
      sales: { value: totalSales, label: "Sales", sub: PERIOD_LABEL[period] },
      tiles,
      net: { value: `${netPct.toFixed(1)}%`, dollars: Math.round(netDollars), label: "Net Profit", sub: `${money(netDollars)} ${periodWord}`, score: netScore(netPct) },
      netDetail,
    });
  },

  // ── Latest snapshot from the seed (D15) ─────────────────────────────────
  // The heartbeat writes every 5 minutes; polling at 60s keeps the tiles as
  // fresh as the data is. No database access from the browser, no anon key.
  pullSnapshot: async () => {
    const period = get().period;
    const gen = ++pullGeneration;
    try {
      const r = await fetch(`/api/snapshot?period=${period}`, { cache: "no-store" });
      if (gen !== pullGeneration) return;            // a newer pull is in flight
      if (r.status === 401) { window.dispatchEvent(new Event("owner-session-expired")); return; }
      if (!r.ok) throw new Error(`snapshot ${r.status}`);
      const data = (await r.json()) as KpiSnapshot | null;
      if (gen !== pullGeneration) return;
      if (!data) throw new Error("snapshot: empty reply");
      get().applySnapshot(data, period);
    } catch (e) {
      if (gen !== pullGeneration) return;
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[seed] snapshot fetch failed", msg);
      // Say so. Keep whatever was on screen, but mark it: the status drives
      // the "as of" line and the tiles' dimming.
      set({ status: "error", lastError: msg });
    }
  },
  subscribeToSnapshots: () => {
    void get().pullSnapshot();
    const timer = setInterval(() => void get().pullSnapshot(), 60_000);
    // The installed PWA suspends timers in the background; on return, pull now.
    const onVisible = () => { if (document.visibilityState === "visible") void get().pullSnapshot(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("pageshow", onVisible); };
  },

  // ── The drill-downs, for the selected period ─────────────────────────────
  // Same window as the tiles (the seed's periodWindow). A reply for a period
  // the user has since left is dropped.
  refresh: async () => {
    const period = get().period;
    const [salesDetailResult, laborDetailRich, cogsDetailResult, scheduledResult] = await Promise.all([
      fetchSalesDetail(period),
      fetchLaborDetail(period),
      fetchCOGSDetail(period),
      period === "day" ? fetchTodayScheduled() : Promise.resolve(null),
    ]);
    if (period !== get().period) return;
    set((s) => {
      const L = laborDetailRich;
      const totalSales = L?.totalSales ?? salesDetailResult?.totals?.sales ?? s.sales.value;
      const totalTips = L?.totalTips ?? salesDetailResult?.totals?.tips ?? 0;
      const laborDetail: LaborDetail | null = L ? {
        laborCost: L.laborCost ?? L.hourlyCost + L.salaryCost + (L.payrollTax ?? 0),
        hourlyCost: L.hourlyCost,
        salaryCost: L.salaryCost,
        payrollTax: L.payrollTax ?? 0,
        hoursWorked: L.hourlyHours,
        employeeCount: L.employeeCount,
        openCount: L.openShifts ?? 0,
        totalSales,
        totalTips,
        salesPerManHour: L.hourlyHours > 0 ? totalSales / L.hourlyHours : null,
        tipPct: totalSales > 0 ? (totalTips / totalSales) * 100 : null,
      } : null;
      return {
        laborDetail,
        salesDetail: salesDetailResult,
        laborDetailRich,
        cogsDetail: cogsDetailResult,
        scheduleDetail: period === "day" ? scheduledResult : null,
        lastRefresh: Date.now(),
        lastError: null,
      };
    });
  },
}));

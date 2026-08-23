import { ownerFetch } from "./ownerFetch";
import type { Period } from "../stores/useKpiStore";
// Client-side adapter: calls our own /api/toast-* endpoints.
// All Toast auth + secrets live server-side (api/_toast.mjs).

export type SalesResult = {
  total: number;
  totalTips: number;
  checkCount: number;
  orderCount: number;
  businessDate: string;
  fetchedAt: string;
};

export type LaborResult = {
  totalLaborCost: number;
  totalHours: number;
  closedCost: number;
  openCost: number;
  employeeCount: number;
  openCount: number;
  firstClockIn: string | null;   // ISO — earliest inDate today
  lastClockOut: string | null;   // ISO — latest outDate today (null if all open)
  fetchedAt: string;
};

export type PeriodMetaFields = { period?: Period; period_start?: string; period_end?: string; has_data?: boolean; days_closed?: number; days_missing?: number };

export type LaborDetailResult = PeriodMetaFields & {
  payrollTax?: number;
  laborCost?: number;
  totalSales?: number;
  totalTips?: number;
  laborEstimated?: boolean;
  openShifts?: number;
  byDay?: { date: string; labor: number; sales: number; complete: boolean; live: boolean }[];
  hourlyCost: number;
  hourlyHours: number;
  salaryCost: number;
  salaryHours: number;
  fohCost: number;
  bohCost: number;
  unknownCost: number;
  hasOT: boolean;
  employeeCount: number;
  projectedEOD: number | null;
  jobsResolved: boolean;
  fetchedAt: string;
};

export type PmixItem = {
  name: string;
  revenue: number;
  qty: number;
};

export type SalesChannels = {
  dinein: number;
  takeout: number;
  doordash: number;
  ubereats: number;
  grubhub: number;
  other3p: number;
};

export type HourlySales = {
  hour: number;        // 0–23, local (America/New_York)
  sales: number;       // net sales that hour (USD)
  orderCount: number;  // distinct orders opened that hour
};

export type SalesDetailResult = PeriodMetaFields & {
  pmixDate?: string | null;
  pmixRange?: { from: string; to: string; days: number } | null;
  byDay?: { date: string; sales: number; complete: boolean; live: boolean }[];
  totals?: { sales: number; tips: number; covers: number };
  pmixAll: PmixItem[];      // every item sold today, sorted by revenue desc
  pmixTop: PmixItem[];      // first 5 of pmixAll (legacy convenience)
  pmixBottom: PmixItem[];   // last 3 of pmixAll, reversed (legacy convenience)
  channels: SalesChannels;
  byHour: HourlySales[]; // inclusive first→last hour with sales (gaps filled with zero)
  fetchedAt: string;
};

export async function fetchTodaySales(): Promise<SalesResult | null> {
  try {
    const res = await ownerFetch("/api/toast-sales", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as SalesResult;
  } catch {
    return null;
  }
}

export async function fetchTodayLabor(): Promise<LaborResult | null> {
  try {
    const res = await ownerFetch("/api/toast-labor", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as LaborResult;
  } catch {
    return null;
  }
}

export async function fetchLaborDetail(period: Period = "day"): Promise<LaborDetailResult | null> {
  try {
    const res = await ownerFetch(`/api/toast-labor-detail?period=${period}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as LaborDetailResult;
  } catch {
    return null;
  }
}

export type CategorySale = {
  name: string;
  revenue: number;
  revenuePct: number;
  cogsPct: number;
  cogsDollars: number;
};

export type COGSDetailResult = PeriodMetaFields & {
  categorySales: CategorySale[];
  totalRevenue: number;
  categoryCOGS: number;
  categoryCOGSPct: number;
  dineInSales: number;
  dineInPaper: number;
  takeoutDeliverySales: number;
  takeoutDeliveryPaper: number;
  totalPaper: number;
  doordashSales: number;
  ubereatsSales: number;
  grubhubSales: number;
  commissionBase: number;
  thirdPartyCommission: number;
  compCount: number;
  compValue: number;
  voidCount: number;
  voidValue: number;
  voidCost: number;
  effectiveCOGS: number;
  effectiveCOGSPct: number;
  fetchedAt: string;
};

export async function fetchCOGSDetail(period: Period = "day"): Promise<COGSDetailResult | null> {
  try {
    const res = await ownerFetch(`/api/toast-cogs-detail?period=${period}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as COGSDetailResult;
  } catch {
    return null;
  }
}

export async function fetchSalesDetail(period: Period = "day"): Promise<SalesDetailResult | null> {
  try {
    const res = await ownerFetch(`/api/toast-sales-detail?period=${period}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as SalesDetailResult;
  } catch {
    return null;
  }
}

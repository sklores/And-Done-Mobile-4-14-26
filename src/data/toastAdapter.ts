import { ownerRead } from "./ownerFetch";
import type { ReadResult } from "./ownerFetch";
import type { Period } from "../stores/useKpiStore";
// Client-side adapter: calls our own /api/toast-* endpoints.
// All Toast auth + secrets live server-side (api/_toast.mjs).
//
// Every read hands back a ReadResult: a failure says "error" and carries the
// message. It is never flattened to null, which the caller could only render
// as "still loading" or as nothing at all.

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

export function fetchTodaySales(): Promise<ReadResult<SalesResult>> {
  return ownerRead<SalesResult>("/api/toast-sales");
}

export function fetchTodayLabor(): Promise<ReadResult<LaborResult>> {
  return ownerRead<LaborResult>("/api/toast-labor");
}

export function fetchLaborDetail(period: Period = "day"): Promise<ReadResult<LaborDetailResult>> {
  return ownerRead<LaborDetailResult>(`/api/toast-labor-detail?period=${period}`);
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

export function fetchCOGSDetail(period: Period = "day"): Promise<ReadResult<COGSDetailResult>> {
  return ownerRead<COGSDetailResult>(`/api/toast-cogs-detail?period=${period}`);
}

export function fetchSalesDetail(period: Period = "day"): Promise<ReadResult<SalesDetailResult>> {
  return ownerRead<SalesDetailResult>(`/api/toast-sales-detail?period=${period}`);
}

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

export type LaborDetailResult = {
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

export type SalesDetailResult = {
  pmixTop: PmixItem[];
  pmixBottom: PmixItem[];
  channels: SalesChannels;
  fetchedAt: string;
};

export async function fetchTodaySales(): Promise<SalesResult | null> {
  try {
    const res = await fetch("/api/toast-sales", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as SalesResult;
  } catch {
    return null;
  }
}

export async function fetchTodayLabor(): Promise<LaborResult | null> {
  try {
    const res = await fetch("/api/toast-labor", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as LaborResult;
  } catch {
    return null;
  }
}

export async function fetchLaborDetail(): Promise<LaborDetailResult | null> {
  try {
    const res = await fetch("/api/toast-labor-detail", { cache: "no-store" });
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

export type COGSDetailResult = {
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

export async function fetchCOGSDetail(): Promise<COGSDetailResult | null> {
  try {
    const res = await fetch("/api/toast-cogs-detail", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as COGSDetailResult;
  } catch {
    return null;
  }
}

export async function fetchSalesDetail(): Promise<SalesDetailResult | null> {
  try {
    const res = await fetch("/api/toast-sales-detail", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as SalesDetailResult;
  } catch {
    return null;
  }
}

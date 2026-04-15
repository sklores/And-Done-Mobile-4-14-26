// Client-side adapter: calls our own /api/toast-sales and /api/toast-labor endpoints.
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

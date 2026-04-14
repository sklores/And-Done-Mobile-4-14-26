// Client-side adapter: calls our own /api/toast-sales endpoint.
// All Toast auth + secrets live server-side (api/_toast.ts).

export type SalesResult = {
  total: number;
  checkCount: number;
  orderCount: number;
  businessDate: string;
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

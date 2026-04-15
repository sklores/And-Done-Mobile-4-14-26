export type ToastCreds = {
  clientId: string;
  clientSecret: string;
  guid: string;
};

export type SalesResult = {
  total: number;
  checkCount: number;
  orderCount: number;
  businessDate: string;
  fetchedAt: string;
};

export type LaborResult = {
  totalLaborCost: number;
  totalHours: number;
  employeeCount: number;
  fetchedAt: string;
};

export function todayBusinessDate(d?: Date): string;
export function getTodaySales(creds: ToastCreds): Promise<SalesResult>;
export function getTodayLabor(creds: ToastCreds): Promise<LaborResult>;
export function credsFromEnv(
  env: Record<string, string | undefined>,
): ToastCreds;

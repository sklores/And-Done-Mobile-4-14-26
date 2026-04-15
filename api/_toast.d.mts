export type ToastCreds = {
  clientId: string;
  clientSecret: string;
  guid: string;
};

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

export function todayBusinessDate(d?: Date): string;
export function getTodaySales(creds: ToastCreds): Promise<SalesResult>;
export function getTodayLabor(creds: ToastCreds): Promise<LaborResult>;
export function getTodayLaborDetail(creds: ToastCreds): Promise<LaborDetailResult>;
export function getTodaySalesDetail(creds: ToastCreds): Promise<SalesDetailResult>;
export function credsFromEnv(
  env: Record<string, string | undefined>,
): ToastCreds;

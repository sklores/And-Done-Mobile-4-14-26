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

export function getTodayLaborDetail(creds: ToastCreds): Promise<LaborDetailResult>;
export function getTodaySalesDetail(creds: ToastCreds): Promise<SalesDetailResult>;
export function getTodayCOGSDetail(creds: ToastCreds): Promise<COGSDetailResult>;
export function credsFromEnv(
  env: Record<string, string | undefined>,
): ToastCreds;

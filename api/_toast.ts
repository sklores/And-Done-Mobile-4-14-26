// Shared Toast API helper — runs server-side only.
// Used by both the Vercel function (api/toast-sales.ts) and the
// Vite dev middleware (vite.config.ts).

const AUTH_URL =
  "https://ws-api.toasttab.com/authentication/v1/authentication/login";
const BASE = "https://ws-api.toasttab.com";

export type ToastCreds = {
  clientId: string;
  clientSecret: string;
  guid: string;
};

type Cached = { token: string; expiresAt: number };
let cachedToken: Cached | null = null;

export function todayBusinessDate(d = new Date()): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

async function getToken(creds: ToastCreds): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      userAccessType: "TOAST_MACHINE_CLIENT",
    }),
  });
  if (!res.ok) throw new Error(`toast auth ${res.status}`);
  const body = (await res.json()) as {
    token?: { accessToken?: string; expiresIn?: number };
  };
  const token = body.token?.accessToken;
  const expiresIn = body.token?.expiresIn ?? 86400;
  if (!token) throw new Error("toast auth: no token in response");
  cachedToken = { token, expiresAt: Date.now() + expiresIn * 1000 };
  return token;
}

export type SalesResult = {
  total: number;
  checkCount: number;
  orderCount: number;
  businessDate: string;
  fetchedAt: string;
};

export async function getTodaySales(creds: ToastCreds): Promise<SalesResult> {
  const token = await getToken(creds);
  const businessDate = todayBusinessDate();
  const url = `${BASE}/orders/v2/ordersBulk?businessDate=${businessDate}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Toast-Restaurant-External-ID": creds.guid,
    },
  });
  if (!res.ok) throw new Error(`toast orders ${res.status}`);
  const orders = (await res.json()) as Array<{
    checks?: Array<{ voided?: boolean; amount?: number }>;
  }>;

  // Sum `check.amount` — net sales, pre-tax, pre-tip. Matches POS "Sales".
  // (totalAmount includes tax; payments include tip — neither is what POS shows.)
  let total = 0;
  let checkCount = 0;
  let orderCount = 0;
  if (Array.isArray(orders)) {
    orderCount = orders.length;
    for (const o of orders) {
      for (const c of o.checks ?? []) {
        if (c.voided) continue;
        if (typeof c.amount === "number") {
          total += c.amount;
          checkCount++;
        }
      }
    }
  }
  return {
    total,
    checkCount,
    orderCount,
    businessDate,
    fetchedAt: new Date().toISOString(),
  };
}

export function credsFromEnv(
  env: Record<string, string | undefined>,
): ToastCreds {
  const clientId = env.TOAST_CLIENT_ID;
  const clientSecret = env.TOAST_CLIENT_SECRET;
  const guid = env.TOAST_RESTAURANT_GUID;
  if (!clientId || !clientSecret || !guid) {
    throw new Error(
      "missing TOAST_CLIENT_ID / TOAST_CLIENT_SECRET / TOAST_RESTAURANT_GUID",
    );
  }
  return { clientId, clientSecret, guid };
}

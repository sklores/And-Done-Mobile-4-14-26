// Toast API adapter — feeds Sales tile live.
// Credentials provided via EXPO_PUBLIC_* env (copied from toast-discovery/.env).
// NOTE: these are client-exposed by design for internal R&D.

const CLIENT_ID = import.meta.env.VITE_TOAST_CLIENT_ID as string | undefined;
const CLIENT_SECRET = import.meta.env.VITE_TOAST_CLIENT_SECRET as string | undefined;
const RESTAURANT_GUID = import.meta.env.VITE_TOAST_RESTAURANT_GUID as string | undefined;

const AUTH_URL = "https://ws-api.toasttab.com/authentication/v1/authentication/login";
const BASE = "https://ws-api.toasttab.com";

let cachedToken: { token: string; expiresAt: number } | null = null;

function todayBusinessDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

async function getToken(): Promise<string | null> {
  if (!CLIENT_ID || !CLIENT_SECRET) return null;
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      userAccessType: "TOAST_MACHINE_CLIENT",
    }),
  });
  if (!res.ok) return null;
  const body = await res.json();
  const token = body.token?.accessToken;
  const expiresIn = body.token?.expiresIn || 86400;
  if (!token) return null;
  cachedToken = { token, expiresAt: Date.now() + expiresIn * 1000 };
  return token;
}

/** Returns total sales in dollars for today's business date, or null if unavailable. */
export async function fetchTodaySales(): Promise<number | null> {
  if (!RESTAURANT_GUID) return null;
  const token = await getToken();
  if (!token) return null;

  const url = `${BASE}/orders/v2/ordersBulk?businessDate=${todayBusinessDate()}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Toast-Restaurant-External-ID": RESTAURANT_GUID,
    },
  });
  if (!res.ok) return null;
  const orders = await res.json();
  if (!Array.isArray(orders)) return null;

  let total = 0;
  for (const o of orders) {
    for (const c of o.checks || []) {
      if (c.voided) continue;
      if (typeof c.totalAmount === "number") total += c.totalAmount;
    }
  }
  return total;
}

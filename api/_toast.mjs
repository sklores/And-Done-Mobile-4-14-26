// Shared Toast API helper — server-side only.
// Used by both the Vercel function (api/toast-sales.mjs) and the
// Vite dev middleware (vite.config.ts).

const AUTH_URL =
  "https://ws-api.toasttab.com/authentication/v1/authentication/login";
const BASE = "https://ws-api.toasttab.com";

let cachedToken = null;

export function todayBusinessDate(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

async function getToken(creds) {
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
  const body = await res.json();
  const token = body?.token?.accessToken;
  const expiresIn = body?.token?.expiresIn ?? 86400;
  if (!token) throw new Error("toast auth: no token in response");
  cachedToken = { token, expiresAt: Date.now() + expiresIn * 1000 };
  return token;
}

export async function getTodaySales(creds) {
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
  const orders = await res.json();

  // Sum `check.amount` — net sales, pre-tax, pre-tip. Matches POS "Sales".
  let total = 0;
  let checkCount = 0;
  let orderCount = 0;
  let totalTips = 0;
  if (Array.isArray(orders)) {
    orderCount = orders.length;
    for (const o of orders) {
      for (const c of o.checks ?? []) {
        if (c.voided) continue;
        if (typeof c.amount === "number") {
          total += c.amount;
          checkCount++;
        }
        for (const p of c.payments ?? []) {
          if (typeof p.tipAmount === "number") totalTips += p.tipAmount;
        }
      }
    }
  }
  return {
    total,
    totalTips: Math.round(totalTips * 100) / 100,
    checkCount,
    orderCount,
    businessDate,
    fetchedAt: new Date().toISOString(),
  };
}

export async function getTodayLabor(creds) {
  const token = await getToken(creds);

  // Toast labor API — time entries for today
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const startISO = startOfDay.toISOString();
  const endISO = now.toISOString();

  const url = `${BASE}/labor/v1/timeEntries?startDate=${encodeURIComponent(startISO)}&endDate=${encodeURIComponent(endISO)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Toast-Restaurant-External-ID": creds.guid,
    },
  });

  if (!res.ok) throw new Error(`toast labor ${res.status}`);
  const entries = await res.json();

  // Toast only populates regularHours/regularPay AFTER clock-out.
  // For open shifts (outDate === null), accrue cost from inDate → now
  // using the employee's hourlyWage so the tile reflects live labor burn.
  const nowMs = Date.now();
  let closedCost = 0;
  let closedHours = 0;
  let openCost = 0;
  let openHours = 0;
  let openCount = 0;
  const employeeSet = new Set();

  if (Array.isArray(entries)) {
    for (const e of entries) {
      if (e.employeeReference?.guid) employeeSet.add(e.employeeReference.guid);

      if (e.outDate) {
        closedCost +=
          (typeof e.regularPay === "number" ? e.regularPay : 0) +
          (typeof e.overtimePay === "number" ? e.overtimePay : 0);
        closedHours +=
          (typeof e.regularHours === "number" ? e.regularHours : 0) +
          (typeof e.overtimeHours === "number" ? e.overtimeHours : 0);
      } else if (e.inDate && typeof e.hourlyWage === "number") {
        const inMs = new Date(e.inDate).getTime();
        const hoursSoFar = Math.max(0, (nowMs - inMs) / 3_600_000);
        openHours += hoursSoFar;
        openCost += hoursSoFar * e.hourlyWage;
        openCount++;
      }
    }
  }

  const totalLaborCost = closedCost + openCost;
  const totalHours = closedHours + openHours;

  return {
    totalLaborCost: Math.round(totalLaborCost * 100) / 100,
    totalHours: Math.round(totalHours * 100) / 100,
    closedCost: Math.round(closedCost * 100) / 100,
    openCost: Math.round(openCost * 100) / 100,
    employeeCount: employeeSet.size,
    openCount,
    fetchedAt: new Date().toISOString(),
  };
}

export function credsFromEnv(env) {
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

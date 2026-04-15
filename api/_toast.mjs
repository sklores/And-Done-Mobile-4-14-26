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

// ── Dining-option GUID classification ────────────────────────────────────────
const DOORDASH_GUIDS  = new Set(["55c97b64","65a97c5d","9d9ef51a","e7ca53b4"]);
const GRUBHUB_GUIDS   = new Set(["5b7c2e6f","6b1533d5"]);
const UBEREATS_GUIDS  = new Set(["8314427f","9ca6a892","d02668c9","af84c0e7"]);
const CHOWNOW_GUIDS   = new Set(["88310bd0"]);
const TOAST_DEL_GUIDS = new Set(["d6613ebf"]);
const DINEIN_GUIDS    = new Set(["08bc3079","b774f8de"]);
// everything else = takeout (counter / phone / online direct)

function classifyDiningOption(guid) {
  if (!guid) return "takeout";
  const short = guid.substring(0, 8);
  if (DOORDASH_GUIDS.has(short))  return "doordash";
  if (GRUBHUB_GUIDS.has(short))   return "grubhub";
  if (UBEREATS_GUIDS.has(short))  return "ubereats";
  if (CHOWNOW_GUIDS.has(short))   return "other3p";
  if (TOAST_DEL_GUIDS.has(short)) return "other3p";
  if (DINEIN_GUIDS.has(short))    return "dinein";
  return "takeout";
}

export async function getTodaySalesDetail(creds) {
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

  // Product mix: aggregate top-level menu items (salesCategory != null) by revenue
  const itemMap = new Map(); // displayName → { revenue, qty }

  // Channel breakdown
  const channels = { dinein: 0, takeout: 0, doordash: 0, ubereats: 0, grubhub: 0, other3p: 0 };

  if (Array.isArray(orders)) {
    for (const o of orders) {
      const channel = classifyDiningOption(o.diningOption?.guid);

      for (const c of o.checks ?? []) {
        if (c.voided) continue;
        // Channel: attribute net sales from check.amount to this order's channel
        if (typeof c.amount === "number") {
          channels[channel] = (channels[channel] ?? 0) + c.amount;
        }
        // Product mix: iterate top-level selections (not modifiers)
        for (const sel of c.selections ?? []) {
          if (sel.voided) continue;
          // Modifiers have null salesCategory; skip them
          if (!sel.salesCategory) continue;
          const name = sel.displayName ?? sel.name ?? "Unknown";
          const revenue = typeof sel.receiptLinePrice === "number"
            ? sel.receiptLinePrice
            : (typeof sel.price === "number" ? sel.price * (sel.quantity ?? 1) : 0);
          const qty = sel.quantity ?? 1;
          const existing = itemMap.get(name);
          if (existing) {
            existing.revenue += revenue;
            existing.qty += qty;
          } else {
            itemMap.set(name, { name, revenue, qty });
          }
        }
      }
    }
  }

  // Sort by revenue desc, take top 5 and bottom 5 (min 2 items to show bottom)
  const allItems = Array.from(itemMap.values()).sort((a, b) => b.revenue - a.revenue);
  const top = allItems.slice(0, 5).map((i) => ({
    name: i.name,
    revenue: Math.round(i.revenue * 100) / 100,
    qty: i.qty,
  }));
  const bottom = allItems.length >= 4
    ? allItems.slice(-3).reverse().map((i) => ({
        name: i.name,
        revenue: Math.round(i.revenue * 100) / 100,
        qty: i.qty,
      }))
    : [];

  // Round channel values
  for (const k of Object.keys(channels)) {
    channels[k] = Math.round(channels[k] * 100) / 100;
  }

  return {
    pmixTop: top,
    pmixBottom: bottom,
    channels,
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

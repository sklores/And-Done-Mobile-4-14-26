// Shared Toast API helper — server-side only.
// Used by both the Vercel function (api/toast-sales.mjs) and the
// Vite dev middleware (vite.config.ts).

const AUTH_URL =
  "https://ws-api.toasttab.com/authentication/v1/authentication/login";
const BASE = "https://ws-api.toasttab.com";

let cachedToken = null;

// All date math uses America/New_York so Vercel (UTC) doesn't roll the
// business date over at 8 PM Eastern during summer (EDT = UTC-4).

function easternDateStr(d = new Date()) {
  // en-CA locale gives "YYYY-MM-DD" — cleanest format for further use
  return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/** Returns the ET offset string (e.g. "-04:00" for EDT, "-05:00" for EST). */
function easternOffsetStr(d = new Date()) {
  // Check what hour noon-UTC falls on in ET — gives us the offset reliably
  const dateStr = easternDateStr(d);
  const noonUTC  = new Date(`${dateStr}T12:00:00Z`);
  const etHour   = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", hour: "numeric", hour12: false,
    }).format(noonUTC),
    10,
  );
  const offset = etHour - 12; // EDT → 8-12 = -4, EST → 7-12 = -5
  return `${offset < 0 ? "-" : "+"}${String(Math.abs(offset)).padStart(2, "0")}:00`;
}

/** Midnight Eastern tonight as a UTC Date object. */
function easternStartOfDay(d = new Date()) {
  const dateStr  = easternDateStr(d);
  const offsetStr = easternOffsetStr(d);
  return new Date(`${dateStr}T00:00:00${offsetStr}`);
}

export function todayBusinessDate(d = new Date()) {
  // YYYYMMDD in Eastern Time
  return easternDateStr(d).replace(/-/g, "");
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

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    "Toast-Restaurant-External-ID": creds.guid,
  };

  // ── Fetch employee wage rates (best-effort) so open shifts can accrue cost.
  // Toast's timeEntries response often omits hourlyWage for clocked-in employees,
  // so we build our own guid → wage map from the employees endpoint.
  const employeeWages = new Map(); // employeeGuid → hourly wage (number)
  try {
    const empRes = await fetch(`${BASE}/labor/v1/employees`, { headers: authHeaders });
    if (empRes.ok) {
      const employees = await empRes.json();
      if (Array.isArray(employees)) {
        for (const emp of employees) {
          if (!emp.guid) continue;
          // wageOverrides is an array of per-job wage objects { jobReference, wage }
          if (Array.isArray(emp.wageOverrides) && emp.wageOverrides.length > 0) {
            const wages = emp.wageOverrides
              .map((w) => (typeof w.wage === "number" ? w.wage : parseFloat(w.wage ?? "0")))
              .filter((w) => w > 0);
            if (wages.length > 0) employeeWages.set(emp.guid, Math.max(...wages));
          } else if (typeof emp.hourlyWage === "number" && emp.hourlyWage > 0) {
            employeeWages.set(emp.guid, emp.hourlyWage);
          }
        }
      }
    }
  } catch (_) {
    // employees endpoint unavailable — open-shift wages will fall back to
    // the hourlyWage field on the time entry (if present)
  }

  // ── Toast labor API — time entries for today (Eastern Time) ─────────────
  const now = new Date();
  const startISO = easternStartOfDay(now).toISOString();
  const endISO   = now.toISOString();

  const url = `${BASE}/labor/v1/timeEntries?startDate=${encodeURIComponent(startISO)}&endDate=${encodeURIComponent(endISO)}`;
  const res = await fetch(url, { headers: authHeaders });

  if (!res.ok) throw new Error(`toast labor ${res.status}`);
  const entries = await res.json();

  // Toast only populates regularHours/regularPay AFTER clock-out.
  // For open shifts (outDate === null), accrue cost from inDate → now.
  // Wage priority: time-entry hourlyWage → employees map → 0
  const nowMs = Date.now();
  let closedCost = 0;
  let closedHours = 0;
  let openCost = 0;
  let openHours = 0;
  let openCount = 0;
  const employeeSet = new Set();
  let firstClockInMs = Infinity;
  let lastClockOutMs = -Infinity;

  /** Parse a wage value that might be number, numeric string, or missing */
  const parseWage = (raw) =>
    typeof raw === "number" && raw > 0 ? raw
    : typeof raw === "string" && parseFloat(raw) > 0 ? parseFloat(raw)
    : 0;

  if (Array.isArray(entries)) {
    for (const e of entries) {
      const empGuid = e.employeeReference?.guid;
      if (empGuid) employeeSet.add(empGuid);

      // Track day span
      if (e.inDate) {
        const inMs = new Date(e.inDate).getTime();
        if (inMs < firstClockInMs) firstClockInMs = inMs;
      }
      if (e.outDate) {
        const outMs = new Date(e.outDate).getTime();
        if (outMs > lastClockOutMs) lastClockOutMs = outMs;
      }

      if (e.outDate) {
        const hours = (e.regularHours ?? 0) + (e.overtimeHours ?? 0);
        closedHours += hours;
        // Toast often leaves regularPay null even after clock-out.
        // Fall back to hours × wage when pay is missing.
        if (typeof e.regularPay === "number" || typeof e.overtimePay === "number") {
          closedCost += (e.regularPay ?? 0) + (e.overtimePay ?? 0);
        } else {
          const wage = parseWage(e.hourlyWage) || (empGuid ? (employeeWages.get(empGuid) ?? 0) : 0);
          closedCost += hours * wage;
        }
      } else if (e.inDate) {
        // Resolve wage: prefer the entry's own hourlyWage, then the employees map
        const wage = parseWage(e.hourlyWage) || (empGuid ? (employeeWages.get(empGuid) ?? 0) : 0);
        if (wage > 0) {
          const hoursSoFar = Math.max(0, (nowMs - new Date(e.inDate).getTime()) / 3_600_000);
          openHours += hoursSoFar;
          openCost += hoursSoFar * wage;
          openCount++;
        }
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
    firstClockIn: firstClockInMs < Infinity ? new Date(firstClockInMs).toISOString() : null,
    lastClockOut: lastClockOutMs > -Infinity ? new Date(lastClockOutMs).toISOString() : null,
    fetchedAt: new Date().toISOString(),
  };
}

// ── Labor detail (hourly/salary split, FOH/BOH, OT, EOD projection) ──────────
const FOH_KEYWORDS = /server|host(ess)?|bartend|cashier|expo|runner|barista|front|service|counter/i;
const BOH_KEYWORDS = /cook|kitchen|prep|dish|chef|line|back|grill|fry|saute|sauté|boh/i;

export async function getTodayLaborDetail(creds) {
  const token = await getToken(creds);

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    "Toast-Restaurant-External-ID": creds.guid,
  };

  // ── Fetch job definitions (FOH/BOH classification) and employee wages in parallel
  let jobMap = new Map(); // guid → { title, isFOH }
  const employeeWages = new Map(); // employeeGuid → hourly wage

  await Promise.allSettled([
    // Jobs — for FOH/BOH split
    fetch(`${BASE}/labor/v1/jobs`, { headers: authHeaders }).then(async (r) => {
      if (!r.ok) return;
      const jobs = await r.json();
      if (Array.isArray(jobs)) {
        for (const j of jobs) {
          const title = j.title ?? "";
          const isFOH = FOH_KEYWORDS.test(title) && !BOH_KEYWORDS.test(title);
          jobMap.set(j.guid, { title, isFOH });
        }
      }
    }),
    // Employees — for open-shift wage lookup
    fetch(`${BASE}/labor/v1/employees`, { headers: authHeaders }).then(async (r) => {
      if (!r.ok) return;
      const employees = await r.json();
      if (Array.isArray(employees)) {
        for (const emp of employees) {
          if (!emp.guid) continue;
          if (Array.isArray(emp.wageOverrides) && emp.wageOverrides.length > 0) {
            const wages = emp.wageOverrides
              .map((w) => (typeof w.wage === "number" ? w.wage : parseFloat(w.wage ?? "0")))
              .filter((w) => w > 0);
            if (wages.length > 0) employeeWages.set(emp.guid, Math.max(...wages));
          } else if (typeof emp.hourlyWage === "number" && emp.hourlyWage > 0) {
            employeeWages.set(emp.guid, emp.hourlyWage);
          }
        }
      }
    }),
  ]);

  // ── Fetch today's time entries (Eastern Time) ────────────────────────────
  const now = new Date();
  const url = `${BASE}/labor/v1/timeEntries?startDate=${encodeURIComponent(easternStartOfDay(now).toISOString())}&endDate=${encodeURIComponent(now.toISOString())}`;
  const res = await fetch(url, { headers: authHeaders });
  if (!res.ok) throw new Error(`toast labor ${res.status}`);
  const entries = await res.json();

  const nowMs = Date.now();
  let hourlyCost = 0, hourlyHours = 0;
  let salaryCost = 0, salaryHours = 0;
  let fohCost = 0, bohCost = 0, unknownCost = 0;
  let hasOT = false;
  const employeeSet = new Set();

  const parseWage = (raw) =>
    typeof raw === "number" && raw > 0 ? raw
    : typeof raw === "string" && parseFloat(raw) > 0 ? parseFloat(raw)
    : 0;

  if (Array.isArray(entries)) {
    for (const e of entries) {
      const empGuid = e.employeeReference?.guid;
      if (empGuid) employeeSet.add(empGuid);

      // Resolve wage: entry field → employees map → 0
      const wage = parseWage(e.hourlyWage) || (empGuid ? (employeeWages.get(empGuid) ?? 0) : 0);
      const isSalaried = wage === 0; // treat no-wage entries as salaried placeholder
      const jobGuid = e.jobReference?.guid;
      const job = jobMap.get(jobGuid);

      let entryCost = 0, entryHours = 0;

      if (e.outDate) {
        entryHours = (e.regularHours ?? 0) + (e.overtimeHours ?? 0);
        // Fall back to hours × wage if Toast left regularPay null
        if (typeof e.regularPay === "number" || typeof e.overtimePay === "number") {
          entryCost = (e.regularPay ?? 0) + (e.overtimePay ?? 0);
        } else {
          entryCost = entryHours * wage;
        }
        if ((e.overtimePay ?? 0) > 0 || (e.overtimeHours ?? 0) > 0) hasOT = true;
      } else if (e.inDate && wage > 0) {
        const hrs = Math.max(0, (nowMs - new Date(e.inDate).getTime()) / 3_600_000);
        entryCost = hrs * wage;
        entryHours = hrs;
      }

      if (isSalaried) { salaryCost += entryCost; salaryHours += entryHours; }
      else             { hourlyCost += entryCost; hourlyHours += entryHours; }

      if (!job)             unknownCost += entryCost;
      else if (job.isFOH)   fohCost += entryCost;
      else                  bohCost += entryCost;
    }
  }

  // EOD projection — extrapolate from burn rate since open
  // Assumes 11 AM open, 10 PM close (configurable later)
  const OPEN_HOUR = 11, CLOSE_HOUR = 22;
  const nowHour = now.getHours() + now.getMinutes() / 60;
  const totalLaborCost = hourlyCost + salaryCost;
  let projectedEOD = null;
  if (nowHour >= OPEN_HOUR && nowHour < CLOSE_HOUR && totalLaborCost > 0) {
    const elapsed   = Math.max(0.5, nowHour - OPEN_HOUR);
    const remaining = CLOSE_HOUR - nowHour;
    projectedEOD = totalLaborCost + (totalLaborCost / elapsed) * remaining;
  }

  const round2 = (n) => Math.round(n * 100) / 100;

  return {
    hourlyCost:   round2(hourlyCost),
    hourlyHours:  round2(hourlyHours),
    salaryCost:   round2(salaryCost),
    salaryHours:  round2(salaryHours),
    fohCost:      round2(fohCost),
    bohCost:      round2(bohCost),
    unknownCost:  round2(unknownCost),
    hasOT,
    employeeCount: employeeSet.size,
    projectedEOD: projectedEOD ? round2(projectedEOD) : null,
    jobsResolved: jobMap.size > 0,
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

// ── COGS detail (category sales, paper, 3P commission, comps, voids) ─────────
// COGS % by group — Food 26%, Beverage 20%, Alcohol 22%
const CATEGORY_COGS_PCT = {
  // Food — 26%
  'Food': 26, 'Sandwiches': 26, 'Grilled Cheese': 26, 'Soups': 26,
  'Sides': 26, 'Appetizers': 26, 'Appetizer': 26, 'Kids': 26,
  'Dessert': 26, 'Desserts': 26,
  // Beverage (non-alcoholic) — 20%
  'NA Beverage': 20, 'Non-Alcoholic': 20, 'Soft Drinks': 20, 'Soda': 20,
  'Coffee': 20, 'Tea': 20, 'Juice': 20, 'Beverages': 20, 'Beverage': 20,
  // Alcohol — 22%
  'Beer': 22, 'Draft Beer': 22, 'Bottle Beer': 22, 'Bottled Beer': 22,
  'Wine': 22, 'Bottle Wine': 22, 'Wines': 22,
  'Cocktails': 22, 'Cocktail': 22, 'Spirits': 22, 'Liquor': 22, 'Bar': 22,
  // Other
  'Merchandise': 40, 'Retail': 40,
};
const DEFAULT_COGS_PCT = 26; // default to food rate
const PAPER_DINEIN_PCT      = 0.01;  // 1%
const PAPER_TAKEOUT_PCT     = 0.04;  // 4% (takeout + delivery)
const THIRD_PARTY_COMM_PCT  = 0.18;  // 18%

export async function getTodayCOGSDetail(creds) {
  const token = await getToken(creds);
  const businessDate = todayBusinessDate();
  const url = `${BASE}/orders/v2/ordersBulk?businessDate=${businessDate}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Toast-Restaurant-External-ID': creds.guid,
    },
  });
  if (!res.ok) throw new Error(`toast orders ${res.status}`);
  const orders = await res.json();

  const categoryMap = new Map(); // catName → revenue
  let totalRevenue = 0;
  let dineInSales = 0, takeoutSales = 0;
  let doordashSales = 0, ubereatsSales = 0, grubhubSales = 0, other3pSales = 0;
  let compCount = 0, compValue = 0;
  let voidCount = 0, voidValue = 0;

  if (Array.isArray(orders)) {
    for (const o of orders) {
      const channel = classifyDiningOption(o.diningOption?.guid);

      for (const c of o.checks ?? []) {
        if (c.voided) continue;
        const checkAmt = typeof c.amount === 'number' ? c.amount : 0;
        totalRevenue += checkAmt;

        if      (channel === 'dinein')   dineInSales   += checkAmt;
        else if (channel === 'takeout')  takeoutSales  += checkAmt;
        else if (channel === 'doordash') doordashSales += checkAmt;
        else if (channel === 'ubereats') ubereatsSales += checkAmt;
        else if (channel === 'grubhub')  grubhubSales  += checkAmt;
        else if (channel === 'other3p')  other3pSales  += checkAmt;
        else                             takeoutSales  += checkAmt;

        // Comps — all applied discounts across check and selections
        for (const d of c.appliedDiscounts ?? []) {
          const amt = typeof d.discountAmount === 'number' ? d.discountAmount : 0;
          if (amt > 0) { compValue += amt; compCount++; }
        }
        for (const sel of c.selections ?? []) {
          for (const d of sel.appliedDiscounts ?? []) {
            const amt = typeof d.discountAmount === 'number' ? d.discountAmount : 0;
            if (amt > 0) { compValue += amt; compCount++; }
          }
        }

        // Selections — category revenue + voids
        for (const sel of c.selections ?? []) {
          if (sel.voided) {
            const v = typeof sel.price === 'number' ? sel.price * (sel.quantity ?? 1) : 0;
            if (v > 0) { voidValue += v; voidCount++; }
            continue;
          }
          if (!sel.salesCategory) continue; // skip modifiers
          const catName = (typeof sel.salesCategory === 'object'
            ? sel.salesCategory.name
            : sel.salesCategory) ?? 'Other';
          const rev = typeof sel.receiptLinePrice === 'number'
            ? sel.receiptLinePrice
            : (typeof sel.price === 'number' ? sel.price * (sel.quantity ?? 1) : 0);
          if (rev > 0) {
            const existing = categoryMap.get(catName);
            if (existing) existing.revenue += rev;
            else categoryMap.set(catName, { revenue: rev });
          }
        }
      }
    }
  }

  // Debug: log what category names Toast actually returned
  console.log("[COGS] category names from Toast:", Array.from(categoryMap.keys()));

  // Build category breakdown with per-category COGS estimate
  let categoryCOGS = 0;
  const categorySales = Array.from(categoryMap.entries())
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .map(([name, data]) => {
      const cogsPct = CATEGORY_COGS_PCT[name] ?? DEFAULT_COGS_PCT;
      const cogsDollars = data.revenue * (cogsPct / 100);
      categoryCOGS += cogsDollars;
      return {
        name,
        revenue: Math.round(data.revenue * 100) / 100,
        revenuePct: totalRevenue > 0 ? Math.round((data.revenue / totalRevenue) * 1000) / 10 : 0,
        cogsPct,
        cogsDollars: Math.round(cogsDollars * 100) / 100,
      };
    });

  // Paper costs — 1% dine-in, 4% takeout + all delivery
  const thirdPartySales      = doordashSales + ubereatsSales + grubhubSales + other3pSales;
  const takeoutDeliverySales = takeoutSales + thirdPartySales;
  const dineInPaper          = dineInSales * PAPER_DINEIN_PCT;
  const takeoutDeliveryPaper = takeoutDeliverySales * PAPER_TAKEOUT_PCT;
  const totalPaper           = dineInPaper + takeoutDeliveryPaper;

  // 3rd party commission — 18% on DoorDash + Uber Eats + Grubhub only
  const commissionBase       = doordashSales + ubereatsSales + grubhubSales;
  const thirdPartyCommission = commissionBase * THIRD_PARTY_COMM_PCT;

  // Effective COGS = category COGS + paper + 3P commission + comps + void cost
  // Void cost estimated at average COGS% (not retail) to avoid double-counting
  const avgCogsPct   = totalRevenue > 0 ? categoryCOGS / totalRevenue : DEFAULT_COGS_PCT / 100;
  const voidCost     = voidValue * avgCogsPct; // estimated cost, not retail value
  const effectiveCOGS = categoryCOGS + totalPaper + thirdPartyCommission + compValue + voidCost;

  const r2 = (n) => Math.round(n * 100) / 100;

  return {
    categorySales,
    _debugCategoryNames: Array.from(categoryMap.keys()), // temp: remove after debugging
    totalRevenue:       r2(totalRevenue),
    categoryCOGS:       r2(categoryCOGS),
    categoryCOGSPct:    totalRevenue > 0 ? r2((categoryCOGS / totalRevenue) * 100) : 0,

    dineInSales:         r2(dineInSales),
    dineInPaper:         r2(dineInPaper),
    takeoutDeliverySales: r2(takeoutDeliverySales),
    takeoutDeliveryPaper: r2(takeoutDeliveryPaper),
    totalPaper:           r2(totalPaper),

    doordashSales:       r2(doordashSales),
    ubereatsSales:       r2(ubereatsSales),
    grubhubSales:        r2(grubhubSales),
    commissionBase:      r2(commissionBase),
    thirdPartyCommission: r2(thirdPartyCommission),

    compCount,
    compValue:   r2(compValue),
    voidCount,
    voidValue:   r2(voidValue),
    voidCost:    r2(voidCost),

    effectiveCOGS:    r2(effectiveCOGS),
    effectiveCOGSPct: totalRevenue > 0 ? r2((effectiveCOGS / totalRevenue) * 100) : 0,

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

// backfill-toast-kpis — one-shot historical KPI backfill.
//
// Walks day-by-day backward from `end_date` (default: yesterday ET) for
// `days_back` days (default: 180), pulls Toast orders + labor for each
// business date, computes the same KPI shape as sync-toast-kpis, and
// inserts one end-of-day snapshot per day into kpi_snapshots.
//
// Idempotent-ish: before inserting a new row for a day, deletes any
// existing snapshots for the same business date in ET. So running the
// backfill twice just overwrites.
//
// Because edge function wall-clock limits can bite on long runs, we use
// EdgeRuntime.waitUntil so the HTTP response returns immediately while
// the loop runs in the background. Progress is visible in function logs.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const TOAST_AUTH_URL = "https://ws-api.toasttab.com/authentication/v1/authentication/login";
const TOAST_BASE = "https://ws-api.toasttab.com";

// GCDC-specific labor + COGS constants (mirror sync-toast-kpis)
const SALARIED_STAFF = [{ name: "Elsie Zavala", dailyRate: 200 }];
const DAILY_SALARY_COST = SALARIED_STAFF.reduce((s, e) => s + e.dailyRate, 0);
const PAYROLL_TAX_RATE = 0.11;

const COGS_FOOD_PCT = 26;
const COGS_BEV_PCT = 20;
const COGS_ALCOHOL_PCT = 22;
const PAPER_DINEIN_PCT = 0.01;
const PAPER_TAKEOUT_PCT = 0.04;
const THIRD_PARTY_COMM = 0.18;

// ── Date helpers ─────────────────────────────────────────────────────────────
function easternDateStr(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}
function easternOffsetStr(d: Date): string {
  const dateStr = easternDateStr(d);
  const noonUTC = new Date(`${dateStr}T12:00:00Z`);
  const etHour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", hour: "numeric", hour12: false,
    }).format(noonUTC), 10,
  );
  const offset = etHour - 12;
  return `${offset < 0 ? "-" : "+"}${String(Math.abs(offset)).padStart(2, "0")}:00`;
}
function businessDateToYYYYMMDD(d: string): string {
  return d.replace(/-/g, "");
}
function startOfDayET(dateStr: string): Date {
  // dateStr: YYYY-MM-DD. Compose the start-of-day in ET (DST-aware).
  const probe = new Date(`${dateStr}T12:00:00Z`);
  const offset = easternOffsetStr(probe);
  return new Date(`${dateStr}T00:00:00${offset}`);
}
function endOfDayET(dateStr: string): Date {
  const probe = new Date(`${dateStr}T12:00:00Z`);
  const offset = easternOffsetStr(probe);
  return new Date(`${dateStr}T23:59:59${offset}`);
}
function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return easternDateStr(d);
}
function yesterdayET(): string {
  const today = easternDateStr(new Date());
  return addDays(today, -1);
}

// ── Toast auth ───────────────────────────────────────────────────────────────
async function getToken(creds: { clientId: string; clientSecret: string }): Promise<string> {
  const res = await fetch(TOAST_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      userAccessType: "TOAST_MACHINE_CLIENT",
    }),
  });
  if (!res.ok) throw new Error(`Toast auth failed: ${res.status}`);
  const body = await res.json();
  const token = body?.token?.accessToken;
  if (!token) throw new Error("Toast auth: no token in response");
  return token;
}

function getGroupForItem(name: string): "Food" | "Beverage" | "Alcohol" {
  const n = name.toLowerCase();
  const isRootOrGinger = n.includes("root beer") || n.includes("ginger beer");
  if (!isRootOrGinger && (
    n.includes("ipa") || n.includes("hazy") || n.includes("pale ale") ||
    n.includes("stout") || n.includes("porter") || n.includes("lager") ||
    n.includes("pilsner") || n.includes("draft") || n.includes(" beer") ||
    n.startsWith("beer") ||
    n.includes("wine") || n.includes("rosé") || n.includes("rose") ||
    n.includes("cocktail") || n.includes("margarita") || n.includes("mojito") ||
    n.includes("whiskey") || n.includes("bourbon") || n.includes("vodka") ||
    n.includes("rum") || n.includes("gin") || n.includes("tequila") ||
    n.includes("mezcal") || n.includes("spirit") || n.includes("liquor") ||
    n.includes("hard seltzer") || n.includes("white claw") || n.includes("truly")
  )) return "Alcohol";
  if (
    n.includes("coke") || n.includes("cola") || n.includes("pepsi") ||
    n.includes("sprite") || n.includes("fanta") || n.includes("dr pepper") ||
    isRootOrGinger ||
    n.includes("water") || n.includes("pellegrino") || n.includes("la croix") ||
    n.includes("tea") || n.includes("lemonade") || n.includes("limeade") ||
    n.includes("juice") || n.includes("coffee") || n.includes("espresso") ||
    n.includes("latte") || n.includes("smoothie") || n.includes("soda") ||
    n.includes("sparkling") || n.includes("bottled water")
  ) return "Beverage";
  return "Food";
}

// ── Fetch + compute one day ──────────────────────────────────────────────────
async function backfillOneDay(
  supabase: SupabaseClient,
  authHeaders: Record<string, string>,
  orgId: string,
  dateStr: string, // YYYY-MM-DD
): Promise<{ sales: number; laborPct: number; cogsPct: number } | { error: string }> {
  try {
    const businessDate = businessDateToYYYYMMDD(dateStr);
    const dayStart = startOfDayET(dateStr).toISOString();
    const dayEnd = endOfDayET(dateStr).toISOString();

    // Orders (paginated)
    const PAGE_SIZE = 100;
    const MAX_PAGES = 30;
    const orders: unknown[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = `${TOAST_BASE}/orders/v2/ordersBulk?businessDate=${businessDate}&pageSize=${PAGE_SIZE}&page=${page}`;
      const r = await fetch(url, { headers: authHeaders });
      if (!r.ok) return { error: `orders ${dateStr} p${page}: ${r.status}` };
      const batch = await r.json();
      if (!Array.isArray(batch) || batch.length === 0) break;
      orders.push(...batch);
      if (batch.length < PAGE_SIZE) break;
    }

    // Labor
    const laborRes = await fetch(
      `${TOAST_BASE}/labor/v1/timeEntries?startDate=${encodeURIComponent(dayStart)}&endDate=${encodeURIComponent(dayEnd)}`,
      { headers: authHeaders },
    );
    if (!laborRes.ok) return { error: `labor ${dateStr}: ${laborRes.status}` };
    const entries = await laborRes.json();

    // ── Process orders ───────────────────────────────────────────────────
    let salesTotal = 0;
    let salesDoordash = 0, salesUbereats = 0, salesGrubhub = 0, salesOther3p = 0;
    let salesTips = 0, checkCount = 0;
    const groupRevenue = { Food: 0, Beverage: 0, Alcohol: 0 };
    let dineInSales = 0, takeoutSales = 0;
    let compValue = 0, voidValue = 0;

    for (const o of orders) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const order = o as any;
      for (const c of order.checks ?? []) {
        if (c.voided) continue;
        const checkAmt = typeof c.amount === "number" ? c.amount : 0;
        if (checkAmt <= 0) continue;
        salesTotal += checkAmt;
        checkCount++;

        for (const p of c.payments ?? []) {
          if (typeof p.tipAmount === "number") salesTips += p.tipAmount;
        }

        const src = (order.source ?? "").toString().toLowerCase();
        const dd = src.includes("doordash") || src.includes("door dash");
        const ub = src.includes("uber");
        const gh = src.includes("grubhub");
        const tp = dd || ub || gh || src.includes("delivery");
        if (dd) salesDoordash += checkAmt;
        else if (ub) salesUbereats += checkAmt;
        else if (gh) salesGrubhub += checkAmt;
        else if (tp) salesOther3p += checkAmt;

        const diningOption = (order.diningOption?.name ?? order.diningOption ?? "").toString().toLowerCase();
        const isDineIn = diningOption.includes("dine") || diningOption.includes("table") || diningOption === "";
        if (isDineIn && !tp) dineInSales += checkAmt;
        else takeoutSales += checkAmt;

        for (const d of c.appliedDiscounts ?? []) {
          const amt = typeof d.discountAmount === "number" ? d.discountAmount : 0;
          if (amt > 0) compValue += amt;
        }

        for (const sel of c.selections ?? []) {
          if (sel.voided) {
            const v = typeof sel.price === "number" ? sel.price * (sel.quantity ?? 1) : 0;
            if (v > 0) voidValue += v;
            continue;
          }
          const rev = typeof sel.receiptLinePrice === "number"
            ? sel.receiptLinePrice
            : (typeof sel.price === "number" ? sel.price * (sel.quantity ?? 1) : 0);
          if (rev <= 0) continue;

          const itemName =
            (typeof sel.salesCategory === "object" ? sel.salesCategory?.name : sel.salesCategory) ||
            sel.itemGroup?.name || sel.menuItem?.menuGroup?.name ||
            sel.displayName || sel.menuItem?.name || "Other";

          const group = getGroupForItem(itemName);
          groupRevenue[group] += rev;
        }
      }
    }

    const salesDelivery = salesDoordash + salesUbereats + salesGrubhub + salesOther3p;
    const takeoutDelivery = takeoutSales + salesDelivery;

    // COGS
    const cogsFood = groupRevenue.Food * (COGS_FOOD_PCT / 100);
    const cogsBev = groupRevenue.Beverage * (COGS_BEV_PCT / 100);
    const cogsAlcohol = groupRevenue.Alcohol * (COGS_ALCOHOL_PCT / 100);
    const categoryCOGS = cogsFood + cogsBev + cogsAlcohol;
    const dineInPaper = dineInSales * PAPER_DINEIN_PCT;
    const takeoutDeliveryPaper = takeoutDelivery * PAPER_TAKEOUT_PCT;
    const thirdPartyComm = (salesDoordash + salesUbereats + salesGrubhub) * THIRD_PARTY_COMM;
    const avgCogsPct = salesTotal > 0 ? categoryCOGS / salesTotal : 0.26;
    const voidCost = voidValue * avgCogsPct;
    const cogsTotal = categoryCOGS + dineInPaper + takeoutDeliveryPaper + thirdPartyComm + compValue + voidCost;
    const cogsPct = salesTotal > 0 ? (cogsTotal / salesTotal) * 100 : 0;

    // Labor — historical days are closed, so use reported pay/hours directly.
    let hourlyCost = 0, workedHours = 0;
    let anyClockIn = false;
    const parseWage = (raw: unknown) =>
      typeof raw === "number" && raw > 0 ? raw
      : typeof raw === "string" && parseFloat(raw) > 0 ? parseFloat(raw)
      : 0;

    if (Array.isArray(entries)) {
      for (const e of entries) {
        if (e.inDate) anyClockIn = true;
        const hours = (e.regularHours ?? 0) + (e.overtimeHours ?? 0);
        workedHours += hours;
        if (typeof e.regularPay === "number" || typeof e.overtimePay === "number") {
          hourlyCost += (e.regularPay ?? 0) + (e.overtimePay ?? 0);
        } else {
          hourlyCost += hours * parseWage(e.hourlyWage);
        }
      }
    }
    // Salary: if restaurant was open (any clock-in), count full daily salary.
    const salaryCost = anyClockIn ? DAILY_SALARY_COST : 0;
    const payrollTax = (hourlyCost + salaryCost) * PAYROLL_TAX_RATE;
    const laborTotal = hourlyCost + salaryCost + payrollTax;
    const laborPct = salesTotal > 0 ? (laborTotal / salesTotal) * 100 : 0;
    const primePct = cogsPct + laborPct;

    const netProfit = salesTotal - cogsTotal - laborTotal;
    const netProfitPct = salesTotal > 0 ? (netProfit / salesTotal) * 100 : 0;

    const r2 = (n: number) => Math.round(n * 100) / 100;
    const capturedAt = endOfDayET(dateStr).toISOString();

    // Wipe any prior snapshots for this business date so queries see one clean row
    await supabase
      .from("kpi_snapshots")
      .delete()
      .gte("captured_at", startOfDayET(dateStr).toISOString())
      .lt("captured_at", startOfDayET(addDays(dateStr, 1)).toISOString())
      .eq("org_id", orgId);

    const { error: insertErr } = await supabase.from("kpi_snapshots").insert({
      org_id: orgId,
      captured_at: capturedAt,
      sales_total: r2(salesTotal),
      sales_instore: r2(dineInSales),
      sales_takeout: r2(takeoutSales),
      sales_delivery: r2(salesDelivery),
      sales_third_party: r2(salesDelivery),
      sales_tips: r2(salesTips),
      check_average: checkCount > 0 ? r2(salesTotal / checkCount) : null,
      covers: checkCount,
      labor_total: r2(laborTotal),
      labor_pct: r2(laborPct),
      worked_hours: r2(workedHours),
      cogs_total: r2(cogsTotal),
      cogs_pct: r2(cogsPct),
      cogs_food: r2(cogsFood),
      cogs_beverage: r2(cogsBev),
      cogs_alcohol: r2(cogsAlcohol),
      prime_cost_pct: r2(primePct),
      net_profit: r2(netProfit),
      net_profit_pct: r2(netProfitPct),
      data_source: "toast-backfill",
    });
    if (insertErr) return { error: insertErr.message };

    return { sales: r2(salesTotal), laborPct: r2(laborPct), cogsPct: r2(cogsPct) };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: "POST required" }),
      { status: 405, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const clientId = Deno.env.get("TOAST_CLIENT_ID")!;
    const clientSecret = Deno.env.get("TOAST_CLIENT_SECRET")!;
    const guid = Deno.env.get("TOAST_RESTAURANT_GUID")!;
    const orgSlug = Deno.env.get("ORG_SLUG") ?? "gcdc";
    if (!clientId || !clientSecret || !guid) {
      throw new Error("Missing Toast credentials in secrets");
    }

    const body = (await req.json().catch(() => ({}))) as {
      days_back?: number;
      end_date?: string;
    };
    const daysBack = Math.max(1, Math.min(730, Number(body.days_back) || 180));
    const endDate = body.end_date || yesterdayET();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", orgSlug)
      .single();
    if (orgErr || !org) throw new Error(`Org not found: ${orgSlug}`);
    const orgId = org.id as string;

    const token = await getToken({ clientId, clientSecret });
    const authHeaders = {
      Authorization: `Bearer ${token}`,
      "Toast-Restaurant-External-ID": guid,
    };

    // Build the list of dates to process (newest → oldest)
    const dates: string[] = [];
    for (let i = 0; i < daysBack; i++) {
      dates.push(addDays(endDate, -i));
    }

    // Background task: walk the dates, write snapshots, log progress.
    const work = (async () => {
      let okCount = 0, errCount = 0;
      const errors: string[] = [];
      for (const d of dates) {
        const result = await backfillOneDay(supabase, authHeaders, orgId, d);
        if ("error" in result) {
          errCount++;
          errors.push(`${d}: ${result.error}`);
          console.error(`[backfill] ${d} FAIL — ${result.error}`);
        } else {
          okCount++;
          console.log(`[backfill] ${d} — sales $${result.sales}, labor ${result.laborPct}%, COGS ${result.cogsPct}%`);
        }
        // Throttle: 150ms between days → 180 days ≈ 27s of sleep
        await new Promise((r) => setTimeout(r, 150));
      }
      console.log(`[backfill] DONE — ok=${okCount} err=${errCount}`);
      // Drop a summary log entry so the Activity Log shows it
      await supabase.from("activity_log").insert({
        text: `Backfill complete — ${okCount} days written, ${errCount} errors (${endDate} back ${daysBack} days).`,
        type: "auto",
        source: "backfill-toast-kpis",
      });
      if (errors.length > 0 && errors.length <= 10) {
        for (const e of errors) {
          await supabase.from("activity_log").insert({
            text: `Backfill error ${e}`,
            type: "auto",
            source: "backfill-toast-kpis",
          });
        }
      }
    })();

    // @ts-ignore Supabase/Deno edge runtime exposes EdgeRuntime.waitUntil
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(work);
    } else {
      // Fallback: don't await, fire-and-forget
      work.catch((e) => console.error("[backfill] unhandled:", e));
    }

    return new Response(
      JSON.stringify({
        ok: true,
        started: true,
        days_back: daysBack,
        end_date: endDate,
        start_date: dates[dates.length - 1],
        message: "Backfill started in background. Watch function logs for progress. Activity log will show a summary when done.",
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("backfill-toast-kpis error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

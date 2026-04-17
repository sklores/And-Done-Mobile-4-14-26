// sync-toast-kpis — Supabase Edge Function
// Runs every 5 minutes via pg_cron.
// Pulls Toast sales + labor + COGS, writes a row to kpi_snapshots.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Constants ────────────────────────────────────────────────────────────────
const TOAST_AUTH_URL =
  "https://ws-api.toasttab.com/authentication/v1/authentication/login";
const TOAST_BASE = "https://ws-api.toasttab.com";

// GCDC-specific labor constants (mirror mobile app)
const SALARIED_STAFF = [{ name: "Elsie Zavala", dailyRate: 200 }];
const DAILY_SALARY_COST = SALARIED_STAFF.reduce((s, e) => s + e.dailyRate, 0);
const PAYROLL_TAX_RATE  = 0.11; // FICA 7.65% + FUTA 0.6% + DC SUTA 2.7%

// COGS rates
const COGS_FOOD_PCT     = 26;
const COGS_BEV_PCT      = 20;
const COGS_ALCOHOL_PCT  = 22;
const PAPER_DINEIN_PCT  = 0.01;
const PAPER_TAKEOUT_PCT = 0.04;
const THIRD_PARTY_COMM  = 0.18;

// ── Eastern Time helpers (DST-aware) ─────────────────────────────────────────
function easternDateStr(d = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}
function easternOffsetStr(d = new Date()): string {
  const dateStr = easternDateStr(d);
  const noonUTC = new Date(`${dateStr}T12:00:00Z`);
  const etHour  = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", hour: "numeric", hour12: false,
    }).format(noonUTC), 10,
  );
  const offset = etHour - 12;
  return `${offset < 0 ? "-" : "+"}${String(Math.abs(offset)).padStart(2, "0")}:00`;
}
function easternStartOfDay(d = new Date()): Date {
  return new Date(`${easternDateStr(d)}T00:00:00${easternOffsetStr(d)}`);
}
function todayBusinessDate(d = new Date()): string {
  return easternDateStr(d).replace(/-/g, "");
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

// ── Group item name → Food / Beverage / Alcohol ──────────────────────────────
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

// ── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (_req) => {
  try {
    // Credentials from Supabase secrets
    const clientId     = Deno.env.get("TOAST_CLIENT_ID")!;
    const clientSecret = Deno.env.get("TOAST_CLIENT_SECRET")!;
    const guid         = Deno.env.get("TOAST_RESTAURANT_GUID")!;
    const orgSlug      = Deno.env.get("ORG_SLUG") ?? "gcdc";

    if (!clientId || !clientSecret || !guid) {
      throw new Error("Missing Toast credentials in secrets");
    }

    // Supabase admin client (service role — bypasses RLS for insert)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Resolve org_id from slug
    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", orgSlug)
      .single();
    if (orgErr || !org) throw new Error(`Org not found: ${orgSlug}`);
    const orgId = org.id;

    const token = await getToken({ clientId, clientSecret });
    const authHeaders = {
      Authorization: `Bearer ${token}`,
      "Toast-Restaurant-External-ID": guid,
    };

    const now = new Date();
    const businessDate = todayBusinessDate(now);
    const startISO = easternStartOfDay(now).toISOString();

    // ── Fetch orders + time entries in parallel ───────────────────────────
    const [ordersRes, laborRes] = await Promise.all([
      fetch(`${TOAST_BASE}/orders/v2/ordersBulk?businessDate=${businessDate}`, { headers: authHeaders }),
      fetch(`${TOAST_BASE}/labor/v1/timeEntries?startDate=${encodeURIComponent(startISO)}&endDate=${encodeURIComponent(now.toISOString())}`, { headers: authHeaders }),
    ]);

    if (!ordersRes.ok) throw new Error(`Toast orders: ${ordersRes.status}`);
    if (!laborRes.ok)  throw new Error(`Toast labor: ${laborRes.status}`);

    const orders  = await ordersRes.json();
    const entries = await laborRes.json();

    // ── Process orders ────────────────────────────────────────────────────
    let salesTotal = 0, salesInstore = 0, salesTakeout = 0;
    let salesDoordash = 0, salesUbereats = 0, salesGrubhub = 0, salesOther3p = 0;
    let salesTips = 0, checkCount = 0;
    const groupRevenue = { Food: 0, Beverage: 0, Alcohol: 0 };
    let dineInSales = 0, takeoutSales = 0;
    let compValue = 0, voidValue = 0, voidCount = 0;

    if (Array.isArray(orders)) {
      for (const o of orders) {
        for (const c of o.checks ?? []) {
          if (c.voided) continue;
          const checkAmt = typeof c.amount === "number" ? c.amount : 0;
          if (checkAmt <= 0) continue;
          salesTotal += checkAmt;
          checkCount++;

          for (const p of c.payments ?? []) {
            if (typeof p.tipAmount === "number") salesTips += p.tipAmount;
          }

          // Channel classification
          const src = (o.source ?? "").toLowerCase();
          const dd = src.includes("doordash") || src.includes("door dash");
          const ub = src.includes("uber");
          const gh = src.includes("grubhub");
          const tp = dd || ub || gh || src.includes("delivery");
          if (dd) salesDoordash += checkAmt;
          else if (ub) salesUbereats += checkAmt;
          else if (gh) salesGrubhub += checkAmt;
          else if (tp) salesOther3p += checkAmt;

          const diningOption = (o.diningOption?.name ?? o.diningOption ?? "").toString().toLowerCase();
          const isDineIn = diningOption.includes("dine") || diningOption.includes("table") || diningOption === "";
          if (isDineIn && !tp) dineInSales += checkAmt;
          else takeoutSales += checkAmt;

          // Comps
          for (const d of c.appliedDiscounts ?? []) {
            const amt = typeof d.discountAmount === "number" ? d.discountAmount : 0;
            if (amt > 0) compValue += amt;
          }

          // Selections → Food/Bev/Alcohol groups + voids
          for (const sel of c.selections ?? []) {
            if (sel.voided) {
              const v = typeof sel.price === "number" ? sel.price * (sel.quantity ?? 1) : 0;
              if (v > 0) { voidValue += v; voidCount++; }
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
    }

    const salesDelivery    = salesDoordash + salesUbereats + salesGrubhub + salesOther3p;
    const takeoutDelivery  = takeoutSales + salesDelivery;
    salesInstore           = dineInSales;
    salesTakeout           = takeoutSales;

    // ── COGS calculation ──────────────────────────────────────────────────
    const cogsFood     = groupRevenue.Food     * (COGS_FOOD_PCT    / 100);
    const cogsBev      = groupRevenue.Beverage * (COGS_BEV_PCT     / 100);
    const cogsAlcohol  = groupRevenue.Alcohol  * (COGS_ALCOHOL_PCT / 100);
    const categoryCOGS = cogsFood + cogsBev + cogsAlcohol;

    const dineInPaper         = dineInSales    * PAPER_DINEIN_PCT;
    const takeoutDeliveryPaper = takeoutDelivery * PAPER_TAKEOUT_PCT;
    const thirdPartyComm      = (salesDoordash + salesUbereats + salesGrubhub) * THIRD_PARTY_COMM;
    const avgCogsPct          = salesTotal > 0 ? categoryCOGS / salesTotal : 0.26;
    const voidCost            = voidValue * avgCogsPct;
    const cogsTotal           = categoryCOGS + dineInPaper + takeoutDeliveryPaper + thirdPartyComm + compValue + voidCost;
    const cogsPct             = salesTotal > 0 ? (cogsTotal / salesTotal) * 100 : 0;

    // ── Labor calculation ─────────────────────────────────────────────────
    const nowMs = Date.now();
    let hourlyCost = 0, workedHours = 0;
    let firstClockInMs = Infinity;
    let lastClockOutMs = -Infinity;
    let openCount = 0;

    const parseWage = (raw: unknown) =>
      typeof raw === "number" && raw > 0 ? raw
      : typeof raw === "string" && parseFloat(raw) > 0 ? parseFloat(raw)
      : 0;

    if (Array.isArray(entries)) {
      for (const e of entries) {
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
          workedHours += hours;
          if (typeof e.regularPay === "number" || typeof e.overtimePay === "number") {
            hourlyCost += (e.regularPay ?? 0) + (e.overtimePay ?? 0);
          } else {
            hourlyCost += hours * parseWage(e.hourlyWage);
          }
        } else if (e.inDate) {
          const wage = parseWage(e.hourlyWage);
          if (wage > 0) {
            const hoursSoFar = Math.max(0, (nowMs - new Date(e.inDate).getTime()) / 3_600_000);
            workedHours += hoursSoFar;
            hourlyCost  += hoursSoFar * wage;
            openCount++;
          }
        }
      }
    }

    // Salary proration (same logic as mobile app)
    let salaryCost = 0;
    const STANDARD_DAY_MS = 12 * 60 * 60 * 1000;
    if (firstClockInMs < Infinity) {
      if (openCount === 0 && lastClockOutMs > -Infinity) {
        salaryCost = DAILY_SALARY_COST;
      } else {
        const elapsedMs = nowMs - firstClockInMs;
        salaryCost = Math.round(DAILY_SALARY_COST * Math.min(elapsedMs / STANDARD_DAY_MS, 1) * 100) / 100;
      }
    }

    const payrollTax  = (hourlyCost + salaryCost) * PAYROLL_TAX_RATE;
    const laborTotal  = hourlyCost + salaryCost + payrollTax;
    const laborPct    = salesTotal > 0 ? (laborTotal / salesTotal) * 100 : 0;
    const primePct    = cogsPct + laborPct;

    // ── Net profit ────────────────────────────────────────────────────────
    // Fixed costs not included in snapshot — net here is prime cost only
    const netProfit   = salesTotal - cogsTotal - laborTotal;
    const netProfitPct = salesTotal > 0 ? (netProfit / salesTotal) * 100 : 0;

    const r2 = (n: number) => Math.round(n * 100) / 100;

    // ── Insert snapshot ───────────────────────────────────────────────────
    const { error: insertErr } = await supabase.from("kpi_snapshots").insert({
      org_id:          orgId,
      captured_at:     new Date().toISOString(),
      sales_total:     r2(salesTotal),
      sales_instore:   r2(salesInstore),
      sales_takeout:   r2(salesTakeout),
      sales_delivery:  r2(salesDelivery),
      sales_third_party: r2(salesDelivery),
      sales_tips:      r2(salesTips),
      check_average:   checkCount > 0 ? r2(salesTotal / checkCount) : null,
      covers:          checkCount,
      labor_total:     r2(laborTotal),
      labor_pct:       r2(laborPct),
      worked_hours:    r2(workedHours),
      cogs_total:      r2(cogsTotal),
      cogs_pct:        r2(cogsPct),
      cogs_food:       r2(cogsFood),
      cogs_beverage:   r2(cogsBev),
      cogs_alcohol:    r2(cogsAlcohol),
      prime_cost_pct:  r2(primePct),
      net_profit:      r2(netProfit),
      net_profit_pct:  r2(netProfitPct),
      data_source:     "toast",
    });

    if (insertErr) throw insertErr;

    console.log(`[sync-toast-kpis] Snapshot written — sales: $${r2(salesTotal)}, labor: ${r2(laborPct)}%, COGS: ${r2(cogsPct)}%`);

    return new Response(
      JSON.stringify({
        ok: true,
        sales: r2(salesTotal),
        laborPct: r2(laborPct),
        cogsPct: r2(cogsPct),
        primePct: r2(primePct),
      }),
      { headers: { "Content-Type": "application/json" } },
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sync-toast-kpis] Error:", message);
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

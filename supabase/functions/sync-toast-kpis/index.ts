// sync-toast-kpis — Supabase Edge Function
// Runs every 5 minutes via pg_cron.
// Pulls Toast sales + labor + COGS, writes a row to kpi_snapshots.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Constants ────────────────────────────────────────────────────────────────
const TOAST_AUTH_URL =
  "https://ws-api.toasttab.com/authentication/v1/authentication/login";
const TOAST_BASE = "https://ws-api.toasttab.com";

// Labor: payroll tax estimate. Salary itself is now schedule-driven, see
// computeScheduleSalary() — pulls weekly_salary + shift windows from
// shift_settings + shift_shifts. Mobile uses the same formula.
const PAYROLL_TAX_RATE  = 0.11; // FICA 7.65% + FUTA 0.6% + DC SUTA 2.7%

// COGS rates
const COGS_FOOD_PCT     = 26;
const COGS_BEV_PCT      = 20;
const COGS_ALCOHOL_PCT  = 22;
const PAPER_DINEIN_PCT  = 0.01;
const PAPER_TAKEOUT_PCT = 0.04;
const THIRD_PARTY_COMM  = 0.18;

// Third-party marker substrings — used by both the diningOption-name match
// (in classifyChannel) and the per-platform split below.
const THIRD_PARTY_MARKERS = ["doordash", "uber eats", "ubereats", "grubhub", "chownow", "seamless"];

// Toast's diningOptions catalog row shape.
type DiningOption = {
  guid: string;
  name: string;
  behavior: "DINE_IN" | "TAKE_OUT" | "DELIVERY";
};

// Fixed costs (mirror src/config/fixedCostConfig.ts on the mobile side).
// When tenancy lands these become per-org config rows.
const RENT_PCT = 0.10;
const FIXED_LINE_ITEMS = [
  { label: "Pest Control",     monthly: 220  },
  { label: "Dishwasher Rental", monthly: 270 },
  { label: "Insurance",         monthly: 1500 },
  { label: "Utilities",         monthly: 2200 },
  { label: "Bookkeeper",         monthly: 1000 },
  { label: "Loan Payment",      monthly: 2000 },
];
const MONTHLY_FIXED_TOTAL = FIXED_LINE_ITEMS.reduce((s, i) => s + i.monthly, 0);
const FIXED_WINDOW_START_HOUR = 10;  // amortization drip starts at 10am ET
const FIXED_WINDOW_END_HOUR   = 16;  // …and finishes at 4pm ET

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

/** "14:30:00" or "14:30" → 14.5 */
function timeToHours(t: string): number {
  const [h, m = "0", s = "0"] = t.split(":");
  return Number(h) + Number(m) / 60 + Number(s) / 3600;
}

/** Current ET wall-clock hour as decimal. */
function nowETHours(d = new Date()): number {
  const s = d.toLocaleString("sv-SE", { timeZone: "America/New_York" });
  const time = s.split(" ")[1] ?? "00:00:00";
  return timeToHours(time);
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function mondayOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun
  const offsetToMon = (dow + 6) % 7;
  return addDays(iso, -offsetToMon);
}

// ── Schedule-driven salary ──────────────────────────────────────────────────
// Mirrors src/data/scheduleAdapter.ts → fetchTodayScheduled() exactly.
//   salaryHourlyRate  = weekly_salary / Σ daily-window-hours (Mon-Sun)
//   salaryAccruedToday = elapsed_in_today_window × salaryHourlyRate
async function computeScheduleSalary(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  now = new Date(),
): Promise<number> {
  const today  = easternDateStr(now);
  const monday = mondayOf(today);
  const sunday = addDays(monday, 6);

  const [shiftsRes, settingsRes] = await Promise.all([
    supabase
      .from("shift_shifts")
      .select(`shift_date, start_time, end_time, employee_id, shift_employees!inner ( id, is_active, hourly_rate )`)
      .gte("shift_date", monday)
      .lte("shift_date", sunday),
    supabase
      .from("shift_settings")
      .select("value")
      .eq("key", "weekly_salary")
      .maybeSingle(),
  ]);

  const weeklySalary = Number(settingsRes?.data?.value ?? 0) || 0;
  if (weeklySalary <= 0) return 0;

  // windows[date] = { start, end } — earliest start, latest end across all
  // active employees that day.
  const windows = new Map<string, { start: number; end: number }>();
  for (const row of shiftsRes?.data ?? []) {
    const empRaw = row.shift_employees;
    const emp = Array.isArray(empRaw) ? empRaw[0] : empRaw;
    if (!emp || !emp.is_active) continue;
    const startH = timeToHours(String(row.start_time));
    const endH   = timeToHours(String(row.end_time));
    const date   = String(row.shift_date);
    const w = windows.get(date);
    if (!w) windows.set(date, { start: startH, end: endH });
    else {
      if (startH < w.start) w.start = startH;
      if (endH   > w.end  ) w.end   = endH;
    }
  }

  let weekWindowHours = 0;
  for (const w of windows.values()) weekWindowHours += Math.max(0, w.end - w.start);
  if (weekWindowHours <= 0) return 0;

  const todayWin = windows.get(today);
  if (!todayWin) return 0;

  const salaryHourlyRate = weeklySalary / weekWindowHours;
  const todayWindowHours = Math.max(0, todayWin.end - todayWin.start);
  const nowH = nowETHours(now);

  let elapsed: number;
  if      (nowH <= todayWin.start) elapsed = 0;
  else if (nowH >= todayWin.end)   elapsed = todayWindowHours;
  else                             elapsed = nowH - todayWin.start;

  return Math.round(elapsed * salaryHourlyRate * 100) / 100;
}

// ── Fixed cost helpers (mirror src/config/fixedCostConfig.ts) ───────────────
function dailyFixedAmortized(now = new Date()): number {
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return MONTHLY_FIXED_TOTAL / daysInMonth;
}

/** 0 before 10am ET, 1 after 4pm ET, linear in between. */
function fixedAmortizationFactor(now = new Date()): number {
  const etDecimal = nowETHours(now);
  if (etDecimal <  FIXED_WINDOW_START_HOUR) return 0;
  if (etDecimal >= FIXED_WINDOW_END_HOUR)   return 1;
  const span = FIXED_WINDOW_END_HOUR - FIXED_WINDOW_START_HOUR;
  return (etDecimal - FIXED_WINDOW_START_HOUR) / span;
}

function hourlyAmortized(now = new Date()): number {
  return dailyFixedAmortized(now) * fixedAmortizationFactor(now);
}

// ── M&R: today's maintenance entries from the new table ─────────────────────
async function fetchTodayMRTotal(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  orgId: string,
  now = new Date(),
): Promise<number> {
  const today = easternDateStr(now);
  const { data, error } = await supabase
    .from("maintenance_entries")
    .select("amount")
    .eq("org_id", orgId)
    .eq("entry_date", today);
  if (error || !data) return 0;
  return data.reduce((s: number, r: { amount: number | string }) => s + Number(r.amount || 0), 0);
}

// ── Dining options catalog + channel classifier ─────────────────────────────
// Toast's ordersBulk response only carries diningOption as { guid, entityType }
// — no name, no behavior. Those live on the diningOptions catalog endpoint,
// which we fetch once at the top of the sync and look up by guid per order.
async function fetchDiningOptions(token: string, guid: string): Promise<Map<string, DiningOption>> {
  const r = await fetch(`${TOAST_BASE}/config/v2/diningOptions`, {
    headers: { Authorization: `Bearer ${token}`, "Toast-Restaurant-External-ID": guid },
  });
  if (!r.ok) {
    // Non-fatal: fall back to source-string classification if the catalog fails.
    console.warn(`[sync-toast-kpis] diningOptions fetch failed: ${r.status}`);
    return new Map();
  }
  const arr = (await r.json()) as DiningOption[];
  const map = new Map<string, DiningOption>();
  for (const o of arr) map.set(o.guid, o);
  return map;
}

// deno-lint-ignore no-explicit-any
function classifyChannel(order: any, doMap: Map<string, DiningOption>):
  "instore" | "takeout" | "delivery" | "thirdparty" {
  const ref = order?.diningOption?.guid
    ?? (typeof order?.diningOption === "string" ? order.diningOption : null);
  const opt = ref ? doMap.get(ref) : null;
  const name = (opt?.name ?? "").toLowerCase();
  const behavior = opt?.behavior;
  if (THIRD_PARTY_MARKERS.some((m) => name.includes(m))) return "thirdparty";
  if (behavior === "DINE_IN")  return "instore";
  if (behavior === "DELIVERY") return "delivery";
  if (behavior === "TAKE_OUT") return "takeout";
  // Catalog miss → fall back to source-string heuristics.
  const src = (order?.source ?? "").toLowerCase();
  if (src.includes("in store") || src.includes("kiosk")) return "instore";
  if (THIRD_PARTY_MARKERS.some((m) => src.includes(m))) return "thirdparty";
  return "takeout";
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

    // ── Fetch orders (paginated) + time entries in parallel ───────────────
    // Toast's ordersBulk endpoint defaults to pageSize=100, page=1. On busy
    // days GCDC exceeds one page once you count every 3p ticket, so we
    // walk pages until Toast returns a short page.
    const PAGE_SIZE = 100;
    const MAX_PAGES = 20; // safety cap → 2,000 orders/day ceiling
    async function fetchAllOrders(): Promise<unknown[]> {
      const all: unknown[] = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const url = `${TOAST_BASE}/orders/v2/ordersBulk?businessDate=${businessDate}&pageSize=${PAGE_SIZE}&page=${page}`;
        const r = await fetch(url, { headers: authHeaders });
        if (!r.ok) throw new Error(`Toast orders p${page}: ${r.status}`);
        const batch = await r.json();
        if (!Array.isArray(batch) || batch.length === 0) break;
        all.push(...batch);
        if (batch.length < PAGE_SIZE) break;
      }
      return all;
    }

    const [orders, laborRes, doMap] = await Promise.all([
      fetchAllOrders(),
      fetch(`${TOAST_BASE}/labor/v1/timeEntries?startDate=${encodeURIComponent(startISO)}&endDate=${encodeURIComponent(now.toISOString())}`, { headers: authHeaders }),
      fetchDiningOptions(token, guid),
    ]);

    if (!laborRes.ok) throw new Error(`Toast labor: ${laborRes.status}`);

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

          // Channel classification — use the dining-options catalog as the
          // source of truth. Toast's per-order diningOption is only
          // { guid, entityType }; name + behavior live on /config/v2/diningOptions.
          // Falls back to source-string heuristics when the catalog misses.
          const channel = classifyChannel(o, doMap);

          // Disjoint buckets — each check counted exactly once.
          // takeoutDelivery (= takeoutSales + salesDelivery) is the paper-cost
          // base; salesDelivery comes from the per-platform buckets below.
          if (channel === "thirdparty") {
            const src = (o.source ?? "").toLowerCase();
            if      (src.includes("doordash") || src.includes("door dash")) salesDoordash += checkAmt;
            else if (src.includes("uber"))                                   salesUbereats += checkAmt;
            else if (src.includes("grubhub"))                                salesGrubhub  += checkAmt;
            else                                                             salesOther3p  += checkAmt;
          } else if (channel === "instore") {
            dineInSales += checkAmt;
          } else {
            // "takeout" + in-house "delivery" both use takeout-rate paper costs.
            takeoutSales += checkAmt;
          }

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

    // ── Schedule-driven salary (replaces the old hardcoded $200/day) ──────
    // Reads weekly_salary from shift_settings + the week's shift windows
    // and prorates by today's elapsed window. Mobile applies the same
    // formula via fetchTodayScheduled(). When weekly_salary=0 → returns 0.
    const salaryCost = await computeScheduleSalary(supabase, now);
    void firstClockInMs; void lastClockOutMs; // formerly used for $200/day proration

    const payrollTax  = (hourlyCost + salaryCost) * PAYROLL_TAX_RATE;
    const laborTotal  = hourlyCost + salaryCost + payrollTax;
    const laborPct    = salesTotal > 0 ? (laborTotal / salesTotal) * 100 : 0;
    const primePct    = cogsPct + laborPct;

    // ── Fixed cost (rent + amortized monthly + M&R) ───────────────────────
    const rentDollars      = salesTotal * RENT_PCT;
    const amortizedDollars = hourlyAmortized(now);
    const mrDollars        = await fetchTodayMRTotal(supabase, orgId, now);
    const fixedTotal       = rentDollars + amortizedDollars + mrDollars;
    const fixedPct         = salesTotal > 0 ? (fixedTotal / salesTotal) * 100 : 0;

    // ── Net profit (now subtracts fixed costs to match mobile) ────────────
    const netProfit    = salesTotal - cogsTotal - laborTotal - fixedTotal;
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
      // Labor breakouts
      labor_hourly:    r2(hourlyCost),
      salary_total:    r2(salaryCost),
      payroll_tax:     r2(payrollTax),
      labor_total:     r2(laborTotal),
      labor_pct:       r2(laborPct),
      worked_hours:    r2(workedHours),
      // COGS
      cogs_total:      r2(cogsTotal),
      cogs_pct:        r2(cogsPct),
      cogs_food:       r2(cogsFood),
      cogs_beverage:   r2(cogsBev),
      cogs_alcohol:    r2(cogsAlcohol),
      // Prime
      prime_cost_pct:  r2(primePct),
      // Fixed cost breakouts (new)
      rent_dollars:      r2(rentDollars),
      amortized_dollars: r2(amortizedDollars),
      mr_dollars:        r2(mrDollars),
      fixed_total:       r2(fixedTotal),
      fixed_pct:         r2(fixedPct),
      // Net (now subtracts fixed)
      net_profit:      r2(netProfit),
      net_profit_pct:  r2(netProfitPct),
      data_source:     "toast",
    });

    if (insertErr) throw insertErr;

    console.log(`[sync-toast-kpis] Snapshot written — sales: $${r2(salesTotal)}, labor: ${r2(laborPct)}%, COGS: ${r2(cogsPct)}%, fixed: ${r2(fixedPct)}%, net: ${r2(netProfitPct)}%`);

    return new Response(
      JSON.stringify({
        ok: true,
        sales:    r2(salesTotal),
        laborPct: r2(laborPct),
        cogsPct:  r2(cogsPct),
        primePct: r2(primePct),
        fixedPct: r2(fixedPct),
        netPct:   r2(netProfitPct),
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

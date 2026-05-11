// send-daily-report — Supabase Edge Function
// Fires at 8 PM ET via pg_cron.
// Pulls latest kpi_snapshot, reviews, invoices, log notes → sends HTML email via Resend.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API = "https://api.resend.com/emails";

// ── Score → color mapping ────────────────────────────────────────────────────
function scoreColor(score: number): string {
  if (score >= 7) return "#0E7840";
  if (score >= 5) return "#A87800";
  return "#C01820";
}
function scoreBg(score: number): string {
  if (score >= 7) return "#B8E4D0";
  if (score >= 5) return "#FFF2B0";
  return "#FFCCD4";
}
function scoreLabel(score: number): string {
  if (score >= 8) return "Excellent";
  if (score >= 7) return "Good";
  if (score >= 6) return "Watch";
  if (score >= 5) return "Caution";
  if (score >= 4) return "Alert";
  if (score >= 3) return "Bad";
  return "Critical";
}

function cogsScore(pct: number)  { return pct<=25?8:pct<=28?7:pct<=31?6:pct<=34?5:pct<=37?4:pct<=42?3:2; }
function laborScore(pct: number) { return pct<=28?8:pct<=30?7:pct<=32?6:pct<=34?5:pct<=36?4:pct<=38?3:2; }
function primeScore(pct: number) { return pct<=55?8:pct<=60?7:pct<=65?6:pct<=68?5:pct<=72?4:pct<=78?3:2; }
function netScore(pct: number)   { return pct>=20?8:pct>=15?7:pct>=10?6:pct>=5?5:pct>=2?4:pct>=0?3:2; }
function fixedScore(pct: number) { return pct<=20?8:pct<=23?7:pct<=26?6:pct<=30?5:pct<=35?4:pct<=42?3:2; }

// Sales scoring: at 8pm ET the day's window is closed, so we score actual
// against a per-day-of-week target (mirrors src/config/salesTargetConfig.ts).
// 0=Sun ... 6=Sat; 0 = closed.
const DAILY_SALES_TARGETS: Record<number, number> = {
  0: 1200, 1: 1400, 2: 1400, 3: 1300, 4: 1500, 5: 1800, 6: 2300,
};
function dailyTargetET(d = new Date()): number {
  const isoET = d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const [y, m, day] = isoET.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
  return DAILY_SALES_TARGETS[dow] ?? 1400;
}
function salesScore(val: number, target: number): number {
  if (target <= 0) return 5;       // closed day → neutral
  const r = val / target;
  if (r >= 1.20) return 8;
  if (r >= 1.10) return 7;
  if (r >= 1.00) return 6;
  if (r >= 0.90) return 5;
  if (r >= 0.80) return 4;
  if (r >= 0.65) return 3;
  if (r >= 0.50) return 2;
  return 1;
}

// ── KPI pill HTML ────────────────────────────────────────────────────────────
function kpiPill(label: string, value: string, score: number): string {
  return `
    <td style="padding:6px;text-align:center;vertical-align:top;">
      <div style="background:${scoreBg(score)};border-radius:10px;padding:12px 16px;min-width:100px;">
        <div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${scoreColor(score)};margin-bottom:4px;">${label}</div>
        <div style="font-size:22px;font-weight:800;color:${scoreColor(score)};line-height:1;">${value}</div>
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:${scoreColor(score)};margin-top:4px;opacity:.8;">${scoreLabel(score)}</div>
      </div>
    </td>`;
}

// ── Section header HTML ──────────────────────────────────────────────────────
function sectionHeader(title: string, right = ""): string {
  return `
    <tr><td colspan="2" style="padding:20px 0 6px;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#8A9C9C;border-bottom:1px solid #E0E8E4;padding-bottom:4px;">${title}</td>
        ${right ? `<td style="font-size:9px;color:#8A9C9C;text-align:right;border-bottom:1px solid #E0E8E4;padding-bottom:4px;">${right}</td>` : ""}
      </tr></table>
    </td></tr>`;
}

function row(label: string, value: string, sub = ""): string {
  return `
    <tr>
      <td style="padding:8px 0;font-size:13px;color:#1A2E28;font-weight:500;">${label}${sub ? `<br><span style="font-size:10px;color:#8A9C9C;">${sub}</span>` : ""}</td>
      <td style="padding:8px 0;font-size:13px;color:#1A2E28;font-weight:700;text-align:right;">${value}</td>
    </tr>`;
}

function alertBanner(msg: string): string {
  return `<div style="background:#FFCCD4;border-left:4px solid #C01820;border-radius:6px;padding:10px 14px;margin:8px 0;font-size:12px;color:#780A14;font-weight:600;">⚠️ ${msg}</div>`;
}

function emptySection(msg: string): string {
  return `<tr><td colspan="2" style="padding:10px 0;font-size:12px;color:#8A9C9C;font-style:italic;">${msg}</td></tr>`;
}

// ── Build HTML email ─────────────────────────────────────────────────────────
function buildEmail(data: {
  orgName: string;
  date: string;
  snap: Record<string, number>;
  alerts: string[];
  reviews: Array<{ platform: string; rating: number; reviewer_name: string; review_text: string }>;
  invoices: Array<{ vendor_name: string; total_amount: number; status: string }>;
  logNotes: Array<{ note: string; author: string; created_at: string }>;
}): string {
  const { orgName, date, snap, alerts, reviews, invoices, logNotes } = data;

  const salesVal       = snap.sales_total       ?? 0;
  const laborPct       = snap.labor_pct         ?? 0;
  const laborTotal     = snap.labor_total       ?? 0;
  const laborHourly    = snap.labor_hourly      ?? 0;
  const salaryTotal    = snap.salary_total      ?? 0;
  const payrollTax     = snap.payroll_tax       ?? 0;
  const cogsPct        = snap.cogs_pct          ?? 0;
  const primePct       = snap.prime_cost_pct    ?? 0;
  const fixedPct       = snap.fixed_pct         ?? 0;
  const fixedTotal     = snap.fixed_total       ?? 0;
  const rentDollars    = snap.rent_dollars      ?? 0;
  const amortDollars   = snap.amortized_dollars ?? 0;
  const mrDollars      = snap.mr_dollars        ?? 0;
  const netPct         = snap.net_profit_pct    ?? 0;
  const netDollars     = snap.net_profit        ?? 0;

  const fmt$ = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  const fmtPct = (n: number) => `${n.toFixed(1)}%`;

  const alertsHtml = alerts.length
    ? alerts.map(alertBanner).join("")
    : `<div style="background:#B8E4D0;border-left:4px solid #0E7840;border-radius:6px;padding:10px 14px;margin:8px 0;font-size:12px;color:#0E7840;font-weight:600;">✅ All KPIs within normal range</div>`;

  const reviewsHtml = reviews.length
    ? reviews.map(r => row(
        `${"★".repeat(Math.round(r.rating))}${"☆".repeat(5 - Math.round(r.rating))} ${r.reviewer_name ?? "Guest"} — ${r.platform}`,
        "",
        r.review_text ? r.review_text.slice(0, 100) + (r.review_text.length > 100 ? "…" : "") : ""
      )).join("")
    : emptySection("No new reviews today — sync coming soon");

  const invoicesHtml = invoices.length
    ? invoices.map(i => row(i.vendor_name, fmt$(i.total_amount), i.status)).join("")
    : emptySection("No invoices uploaded today");

  const logHtml = logNotes.length
    ? logNotes.map(l => row(
        l.author ?? "Team",
        "",
        l.note
      )).join("")
    : emptySection("No log notes today");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F0EBDD;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F0EBDD;padding:24px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <!-- Header -->
  <tr><td style="background:#C4B090;border-radius:12px 12px 0 0;padding:20px 28px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td>
        <div style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#3A2A10;opacity:.7;">And Done</div>
        <div style="font-size:22px;font-weight:800;color:#3A2A10;margin-top:2px;">${orgName}</div>
        <div style="font-size:12px;color:#3A2A10;opacity:.7;margin-top:2px;">Nightly Report · ${date}</div>
      </td>
      <td style="text-align:right;font-size:28px;">🏖️</td>
    </tr></table>
  </td></tr>

  <!-- Body -->
  <tr><td style="background:#ffffff;padding:24px 28px;border-radius:0 0 12px 12px;">

    <!-- Alerts -->
    <div style="margin-bottom:16px;">${alertsHtml}</div>

    <!-- KPI Pills (6 across — Sales, COGS, Labor, Fixed, Prime, Net) -->
    <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:8px;">
      <tr>
        ${kpiPill("Sales", fmt$(salesVal),       salesScore(salesVal, dailyTargetET()))}
        ${kpiPill("COGS",  fmtPct(cogsPct),       cogsScore(cogsPct))}
        ${kpiPill("Labor", fmtPct(laborPct),      laborScore(laborPct))}
        ${kpiPill("Fixed", fmtPct(fixedPct),      fixedScore(fixedPct))}
        ${kpiPill("Prime", fmtPct(primePct),      primeScore(primePct))}
        ${kpiPill("Net",   fmtPct(netPct),        netScore(netPct))}
      </tr>
    </table>

    <!-- Financial detail -->
    <table width="100%" cellpadding="0" cellspacing="0">
      ${sectionHeader("Financial Summary")}
      ${row("Net Sales", fmt$(salesVal), `target ${fmt$(dailyTargetET())} · ${dailyTargetET() > 0 ? Math.round((salesVal / dailyTargetET()) * 100) + "% of target" : "closed day"}`)}
      ${row("COGS", fmtPct(cogsPct), `${fmt$(snap.cogs_total ?? 0)} — Food ${fmtPct(snap.cogs_food && salesVal ? (snap.cogs_food/salesVal)*100 : 0)} · Bev ${fmtPct(snap.cogs_beverage && salesVal ? (snap.cogs_beverage/salesVal)*100 : 0)} · Alc ${fmtPct(snap.cogs_alcohol && salesVal ? (snap.cogs_alcohol/salesVal)*100 : 0)}`)}
      ${row("Labor", fmtPct(laborPct), `${fmt$(laborTotal)} — Hourly ${fmt$(laborHourly)} · Salary ${fmt$(salaryTotal)} · Tax ${fmt$(payrollTax)}`)}
      ${row("Prime Cost", fmtPct(primePct))}
      ${row("Fixed Cost", fmtPct(fixedPct), `${fmt$(fixedTotal)} — Rent ${fmt$(rentDollars)} · Amortized ${fmt$(amortDollars)} · M&R ${fmt$(mrDollars)}`)}
      ${row("Net Profit", `${fmtPct(netPct)}`, fmt$(netDollars))}

      ${sectionHeader("Reviews")}
      ${reviewsHtml}

      ${sectionHeader("Invoices Uploaded Today")}
      ${invoicesHtml}

      ${sectionHeader("Log Notes")}
      ${logHtml}
    </table>

  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:16px 0;text-align:center;">
    <div style="font-size:10px;color:#8A9C9C;">Sent by And Done · <a href="https://gcdc.anddone.ai" style="color:#8A9C9C;">Open Dashboard</a></div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (_req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const resendKey   = Deno.env.get("RESEND_API_KEY")!;
    const fromEmail   = Deno.env.get("REPORT_FROM") ?? "nightly@anddone.ai";
    const recipients  = (Deno.env.get("REPORT_RECIPIENTS") ?? "").split(",").map(e => e.trim()).filter(Boolean);
    const orgSlug     = Deno.env.get("ORG_SLUG") ?? "gcdc";

    if (!resendKey || !recipients.length) throw new Error("Missing RESEND_API_KEY or REPORT_RECIPIENTS");

    // Resolve org
    const { data: org } = await supabase.from("organizations").select("id,name").eq("slug", orgSlug).single();
    if (!org) throw new Error(`Org not found: ${orgSlug}`);

    // Latest KPI snapshot
    const { data: snap } = await supabase
      .from("kpi_snapshots")
      .select("*")
      .eq("org_id", org.id)
      .order("captured_at", { ascending: false })
      .limit(1)
      .single();

    if (!snap) throw new Error("No KPI snapshot found");

    // Today's date (Eastern Time)
    const today = new Date().toLocaleDateString("en-US", {
      timeZone: "America/New_York",
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });

    // Today's reviews
    const todayDate = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const { data: reviews } = await supabase
      .from("reviews")
      .select("platform,rating,reviewer_name,review_text")
      .eq("org_id", org.id)
      .gte("review_date", todayDate)
      .order("review_date", { ascending: false });

    // Today's invoices
    const { data: invoices } = await supabase
      .from("invoices")
      .select("vendor_name,total_amount,status")
      .eq("org_id", org.id)
      .gte("created_at", `${todayDate}T00:00:00`)
      .order("created_at", { ascending: false });

    // Today's log notes (once log is wired to Supabase)
    const { data: logNotes } = await supabase
      .from("log_entries")
      .select("note,author,created_at")
      .eq("org_id", org.id)
      .gte("created_at", `${todayDate}T00:00:00`)
      .order("created_at", { ascending: false })
      .limit(10);

    // Build alerts
    const alerts: string[] = [];
    if ((snap.cogs_pct ?? 0) > 42)         alerts.push(`COGS at ${snap.cogs_pct?.toFixed(1)}% — above 42% threshold`);
    if ((snap.labor_pct ?? 0) > 50)        alerts.push(`Labor at ${snap.labor_pct?.toFixed(1)}% — above 50% threshold`);
    if ((snap.fixed_pct ?? 0) > 42)        alerts.push(`Fixed Cost at ${snap.fixed_pct?.toFixed(1)}% — above 42% threshold`);
    if ((snap.prime_cost_pct ?? 0) > 90)   alerts.push(`Prime Cost at ${snap.prime_cost_pct?.toFixed(1)}% — above 90% threshold`);
    if ((snap.net_profit_pct ?? 0) < -15)  alerts.push(`Net Profit at ${snap.net_profit_pct?.toFixed(1)}% — below -15% threshold`);
    {
      const tgt = dailyTargetET();
      const sales = snap.sales_total ?? 0;
      if (tgt > 0 && sales < tgt * 0.65) {
        alerts.push(`Sales at $${Math.round(sales)} — below 65% of $${tgt} daily target`);
      }
    }

    const html = buildEmail({
      orgName: org.name,
      date: today,
      snap,
      alerts,
      reviews: reviews ?? [],
      invoices: invoices ?? [],
      logNotes: logNotes ?? [],
    });

    // Send to each recipient
    const results = await Promise.all(recipients.map(async (to) => {
      const res = await fetch(RESEND_API, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to,
          subject: `And Done · ${org.name} · ${today}`,
          html,
        }),
      });
      const body = await res.json();
      return { to, ok: res.ok, id: body.id, error: body.message };
    }));

    console.log("[send-daily-report] Results:", JSON.stringify(results));

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[send-daily-report] Error:", message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});

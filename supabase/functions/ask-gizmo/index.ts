// ask-gizmo — the real Gizmo.
//
// Takes { messages, kpi_snapshot, mode } from the frontend.
// Runs a tool-use loop against Claude Sonnet 4.5 with 5 tools that read
// from Supabase (live KPIs, invoices, sales history, labor history,
// add-log-note). Returns the final assistant message text + any side-effect
// summaries (e.g. a log entry that was just written).
//
// Single-tenant for now — every query ignores org_id (all rows belong to GCDC).
// When we go multi-tenant, thread org_id through from the frontend session.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { KNOWLEDGE } from "./knowledge.ts";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5-20250929";
const MAX_TOOL_ITERATIONS = 6;

// ── System prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Gizmo, the in-app analyst for a small restaurant called GCDC Grilled Cheese Bar in Washington DC. You live inside the "And Done" app and help the owner understand their numbers.

VOICE
- Friendly but professional. Think of a sharp CFO who happens to like their job.
- Keep answers short — usually 1–3 sentences. Only go longer if the user explicitly asks for detail.
- Light emoji use is fine (✓, 📊, 👀, 🔥 when genuinely earned). Never surf slang, never "dude," never 🏄.
- Numbers first, commentary second. "Labor's at 28% — within target." not "Great question! So labor is..."

DOMAIN KNOWLEDGE (restaurant finance)
- Labor %: target 25–32%. Over 35% is a problem.
- COGS %: target 28–32% for full-service. Under 28% is excellent. Over 35% is a problem.
- Prime cost (labor + COGS): target under 60%. Under 55% is excellent.
- Net profit margin: 8–15% is healthy for a restaurant. Above 15% is excellent.
- Food cost categories: Food, Beverage, Alcohol, Paper, Supplies, Other.

DOMAIN KNOWLEDGE (customer reviews)
When the user asks about reviews, apply the "Reviews lens" section in the knowledge block below — it covers rating calibration, per-platform demographics (Google / Yelp / TripAdvisor / Uber Eats / DoorDash / FindMeGlutenFree), theme detection, pattern heuristics for what's signal vs noise, response-strategy norms, and GCDC-specific context. Use \`query_reviews\` to pull the actual rows before reasoning. Always cite specific reviewers / platforms / dates in your answer — vague "people seem unhappy" is unhelpful.

CRITICAL RULES
1. NEVER invent a number. If you want to cite a specific figure (sales, labor %, invoice total, spend amount, count, anything), it MUST come from a tool response. If the data isn't there, say so — don't guess.
2. When the user asks something ambiguous ("how are we doing?" — about what? today? this week?), ask a short clarifying question instead of assuming.
3. When data is missing or only partially available, say so explicitly. "I have today's sales but labor hasn't synced yet" is always better than a confident-sounding half-answer.
4. If the user asks something outside the data you can access (menu mix, specific employees, forecasts, competitor data), say so plainly: "I don't have that data wired up yet."
5. When writing a log note on the user's behalf (add_log_note tool), confirm the wording and source back to them in your text reply so they know what you recorded.

TOOLS
- get_current_kpis: today's live snapshot (sales, labor %, COGS %, net %). Fast, call freely.
- get_kpi_subsplits: today's snapshot broken down — sales channels (in-store/takeout/delivery/3rd-party/tips), labor splits (FOH/BOH/Mgmt), COGS splits (food/bev/alcohol), covers, check_average. Use for channel mix or labor-composition questions.
- query_invoices: filter by date range, vendor, category, paid status. Returns rows with line items.
- query_sales_history: daily sales totals for the last N days.
- query_labor_history: daily labor % for the last N days.
- query_reviews: recent customer reviews (Google, Yelp, etc). Filter by platform, rating, recency. Use for "what's the latest review?" or "any 1-star reviews lately?".
- get_ap_aging: latest A/P aging snapshot — total open balance + buckets (current, 1-30, 31-60, 61-90, 90+) + per-vendor breakdown. From forwarded QuickBooks reports.
- get_vendors: vendor master list with categories, payment terms, delivery days, contact info.
- get_pro_forma: monthly fixed costs and variable cost percentages from the planning config. Use for "what's our planned rent?" or "what did we project for COGS?".
- get_cashflow_day: drilldown for a specific YYYY-MM-DD — channel mix that day plus every invoice with that invoice_date.
- get_profit_loss: period-aware financial summary (wtd/mtd/ytd/last_week/last_month/last_year/q1-q4). Returns revenue, labor, COGS, invoice totals, rough net. For full hierarchical view, send the user to /financials/profit-loss.
- get_period_comparison: compare two consecutive periods (today vs yesterday, WTD vs last week same-days, last_7 vs prior_7, etc). Returns each side plus deltas.
- get_traffic_metrics: social/web traffic by platform (Instagram, Google, etc).
- query_log_history: search past activity-log entries by date range, text contains, or type. You CAN read your own previous log notes — use this to avoid duplicating an entry or to recall what was logged before.
- add_log_note: insert a timestamped note into the activity log. Use when the user explicitly says "log", "note", "remind me", "record that", etc. Never invoke speculatively.

SCHEDULE WRITES (the app has a scheduling module — these tools mutate it)
- mark_unavailable: block an employee off for a date range (sick, PTO, blackout).
- add_shift: create a new shift for an employee on a specific date.
- update_shift_times: change start/end of an existing shift.
- remove_shift: delete a shift entirely.

All three follow a strict preview-then-confirm pattern:
1. FIRST call the tool with confirm=false (or omitted). It returns a "preview" with a plan + any conflict warnings. Do NOT assume the write happened.
2. Relay the plan to the user in plain English and ASK for explicit confirmation ("Want me to do it?").
3. ONLY after the user says yes/confirm/do it, call the tool AGAIN with confirm=true. That's when the write actually happens.

Never call a schedule-write tool with confirm=true on the first call — even if the user's request sounds definitive. The preview step exists so the user can catch wrong employees, wrong dates, and conflicts before they hit the database.

If resolveEmployee returns an ambiguity error (multiple matches), relay the list and ask the user which person they mean. Same for findSingleShift when an employee has multiple shifts on a given date.

When a preview surfaces conflicts (e.g. mark_unavailable overlaps an existing shift), explicitly mention them to the user before they confirm — offer to also remove those shifts if that's what they want.

When the user opens the tab for the first time, you will be asked to produce a short opening summary. Pull get_current_kpis and write 1–2 sentences covering the standouts. End with "What do you want to look at?" or similar.

TODAY'S DATE will be injected as a user-visible system note at the top of every conversation — always trust that, never use a date from your training data.

${KNOWLEDGE}`;

// ── Tool definitions ─────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "get_current_kpis",
    description:
      "Get today's live restaurant KPI snapshot: sales total, labor %, COGS %, net profit %. Call this for 'how are we doing today' style questions.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "query_invoices",
    description:
      "Query the invoices table. Returns vendor, invoice number, dates, category, totals, status, and line items. Filter by date range or category. Results sorted by invoice_date desc, capped at 50 rows.",
    input_schema: {
      type: "object",
      properties: {
        start_date: {
          type: "string",
          description: "YYYY-MM-DD. Only include invoices on or after this invoice_date.",
        },
        end_date: {
          type: "string",
          description: "YYYY-MM-DD. Only include invoices on or before this invoice_date.",
        },
        category: {
          type: "string",
          enum: ["Food", "Beverage", "Alcohol", "Paper", "Supplies", "Other"],
          description: "Filter by primary category.",
        },
        vendor_contains: {
          type: "string",
          description: "Case-insensitive substring match on vendor_name.",
        },
        status: {
          type: "string",
          enum: ["pending", "paid"],
          description: "Filter by payment status.",
        },
      },
      required: [],
    },
  },
  {
    name: "query_sales_history",
    description:
      "Get daily sales totals for the last N days from kpi_snapshots. Returns one row per day with date and sales_total. Use for trend questions ('how's this week vs last week').",
    input_schema: {
      type: "object",
      properties: {
        days: {
          type: "integer",
          description: "How many days back to include. 1–90.",
        },
      },
      required: ["days"],
    },
  },
  {
    name: "query_labor_history",
    description:
      "Get daily labor % for the last N days from kpi_snapshots. Returns one row per day with date and labor_pct.",
    input_schema: {
      type: "object",
      properties: {
        days: {
          type: "integer",
          description: "How many days back to include. 1–90.",
        },
      },
      required: ["days"],
    },
  },
  {
    name: "add_log_note",
    description:
      "Write a new entry to the activity log on behalf of the user. ONLY use when the user explicitly asks to log/note/record something. Never invoke speculatively.",
    input_schema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "The note text, as the user phrased it (cleaned up lightly for readability).",
        },
      },
      required: ["text"],
    },
  },

  // ── Schedule-writing tools ────────────────────────────────────────────────
  // All three use the preview-then-confirm pattern: first call with
  // confirm=false to get a preview (including any conflict warnings),
  // then second call with confirm=true to actually write.
  {
    name: "mark_unavailable",
    description:
      "Add an availability block (unavailable / PTO / blackout) for an employee across a date range. Always call FIRST with confirm=false to preview; then on user's explicit 'yes/confirm', call again with confirm=true. The preview surfaces any conflicting shifts already on the schedule — the block itself does NOT remove those shifts.",
    input_schema: {
      type: "object",
      properties: {
        employee_name: { type: "string", description: "Employee's first or full name (matched case-insensitively against shift_employees.name where is_active=true)." },
        starts_on: { type: "string", description: "YYYY-MM-DD (Eastern Time). First day unavailable, inclusive." },
        ends_on:   { type: "string", description: "YYYY-MM-DD (Eastern Time). Last day unavailable, inclusive. Must be >= starts_on." },
        reason:    { type: "string", description: "Optional short reason (e.g. 'sick', 'vacation'). Empty string if not provided." },
        confirm:   { type: "boolean", description: "false = preview only (default); true = write." },
      },
      required: ["employee_name", "starts_on", "ends_on"],
    },
  },
  {
    name: "update_shift_times",
    description:
      "Change the start_time and/or end_time on an existing shift, identified by employee + shift_date. Always preview first (confirm=false) then write (confirm=true). Times are America/New_York local. end_time must be > start_time (overnight shifts not supported). If the employee has multiple shifts that day, returns an ambiguity error — the user must clarify.",
    input_schema: {
      type: "object",
      properties: {
        employee_name:  { type: "string", description: "Employee's first or full name." },
        shift_date:     { type: "string", description: "YYYY-MM-DD of the shift to edit." },
        new_start_time: { type: "string", description: "HH:MM (24-hour, ET). Omit to leave unchanged." },
        new_end_time:   { type: "string", description: "HH:MM (24-hour, ET). Omit to leave unchanged." },
        confirm:        { type: "boolean", description: "false = preview only (default); true = write." },
      },
      required: ["employee_name", "shift_date"],
    },
  },
  {
    name: "add_shift",
    description:
      "Create a new shift for an employee on a specific date. Always preview first (confirm=false) then write (confirm=true). Times are America/New_York local, HH:MM 24-hour. end_time must be > start_time (overnight shifts not supported). Preview surfaces warnings if the employee already has a shift that day or an availability block covering the date.",
    input_schema: {
      type: "object",
      properties: {
        employee_name: { type: "string", description: "Employee's first or full name." },
        shift_date:    { type: "string", description: "YYYY-MM-DD of the new shift." },
        start_time:    { type: "string", description: "HH:MM (24-hour, ET)." },
        end_time:      { type: "string", description: "HH:MM (24-hour, ET). Must be after start_time." },
        note:          { type: "string", description: "Optional free-text note attached to the shift. Empty string if not provided." },
        confirm:       { type: "boolean", description: "false = preview only (default); true = write." },
      },
      required: ["employee_name", "shift_date", "start_time", "end_time"],
    },
  },
  {
    name: "remove_shift",
    description:
      "Hard-delete an existing shift for an employee on a specific date. Always preview first (confirm=false) then write (confirm=true). If the employee has multiple shifts that day, returns an ambiguity error.",
    input_schema: {
      type: "object",
      properties: {
        employee_name: { type: "string", description: "Employee's first or full name." },
        shift_date:    { type: "string", description: "YYYY-MM-DD of the shift to remove." },
        confirm:       { type: "boolean", description: "false = preview only (default); true = write." },
      },
      required: ["employee_name", "shift_date"],
    },
  },

  // ── Read-only data tools (added) ──────────────────────────────────────────
  {
    name: "query_reviews",
    description:
      "Recent reviews (Yelp, Google, etc). Filter by platform, rating range, or recency. Returns reviewer, rating, text, platform, review_date. Sorted newest first, capped at 30.",
    input_schema: {
      type: "object",
      properties: {
        platform:   { type: "string", description: "Case-insensitive substring (e.g. 'google', 'yelp')." },
        min_rating: { type: "number", description: "Only reviews with rating >= this." },
        max_rating: { type: "number", description: "Only reviews with rating <= this. Useful for finding negative reviews (e.g. max_rating: 3)." },
        since_days: { type: "integer", description: "Only reviews from the last N days (1–365)." },
      },
      required: [],
    },
  },
  {
    name: "get_ap_aging",
    description:
      "Latest A/P (accounts payable) aging snapshot — total open balance plus aging buckets (current, 1–30, 31–60, 61–90, 90+ days), and per-vendor breakdown. Sourced from forwarded QuickBooks A/P Aging Summary reports.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "query_log_history",
    description:
      "Search the activity log (notes Gizmo or the user has written). Filter by date range, text contains, or type. Sorted newest first, capped at 50.",
    input_schema: {
      type: "object",
      properties: {
        since_days: { type: "integer", description: "Only entries from the last N days (1–365)." },
        contains:   { type: "string", description: "Case-insensitive substring match on entry text." },
        type:       { type: "string", description: "Filter by entry type (e.g. 'gizmo', 'user', 'system')." },
      },
      required: [],
    },
  },
  {
    name: "get_vendors",
    description:
      "Vendor master list — names, categories, payment terms, delivery days, contact info. Capped at 200 rows.",
    input_schema: {
      type: "object",
      properties: {
        category:      { type: "string", description: "Filter by vendor category (case-insensitive substring)." },
        name_contains: { type: "string", description: "Case-insensitive name substring." },
      },
      required: [],
    },
  },
  {
    name: "get_pro_forma",
    description:
      "Pro Forma planning config: monthly fixed costs (rent, insurance, utilities, etc.) and variable cost percentages. Use to answer questions about plan/projection assumptions ('what's our planned rent?').",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_kpi_subsplits",
    description:
      "Detailed sub-breakdowns from the most recent kpi_snapshot: sales channel mix (in-store / takeout / delivery / 3rd-party / tips), labor splits (FOH / BOH / Management), COGS splits (Food / Beverage / Alcohol), covers, and check_average. Use when the user asks about channel mix or labor/COGS composition.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_cashflow_day",
    description:
      "Per-day cashflow drilldown for a single business date: sales channel breakdown (last snapshot of that day) plus every invoice with that invoice_date. Useful when the user asks about a specific day.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD business date in ET." },
      },
      required: ["date"],
    },
  },
  {
    name: "get_profit_loss",
    description:
      "Period-aware financial summary: revenue (sales_total), labor, COGS, invoice totals, and rough operational net. Period choices: wtd, mtd, ytd, last_week, last_month, last_year, q1, q2, q3, q4. Quick view — for a full hierarchical P&L the user should open /financials/profit-loss.",
    input_schema: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["wtd", "mtd", "ytd", "last_week", "last_month", "last_year", "q1", "q2", "q3", "q4"],
          description: "Which period to summarize.",
        },
      },
      required: ["period"],
    },
  },
  {
    name: "get_period_comparison",
    description:
      "Compare two consecutive periods on revenue and labor %. Returns each side's totals plus absolute and % deltas. Use for 'this week vs last week' or 'today vs yesterday' style questions.",
    input_schema: {
      type: "object",
      properties: {
        window: {
          type: "string",
          enum: ["today_vs_yesterday", "wtd_vs_last", "mtd_vs_last", "last_7_vs_prior_7", "last_30_vs_prior_30"],
          description: "Which comparison window.",
        },
      },
      required: ["window"],
    },
  },
  {
    name: "get_traffic_metrics",
    description:
      "Social & web traffic metrics from the traffic_metrics table. Latest reading per platform/period. Use for 'how's Instagram doing' style questions.",
    input_schema: {
      type: "object",
      properties: {
        platform: { type: "string", description: "Filter to one platform (e.g. 'instagram', 'facebook', 'google_my_business')." },
        period:   { type: "string", description: "Filter to a specific period bucket (e.g. 'week', 'month')." },
      },
      required: [],
    },
  },
];

// ── Schedule helpers ─────────────────────────────────────────────────────────
// Used by mark_unavailable / update_shift_times / remove_shift.

// Levenshtein edit distance — tolerates typos like "Oliva" vs "Olivia".
function editDistance(a: string, b: string): number {
  a = a.toLowerCase();
  b = b.toLowerCase();
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

type EmpResolved = { id: string; name: string } | { error: string };
async function resolveEmployee(
  supabase: SupabaseClient,
  nameQuery: string,
): Promise<EmpResolved> {
  const q = nameQuery.trim();
  if (!q) return { error: "employee name is empty" };

  // Pull the full active roster — it's tiny (tens of rows) so a client-side
  // fuzzy pass is cheaper than fighting pg_trgm.
  const { data, error } = await supabase
    .from("shift_employees")
    .select("id, name")
    .eq("is_active", true);
  if (error) return { error: error.message };
  const roster = (data ?? []) as Array<{ id: string; name: string }>;
  if (roster.length === 0) return { error: "no active employees" };

  const qLower = q.toLowerCase();

  // Pass 1: substring match on full name or any whitespace-split token.
  const substring = roster.filter((r) => {
    const n = r.name.toLowerCase();
    if (n.includes(qLower)) return true;
    return n.split(/\s+/).some((tok) => tok.includes(qLower));
  });

  if (substring.length === 1) return { id: substring[0].id, name: substring[0].name };
  if (substring.length > 1) {
    return {
      error: `"${q}" matches ${substring.length} active employees: ${substring.map((r) => r.name).join(", ")}. Ask the user which one.`,
    };
  }

  // Pass 2: fuzzy — compare q against full name and each token, pick the
  // smallest edit distance per employee. Threshold scales with query length:
  // up to 2 edits for short names, 3 for longer ones.
  const threshold = q.length <= 4 ? 1 : q.length <= 7 ? 2 : 3;
  const scored = roster
    .map((r) => {
      const n = r.name.toLowerCase();
      const tokens = [n, ...n.split(/\s+/)];
      const best = Math.min(...tokens.map((t) => editDistance(qLower, t)));
      return { ...r, distance: best };
    })
    .filter((r) => r.distance <= threshold)
    .sort((a, b) => a.distance - b.distance);

  if (scored.length === 0) {
    return { error: `no active employee matches "${q}"` };
  }
  // If the top score is clearly better than runner-up, take it.
  if (scored.length === 1 || scored[0].distance < scored[1].distance) {
    return { id: scored[0].id, name: scored[0].name };
  }
  // Tie at the top — ambiguous.
  const tied = scored.filter((r) => r.distance === scored[0].distance);
  return {
    error: `"${q}" is close to ${tied.length} employees: ${tied.map((r) => r.name).join(", ")}. Ask the user which one.`,
  };
}

type ShiftResolved =
  | { id: string; start_time: string; end_time: string }
  | { error: string };
async function findSingleShift(
  supabase: SupabaseClient,
  employeeId: string,
  shiftDate: string,
): Promise<ShiftResolved> {
  const { data, error } = await supabase
    .from("shift_shifts")
    .select("id, start_time, end_time")
    .eq("employee_id", employeeId)
    .eq("shift_date", shiftDate);
  if (error) return { error: error.message };
  const rows = data ?? [];
  if (rows.length === 0) return { error: `no shift found on ${shiftDate} for that employee` };
  if (rows.length > 1) {
    return {
      error: `${rows.length} shifts found on ${shiftDate} (${rows.map((r) => `${r.start_time}–${r.end_time}`).join(", ")}). Ask the user which one.`,
    };
  }
  const r = rows[0];
  return { id: r.id as string, start_time: r.start_time as string, end_time: r.end_time as string };
}

async function logScheduleChange(supabase: SupabaseClient, message: string): Promise<void> {
  await supabase.from("activity_log").insert({ text: message, type: "gizmo", source: "gizmo" });
}

// ── Tool implementations ─────────────────────────────────────────────────────
async function runTool(
  supabase: SupabaseClient,
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "get_current_kpis": {
      const { data, error } = await supabase
        .from("kpi_snapshots")
        .select(
          "captured_at, sales_total, labor_pct, cogs_pct, net_profit_pct, net_profit, prime_cost_pct",
        )
        .order("captured_at", { ascending: false })
        .limit(1);
      if (error) return { error: error.message };
      if (!data || data.length === 0) return { note: "No KPI snapshots yet — Toast sync may not have run." };
      return data[0];
    }

    case "query_invoices": {
      let q = supabase
        .from("invoices")
        .select(
          "id, invoice_date, vendor_name, invoice_number, category, total_amount, tax_amount, status, paid_at, source, line_items",
        )
        .order("invoice_date", { ascending: false, nullsFirst: false })
        .limit(50);
      if (input.start_date) q = q.gte("invoice_date", input.start_date as string);
      if (input.end_date) q = q.lte("invoice_date", input.end_date as string);
      if (input.category) q = q.eq("category", input.category as string);
      if (input.vendor_contains) q = q.ilike("vendor_name", `%${input.vendor_contains as string}%`);
      if (input.status) q = q.eq("status", input.status as string);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { count: data?.length ?? 0, rows: data ?? [] };
    }

    case "query_sales_history": {
      const days = Math.max(1, Math.min(90, Number(input.days) || 7));
      const since = new Date(Date.now() - days * 86400_000).toISOString();
      const { data, error } = await supabase
        .from("kpi_snapshots")
        .select("captured_at, sales_total")
        .gte("captured_at", since)
        .order("captured_at", { ascending: true });
      if (error) return { error: error.message };
      // Collapse to one row per ET calendar day (last snapshot of the day wins).
      // We use ET-local date because the business "day" is Eastern Time —
      // a snapshot captured at 11:59 PM ET is Apr 18 business, even though
      // its UTC stamp rolls to Apr 19.
      const byDay = new Map<string, number>();
      for (const r of data ?? []) {
        const day = new Date(r.captured_at as string).toLocaleDateString("en-CA", {
          timeZone: "America/New_York",
        });
        byDay.set(day, Number(r.sales_total ?? 0));
      }
      return {
        days: [...byDay.entries()].map(([date, sales_total]) => ({ date, sales_total })),
      };
    }

    case "query_labor_history": {
      const days = Math.max(1, Math.min(90, Number(input.days) || 7));
      const since = new Date(Date.now() - days * 86400_000).toISOString();
      const { data, error } = await supabase
        .from("kpi_snapshots")
        .select("captured_at, labor_pct")
        .gte("captured_at", since)
        .order("captured_at", { ascending: true });
      if (error) return { error: error.message };
      const byDay = new Map<string, number>();
      for (const r of data ?? []) {
        const day = new Date(r.captured_at as string).toLocaleDateString("en-CA", {
          timeZone: "America/New_York",
        });
        byDay.set(day, Number(r.labor_pct ?? 0));
      }
      return {
        days: [...byDay.entries()].map(([date, labor_pct]) => ({ date, labor_pct })),
      };
    }

    case "add_log_note": {
      const text = String(input.text ?? "").trim();
      if (!text) return { error: "empty note" };
      const { data, error } = await supabase
        .from("activity_log")
        .insert({ text, type: "gizmo", source: "gizmo" })
        .select()
        .single();
      if (error) return { error: error.message };
      return { ok: true, id: data.id, text: data.text, created_at: data.created_at };
    }

    // ── Schedule writes ───────────────────────────────────────────────────
    case "mark_unavailable": {
      const nameQ    = String(input.employee_name ?? "").trim();
      const startsOn = String(input.starts_on ?? "").trim();
      const endsOn   = String(input.ends_on ?? "").trim();
      const reason   = String(input.reason ?? "").trim();
      const confirm  = input.confirm === true;
      if (!nameQ || !startsOn || !endsOn) return { error: "employee_name, starts_on, ends_on are required" };
      if (endsOn < startsOn) return { error: "ends_on must be >= starts_on" };

      const emp = await resolveEmployee(supabase, nameQ);
      if ("error" in emp) return emp;

      // Find any existing shifts inside the range (warn, don't block)
      const { data: conflicts } = await supabase
        .from("shift_shifts")
        .select("id, shift_date, start_time, end_time")
        .eq("employee_id", emp.id)
        .gte("shift_date", startsOn)
        .lte("shift_date", endsOn)
        .order("shift_date", { ascending: true });

      const warnings = (conflicts ?? []).map((c) =>
        `${c.shift_date}: existing shift ${c.start_time}–${c.end_time} (not removed by this block)`
      );

      if (!confirm) {
        return {
          status: "preview",
          action: "mark_unavailable",
          plan: `Will block ${emp.name} unavailable from ${startsOn} through ${endsOn}${reason ? ` (reason: ${reason})` : ""}.`,
          conflicts: warnings,
          employee_id: emp.id,
        };
      }

      const { data: block, error } = await supabase
        .from("shift_availability_blocks")
        .insert({ employee_id: emp.id, starts_on: startsOn, ends_on: endsOn, reason })
        .select()
        .single();
      if (error) return { error: error.message };

      await logScheduleChange(
        supabase,
        `Gizmo: marked ${emp.name} unavailable ${startsOn}${startsOn !== endsOn ? `→${endsOn}` : ""}${reason ? ` (${reason})` : ""}`,
      );
      return { status: "done", action: "mark_unavailable", block_id: block.id, employee: emp.name, starts_on: startsOn, ends_on: endsOn, conflicts: warnings };
    }

    case "update_shift_times": {
      const nameQ      = String(input.employee_name ?? "").trim();
      const shiftDate  = String(input.shift_date ?? "").trim();
      const newStart   = input.new_start_time ? String(input.new_start_time).trim() : null;
      const newEnd     = input.new_end_time   ? String(input.new_end_time).trim()   : null;
      const confirm    = input.confirm === true;
      if (!nameQ || !shiftDate) return { error: "employee_name and shift_date are required" };
      if (!newStart && !newEnd) return { error: "at least one of new_start_time or new_end_time must be provided" };

      const emp = await resolveEmployee(supabase, nameQ);
      if ("error" in emp) return emp;

      const shift = await findSingleShift(supabase, emp.id, shiftDate);
      if ("error" in shift) return shift;

      const finalStart = newStart ?? shift.start_time;
      const finalEnd   = newEnd   ?? shift.end_time;
      if (finalEnd <= finalStart) {
        return { error: `end_time (${finalEnd}) must be after start_time (${finalStart}); overnight shifts aren't supported.` };
      }

      if (!confirm) {
        return {
          status: "preview",
          action: "update_shift_times",
          plan: `Will change ${emp.name}'s shift on ${shiftDate} from ${shift.start_time}–${shift.end_time} to ${finalStart}–${finalEnd}.`,
          shift_id: shift.id,
        };
      }

      const patch: Record<string, string> = {};
      if (newStart) patch.start_time = newStart;
      if (newEnd)   patch.end_time   = newEnd;
      const { error } = await supabase.from("shift_shifts").update(patch).eq("id", shift.id);
      if (error) return { error: error.message };

      await logScheduleChange(
        supabase,
        `Gizmo: changed ${emp.name}'s shift on ${shiftDate} to ${finalStart}–${finalEnd} (was ${shift.start_time}–${shift.end_time})`,
      );
      return { status: "done", action: "update_shift_times", shift_id: shift.id, employee: emp.name, shift_date: shiftDate, new_start_time: finalStart, new_end_time: finalEnd };
    }

    case "add_shift": {
      const nameQ     = String(input.employee_name ?? "").trim();
      const shiftDate = String(input.shift_date ?? "").trim();
      const startT    = String(input.start_time ?? "").trim();
      const endT      = String(input.end_time ?? "").trim();
      const note      = String(input.note ?? "").trim();
      const confirm   = input.confirm === true;
      if (!nameQ || !shiftDate || !startT || !endT) {
        return { error: "employee_name, shift_date, start_time, end_time are required" };
      }
      if (endT <= startT) {
        return { error: `end_time (${endT}) must be after start_time (${startT}); overnight shifts aren't supported.` };
      }

      const emp = await resolveEmployee(supabase, nameQ);
      if ("error" in emp) return emp;

      // Warn if there's already a shift that day
      const { data: existing } = await supabase
        .from("shift_shifts")
        .select("id, start_time, end_time")
        .eq("employee_id", emp.id)
        .eq("shift_date", shiftDate);

      // Warn if date falls inside an availability block
      const { data: blocks } = await supabase
        .from("shift_availability_blocks")
        .select("id, starts_on, ends_on, reason")
        .eq("employee_id", emp.id)
        .lte("starts_on", shiftDate)
        .gte("ends_on", shiftDate);

      const warnings: string[] = [];
      for (const s of existing ?? []) {
        warnings.push(`${emp.name} already has a shift on ${shiftDate}: ${s.start_time}–${s.end_time}`);
      }
      for (const b of blocks ?? []) {
        warnings.push(`${emp.name} is marked unavailable ${b.starts_on}→${b.ends_on}${b.reason ? ` (${b.reason})` : ""} — this shift falls inside that block.`);
      }

      if (!confirm) {
        return {
          status: "preview",
          action: "add_shift",
          plan: `Will add a new shift for ${emp.name} on ${shiftDate}, ${startT}–${endT}${note ? ` — note: "${note}"` : ""}.`,
          warnings,
          employee_id: emp.id,
        };
      }

      const row: Record<string, unknown> = {
        employee_id: emp.id,
        shift_date: shiftDate,
        start_time: startT,
        end_time: endT,
      };
      if (note) row.note = note;
      const { data: inserted, error } = await supabase
        .from("shift_shifts")
        .insert(row)
        .select()
        .single();
      if (error) return { error: error.message };

      await logScheduleChange(
        supabase,
        `Gizmo: added shift for ${emp.name} on ${shiftDate} ${startT}–${endT}${note ? ` — ${note}` : ""}`,
      );
      return { status: "done", action: "add_shift", shift_id: inserted.id, employee: emp.name, shift_date: shiftDate, start_time: startT, end_time: endT, note: note || null, warnings };
    }

    case "remove_shift": {
      const nameQ     = String(input.employee_name ?? "").trim();
      const shiftDate = String(input.shift_date ?? "").trim();
      const confirm   = input.confirm === true;
      if (!nameQ || !shiftDate) return { error: "employee_name and shift_date are required" };

      const emp = await resolveEmployee(supabase, nameQ);
      if ("error" in emp) return emp;

      const shift = await findSingleShift(supabase, emp.id, shiftDate);
      if ("error" in shift) return shift;

      if (!confirm) {
        return {
          status: "preview",
          action: "remove_shift",
          plan: `Will DELETE ${emp.name}'s shift on ${shiftDate} (${shift.start_time}–${shift.end_time}).`,
          shift_id: shift.id,
        };
      }

      const { error } = await supabase.from("shift_shifts").delete().eq("id", shift.id);
      if (error) return { error: error.message };

      await logScheduleChange(
        supabase,
        `Gizmo: removed ${emp.name}'s shift on ${shiftDate} (was ${shift.start_time}–${shift.end_time})`,
      );
      return { status: "done", action: "remove_shift", shift_id: shift.id, employee: emp.name, shift_date: shiftDate };
    }

    // ── Read-only data tools (added) ──────────────────────────────────────
    case "query_reviews": {
      let q = supabase
        .from("reviews")
        .select("platform, reviewer_name, rating, review_text, review_date, fetched_at, responded")
        .order("review_date", { ascending: false, nullsFirst: false })
        .order("fetched_at", { ascending: false })
        .limit(30);
      if (input.platform) q = q.ilike("platform", `%${String(input.platform)}%`);
      if (typeof input.min_rating === "number") q = q.gte("rating", input.min_rating as number);
      if (typeof input.max_rating === "number") q = q.lte("rating", input.max_rating as number);
      if (typeof input.since_days === "number" && (input.since_days as number) > 0) {
        const days = Math.max(1, Math.min(365, input.since_days as number));
        const sinceISO = new Date(Date.now() - days * 86400_000)
          .toISOString()
          .slice(0, 10);
        q = q.gte("review_date", sinceISO);
      }
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { count: data?.length ?? 0, rows: data ?? [] };
    }

    case "get_ap_aging": {
      const { data, error } = await supabase
        .from("ap_aging_snapshots")
        .select("*")
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return { error: error.message };
      if (!data) return { note: "No A/P aging snapshots yet — forward a QuickBooks A/P Aging Summary to ingest." };
      return {
        report_date: data.report_date,
        received_at: data.received_at,
        total_open: Number(data.total_open) || 0,
        buckets: {
          current:    Number(data.total_current)  || 0,
          days_1_30:  Number(data.total_1_30)     || 0,
          days_31_60: Number(data.total_31_60)    || 0,
          days_61_90: Number(data.total_61_90)    || 0,
          days_90_plus: Number(data.total_over_90) || 0,
        },
        vendors: Array.isArray(data.vendors) ? data.vendors : [],
      };
    }

    case "query_log_history": {
      let q = supabase
        .from("activity_log")
        .select("id, text, type, source, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (typeof input.since_days === "number" && (input.since_days as number) > 0) {
        const days = Math.max(1, Math.min(365, input.since_days as number));
        const sinceISO = new Date(Date.now() - days * 86400_000).toISOString();
        q = q.gte("created_at", sinceISO);
      }
      if (input.contains) q = q.ilike("text", `%${String(input.contains)}%`);
      if (input.type) q = q.eq("type", String(input.type));
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { count: data?.length ?? 0, rows: data ?? [] };
    }

    case "get_vendors": {
      let q = supabase
        .from("vendors")
        .select("name, category, email, phone, payment_terms, delivery_days, delivery_minimum, address, notes")
        .order("name", { ascending: true })
        .limit(200);
      if (input.category)      q = q.ilike("category", `%${String(input.category)}%`);
      if (input.name_contains) q = q.ilike("name", `%${String(input.name_contains)}%`);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { count: data?.length ?? 0, rows: data ?? [] };
    }

    case "get_pro_forma": {
      const { data, error } = await supabase
        .from("org_settings")
        .select("pro_forma_json")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return { error: error.message };
      const pf = (data?.pro_forma_json ?? {}) as {
        fixed?: { projected?: Array<{ label: string; amount: number }> };
        variable?: { projected?: Array<{ label: string; pct: number }> };
      };
      const fixed = (pf.fixed?.projected ?? []).filter((f) => Number(f.amount) > 0);
      const fixedMonthlyTotal = fixed.reduce((s, f) => s + Number(f.amount || 0), 0);
      return {
        fixed_items: fixed,
        fixed_monthly_total: fixedMonthlyTotal,
        variable_items: pf.variable?.projected ?? [],
      };
    }

    case "get_kpi_subsplits": {
      const { data, error } = await supabase
        .from("kpi_snapshots")
        .select(
          "captured_at, sales_total, sales_instore, sales_takeout, sales_delivery, sales_third_party, sales_tips, labor_total, labor_foh, labor_boh, labor_management, cogs_total, cogs_food, cogs_beverage, cogs_alcohol, covers, check_average",
        )
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return { error: error.message };
      if (!data) return { note: "No KPI snapshots yet." };
      return {
        captured_at: data.captured_at,
        sales: {
          total: Number(data.sales_total) || 0,
          instore: Number(data.sales_instore) || 0,
          takeout: Number(data.sales_takeout) || 0,
          delivery: Number(data.sales_delivery) || 0,
          third_party: Number(data.sales_third_party) || 0,
          tips: Number(data.sales_tips) || 0,
        },
        labor: {
          total: Number(data.labor_total) || 0,
          foh: Number(data.labor_foh) || 0,
          boh: Number(data.labor_boh) || 0,
          management: Number(data.labor_management) || 0,
        },
        cogs: {
          total: Number(data.cogs_total) || 0,
          food: Number(data.cogs_food) || 0,
          beverage: Number(data.cogs_beverage) || 0,
          alcohol: Number(data.cogs_alcohol) || 0,
        },
        covers: data.covers,
        check_average: data.check_average,
      };
    }

    case "get_cashflow_day": {
      const date = String(input.date ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return { error: "date must be YYYY-MM-DD" };
      }
      // ±24h UTC buffer around the biz date in ET, then filter.
      const startBound = new Date(`${date}T00:00:00.000Z`);
      startBound.setUTCDate(startBound.getUTCDate() - 1);
      const endBound = new Date(`${date}T00:00:00.000Z`);
      endBound.setUTCDate(endBound.getUTCDate() + 2);

      const [snapsRes, invRes] = await Promise.all([
        supabase
          .from("kpi_snapshots")
          .select(
            "captured_at, sales_total, sales_instore, sales_takeout, sales_delivery, sales_third_party, sales_tips, labor_total, cogs_total",
          )
          .gte("captured_at", startBound.toISOString())
          .lt("captured_at", endBound.toISOString())
          .order("captured_at", { ascending: false }),
        supabase
          .from("invoices")
          .select("vendor_name, total_amount, category, status")
          .eq("invoice_date", date)
          .order("total_amount", { ascending: false }),
      ]);

      let snap: Record<string, unknown> | null = null;
      for (const s of snapsRes.data ?? []) {
        const bd = new Date(s.captured_at as string).toLocaleDateString("en-CA", {
          timeZone: "America/New_York",
        });
        if (bd === date) {
          snap = s as Record<string, unknown>;
          break;
        }
      }

      const invoices = invRes.data ?? [];
      const invoiceTotal = invoices.reduce(
        (s: number, i: { total_amount: number }) => s + Number(i.total_amount || 0),
        0,
      );

      return {
        date,
        snapshot: snap
          ? {
              sales_total: Number(snap.sales_total) || 0,
              channels: {
                instore: Number(snap.sales_instore) || 0,
                takeout: Number(snap.sales_takeout) || 0,
                delivery: Number(snap.sales_delivery) || 0,
                third_party: Number(snap.sales_third_party) || 0,
                tips: Number(snap.sales_tips) || 0,
              },
              labor_total: Number(snap.labor_total) || 0,
              cogs_total: Number(snap.cogs_total) || 0,
            }
          : null,
        invoices,
        invoice_count: invoices.length,
        invoice_total: invoiceTotal,
      };
    }

    case "get_profit_loss": {
      const period = String(input.period ?? "mtd");
      const bounds = computePeriodBounds(period);
      if (!bounds) return { error: `unknown period: ${period}` };

      const { startDate, endDate, label } = bounds;
      const summary = await fetchPeriodFinancials(supabase, startDate, endDate);
      return {
        period: { id: period, label, start_date: startDate, end_date: endDate },
        ...summary,
      };
    }

    case "get_period_comparison": {
      const window = String(input.window ?? "");
      const pair = computeComparisonPair(window);
      if (!pair) return { error: `unknown window: ${window}` };

      const [a, b] = await Promise.all([
        fetchPeriodFinancials(supabase, pair.a.startDate, pair.a.endDate),
        fetchPeriodFinancials(supabase, pair.b.startDate, pair.b.endDate),
      ]);

      const delta = (curr: number, prev: number) => {
        const diff = curr - prev;
        const pct = prev > 0 ? diff / prev : null;
        return { abs: Math.round(diff * 100) / 100, pct };
      };

      return {
        window,
        current:  { ...pair.a, ...a },
        previous: { ...pair.b, ...b },
        deltas: {
          revenue:  delta(a.revenue,  b.revenue),
          labor:    delta(a.labor,    b.labor),
          cogs:     delta(a.cogs,     b.cogs),
        },
      };
    }

    case "get_traffic_metrics": {
      let q = supabase
        .from("traffic_metrics")
        .select("*")
        .order("captured_at", { ascending: false, nullsFirst: false })
        .limit(50);
      if (input.platform) q = q.eq("platform", String(input.platform));
      if (input.period)   q = q.eq("period", String(input.period));
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { count: data?.length ?? 0, rows: data ?? [] };
    }

    default:
      return { error: `unknown tool: ${name}` };
  }
}

// ── Period helpers (used by get_profit_loss + get_period_comparison) ─────────
type Bounds = { startDate: string; endDate: string; label: string };

function todayET(): { y: number; m: number; d: number; dow: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wkMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    y: parseInt(get("year"), 10),
    m: parseInt(get("month"), 10) - 1,
    d: parseInt(get("day"), 10),
    dow: wkMap[get("weekday")] ?? 1,
  };
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function computePeriodBounds(period: string): Bounds | null {
  const t = todayET();
  const today = new Date(t.y, t.m, t.d);
  const backToMon = t.dow === 0 ? -6 : -(t.dow - 1);

  if (period === "wtd") {
    const start = new Date(t.y, t.m, t.d + backToMon);
    return { startDate: isoDate(start), endDate: isoDate(today), label: "Week to date" };
  }
  if (period === "mtd") {
    return { startDate: isoDate(new Date(t.y, t.m, 1)), endDate: isoDate(today), label: "Month to date" };
  }
  if (period === "ytd") {
    return { startDate: isoDate(new Date(t.y, 0, 1)), endDate: isoDate(today), label: `YTD ${t.y}` };
  }
  if (period === "last_week") {
    const start = new Date(t.y, t.m, t.d + backToMon - 7);
    const end = new Date(t.y, t.m, t.d + backToMon - 1);
    return { startDate: isoDate(start), endDate: isoDate(end), label: "Last week" };
  }
  if (period === "last_month") {
    const start = new Date(t.y, t.m - 1, 1);
    const end = new Date(t.y, t.m, 0);
    return { startDate: isoDate(start), endDate: isoDate(end), label: "Last month" };
  }
  if (period === "last_year") {
    return { startDate: `${t.y - 1}-01-01`, endDate: `${t.y - 1}-12-31`, label: `${t.y - 1}` };
  }
  if (["q1", "q2", "q3", "q4"].includes(period)) {
    const qIdx = parseInt(period.slice(1), 10) - 1;
    const qStart = qIdx * 3;
    return {
      startDate: isoDate(new Date(t.y, qStart, 1)),
      endDate: isoDate(new Date(t.y, qStart + 3, 0)),
      label: `Q${qIdx + 1} ${t.y}`,
    };
  }
  return null;
}

function computeComparisonPair(
  window: string,
): { a: Bounds & { label: string }; b: Bounds & { label: string } } | null {
  const t = todayET();
  const today = new Date(t.y, t.m, t.d);
  const backToMon = t.dow === 0 ? -6 : -(t.dow - 1);

  if (window === "today_vs_yesterday") {
    const yest = new Date(t.y, t.m, t.d - 1);
    return {
      a: { startDate: isoDate(today), endDate: isoDate(today), label: "Today" },
      b: { startDate: isoDate(yest), endDate: isoDate(yest), label: "Yesterday" },
    };
  }
  if (window === "wtd_vs_last") {
    const thisMon = new Date(t.y, t.m, t.d + backToMon);
    const elapsed = (today.getTime() - thisMon.getTime()) / 86400_000; // days into the week
    const lastMon = new Date(t.y, t.m, t.d + backToMon - 7);
    const lastAtSameOffset = new Date(t.y, t.m, t.d + backToMon - 7 + Math.round(elapsed));
    return {
      a: { startDate: isoDate(thisMon), endDate: isoDate(today), label: "WTD" },
      b: { startDate: isoDate(lastMon), endDate: isoDate(lastAtSameOffset), label: "Last week (same days)" },
    };
  }
  if (window === "mtd_vs_last") {
    const thisStart = new Date(t.y, t.m, 1);
    const lastStart = new Date(t.y, t.m - 1, 1);
    const lastSameDay = new Date(t.y, t.m - 1, t.d);
    return {
      a: { startDate: isoDate(thisStart), endDate: isoDate(today), label: "MTD" },
      b: { startDate: isoDate(lastStart), endDate: isoDate(lastSameDay), label: "Last month (same days)" },
    };
  }
  if (window === "last_7_vs_prior_7") {
    const aEnd   = new Date(t.y, t.m, t.d - 1);
    const aStart = new Date(t.y, t.m, t.d - 7);
    const bEnd   = new Date(t.y, t.m, t.d - 8);
    const bStart = new Date(t.y, t.m, t.d - 14);
    return {
      a: { startDate: isoDate(aStart), endDate: isoDate(aEnd), label: "Last 7 days" },
      b: { startDate: isoDate(bStart), endDate: isoDate(bEnd), label: "Prior 7 days" },
    };
  }
  if (window === "last_30_vs_prior_30") {
    const aEnd   = new Date(t.y, t.m, t.d - 1);
    const aStart = new Date(t.y, t.m, t.d - 30);
    const bEnd   = new Date(t.y, t.m, t.d - 31);
    const bStart = new Date(t.y, t.m, t.d - 60);
    return {
      a: { startDate: isoDate(aStart), endDate: isoDate(aEnd), label: "Last 30 days" },
      b: { startDate: isoDate(bStart), endDate: isoDate(bEnd), label: "Prior 30 days" },
    };
  }
  return null;
}

/**
 * Aggregate per-period financials from kpi_snapshots (last snapshot per ET
 * biz date) plus invoice totals. Same source the desktop P&L uses, kept
 * intentionally simple here — for the full hierarchical view, point users
 * at /financials/profit-loss.
 *
 * Pages through kpi_snapshots in 1000-row chunks because Supabase REST
 * has a hard 1000-row cap and wide periods (YTD, last_year) need more.
 */
async function fetchPeriodFinancials(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string,
): Promise<{
  revenue: number;
  labor: number;
  cogs: number;
  invoice_total: number;
  invoice_count: number;
  rough_net: number;
  days_with_data: number;
}> {
  // ±24h UTC buffer around the biz-date range
  const start = new Date(`${startDate}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 1);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 2);

  const PAGE = 1000;
  type SnapRow = {
    captured_at: string;
    sales_total: number | null;
    labor_total: number | null;
    cogs_total: number | null;
  };
  const snaps: SnapRow[] = [];
  for (let page = 0; page < 100; page++) {
    const { data, error } = await supabase
      .from("kpi_snapshots")
      .select("captured_at, sales_total, labor_total, cogs_total")
      .gte("captured_at", start.toISOString())
      .lt("captured_at", end.toISOString())
      .order("captured_at", { ascending: false })
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (error || !data || data.length === 0) break;
    snaps.push(...(data as SnapRow[]));
    if (data.length < PAGE) break;
  }

  const seen = new Set<string>();
  let revenue = 0;
  let labor = 0;
  let cogs = 0;
  for (const s of snaps) {
    const bd = new Date(s.captured_at).toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    });
    if (bd < startDate || bd > endDate) continue;
    if (seen.has(bd)) continue;
    seen.add(bd);
    revenue += Number(s.sales_total ?? 0);
    labor   += Number(s.labor_total ?? 0);
    cogs    += Number(s.cogs_total ?? 0);
  }

  const { data: invRows } = await supabase
    .from("invoices")
    .select("total_amount")
    .gte("invoice_date", startDate)
    .lte("invoice_date", endDate);
  const invoiceTotal = (invRows ?? []).reduce(
    (s, r: { total_amount: number }) => s + Number(r.total_amount || 0),
    0,
  );

  // Rough operational net — revenue minus Toast-reported labor + COGS.
  // Doesn't include fixed costs or invoice-derived spend (which would
  // double-count COGS), so it's a quick gut-check, not the full P&L.
  const roughNet = revenue - labor - cogs;

  return {
    revenue: Math.round(revenue * 100) / 100,
    labor: Math.round(labor * 100) / 100,
    cogs: Math.round(cogs * 100) / 100,
    invoice_total: Math.round(invoiceTotal * 100) / 100,
    invoice_count: invRows?.length ?? 0,
    rough_net: Math.round(roughNet * 100) / 100,
    days_with_data: seen.size,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY_GIZMO") ?? Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY_GIZMO not set");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { messages: incoming, mode } = (await req.json()) as {
      messages: Array<{ role: "user" | "assistant"; content: string }>;
      mode?: "chat" | "opening_summary";
    };

    // Inject today's ET date + day-of-week + a short calendar strip so Claude
    // never guesses which day of the week a given date is. Claude's training
    // data is imperfect for future dates; we hand it the truth.
    const nowET = new Date();
    const todayET = nowET.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const todayWeekday = nowET.toLocaleDateString("en-US", {
      weekday: "long",
      timeZone: "America/New_York",
    });

    // Build a calendar strip: 14 prior days + today + 28 future days.
    // Future dates matter because schedule-write tools reference upcoming shifts.
    const calendarLines: string[] = [];
    for (let i = -14; i <= 28; i++) {
      const d = new Date(nowET.getTime() + i * 86400_000);
      const iso = d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
      const dow = d.toLocaleDateString("en-US", {
        weekday: "short",
        timeZone: "America/New_York",
      });
      const marker = i === 0 ? " ← TODAY" : "";
      calendarLines.push(`${iso} = ${dow}${marker}`);
    }

    const datePrefix =
      `[System note — always trust over training data.\n` +
      `Today (ET) is ${todayWeekday}, ${todayET}.\n` +
      `Calendar (past 14 days → today → next 28 days):\n${calendarLines.join("\n")}\n` +
      `When the user says "today", "this week", "next Saturday", "April 20", etc., use THIS calendar — do not guess days-of-week from training data.]`;

    // Build the outbound message array for Claude.
    // For opening_summary we synthesize a single user turn.
    const claudeMessages: Array<{ role: "user" | "assistant"; content: unknown }> = [
      { role: "user", content: datePrefix },
      { role: "assistant", content: "Understood. I'll anchor on that date." },
    ];
    if (mode === "opening_summary") {
      claudeMessages.push({
        role: "user",
        content:
          "I just opened the Gizmo tab. Give me a 1–2 sentence opening summary of where we stand right now — pull get_current_kpis and call out anything notable. End by inviting me to ask something.",
      });
    } else {
      for (const m of incoming ?? []) {
        claudeMessages.push({ role: m.role, content: m.content });
      }
    }

    // Tool-use loop
    let loggedNote: { id: string; text: string; created_at: string } | null = null;
    let iterations = 0;
    let finalText = "";

    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations++;

      const res = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          tools: TOOLS,
          messages: claudeMessages,
        }),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(`anthropic ${res.status}: ${t.slice(0, 500)}`);
      }
      const json = await res.json();
      const stopReason: string = json.stop_reason;
      const contentBlocks: Array<Record<string, unknown>> = json.content ?? [];

      // Append assistant turn to history.
      claudeMessages.push({ role: "assistant", content: contentBlocks });

      if (stopReason === "tool_use") {
        // Run each tool_use block, append tool_result blocks as one user turn.
        const toolResults: Array<Record<string, unknown>> = [];
        for (const block of contentBlocks) {
          if (block.type === "tool_use") {
            const toolName = block.name as string;
            const toolInput = (block.input ?? {}) as Record<string, unknown>;
            const result = await runTool(supabase, toolName, toolInput);

            if (toolName === "add_log_note" && (result as { ok?: boolean }).ok) {
              const r = result as { id: string; text: string; created_at: string };
              loggedNote = { id: r.id, text: r.text, created_at: r.created_at };
            }

            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          }
        }
        claudeMessages.push({ role: "user", content: toolResults });
        continue;
      }

      // end_turn or other — pull text
      finalText = contentBlocks
        .filter((b) => b.type === "text")
        .map((b) => b.text as string)
        .join("\n")
        .trim();
      break;
    }

    if (!finalText) {
      finalText = "Hmm — I hit a snag. Try asking again.";
    }

    return new Response(
      JSON.stringify({ ok: true, text: finalText, logged_note: loggedNote }),
      { headers: cors },
    );
  } catch (err) {
    console.error("ask-gizmo error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 200, headers: cors },
    );
  }
});

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

CRITICAL RULES
1. NEVER invent a number. If you want to cite a specific figure (sales, labor %, invoice total, spend amount, count, anything), it MUST come from a tool response. If the data isn't there, say so — don't guess.
2. When the user asks something ambiguous ("how are we doing?" — about what? today? this week?), ask a short clarifying question instead of assuming.
3. When data is missing or only partially available, say so explicitly. "I have today's sales but labor hasn't synced yet" is always better than a confident-sounding half-answer.
4. If the user asks something outside the data you can access (menu mix, specific employees, forecasts, competitor data), say so plainly: "I don't have that data wired up yet."
5. When writing a log note on the user's behalf (add_log_note tool), confirm the wording and source back to them in your text reply so they know what you recorded.

TOOLS
- get_current_kpis: today's live snapshot (sales, labor %, COGS %, net %). Fast, call freely.
- query_invoices: filter by date range, vendor, category, paid status. Returns rows with line items.
- query_sales_history: daily sales totals for the last N days.
- query_labor_history: daily labor % for the last N days.
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

    default:
      return { error: `unknown tool: ${name}` };
  }
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

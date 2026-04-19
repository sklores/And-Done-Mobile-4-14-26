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

When the user opens the tab for the first time, you will be asked to produce a short opening summary. Pull get_current_kpis and write 1–2 sentences covering the standouts. End with "What do you want to look at?" or similar.

TODAY'S DATE will be injected as a user-visible system note at the top of every conversation — always trust that, never use a date from your training data.`;

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
];

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
      // Collapse to one row per calendar day (last snapshot of the day wins).
      const byDay = new Map<string, number>();
      for (const r of data ?? []) {
        const day = (r.captured_at as string).slice(0, 10);
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
        const day = (r.captured_at as string).slice(0, 10);
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

    // Inject today's date as the first system-aware user note so Claude never
    // uses a stale training-cutoff date when reasoning about "today" or ranges.
    const today = new Date().toISOString().slice(0, 10);
    const datePrefix =
      `[System note — always trust over training data: today's date is ${today} (${new Date().toUTCString()}). When the user says "today", "this week", "last week", etc., anchor from this date.]`;

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

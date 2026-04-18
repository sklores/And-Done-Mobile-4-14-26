// parse-invoice — Supabase Edge Function
// Accepts a base64 image, uploads it to the `invoices` storage bucket,
// runs Claude Vision (tool-use) to extract structured fields + line items,
// inserts a row into the `invoices` table, and returns the parsed record.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5-20250929";

// Tool schema: forces Claude to return structured JSON we can trust.
const EXTRACT_TOOL = {
  name: "record_invoice",
  description:
    "Record the structured data extracted from a restaurant/bar supplier invoice.",
  input_schema: {
    type: "object",
    properties: {
      vendor_name: {
        type: "string",
        description:
          "The supplier / vendor name as shown on the invoice (e.g. 'Sysco', 'Republic National').",
      },
      invoice_number: {
        type: "string",
        description: "Invoice number or reference ID if visible. Empty string if not found.",
      },
      invoice_date: {
        type: "string",
        description: "Invoice date in YYYY-MM-DD format. Empty string if not found.",
      },
      due_date: {
        type: "string",
        description: "Due date in YYYY-MM-DD format. Empty string if not found.",
      },
      subtotal: { type: "number", description: "Pre-tax subtotal. 0 if unknown." },
      tax_amount: { type: "number", description: "Total tax. 0 if unknown." },
      total_amount: {
        type: "number",
        description: "Grand total due including tax. Required.",
      },
      primary_category: {
        type: "string",
        enum: ["Food", "Beverage", "Alcohol", "Paper", "Supplies", "Other"],
        description:
          "The single best category for the whole invoice, based on which bucket most line items fall into.",
      },
      line_items: {
        type: "array",
        description: "Every distinct line item on the invoice.",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            quantity: { type: "number" },
            unit_price: { type: "number" },
            total: { type: "number" },
            category: {
              type: "string",
              enum: ["Food", "Beverage", "Alcohol", "Paper", "Supplies", "Other"],
              description:
                "Food = produce/meat/dairy/dry goods. Beverage = non-alcoholic drinks. " +
                "Alcohol = beer/wine/liquor. Paper = napkins/togo containers/cups/bags. " +
                "Supplies = cleaning/equipment/smallwares. Other = anything else.",
            },
          },
          required: ["description", "total", "category"],
        },
      },
    },
    required: ["vendor_name", "total_amount", "primary_category", "line_items"],
  },
};

const SYSTEM_PROMPT = `You are an invoice OCR + categorizer for a restaurant (GCDC Grilled Cheese Bar, a bar/restaurant in Washington DC). You will be shown a photo of a supplier invoice. Extract every field accurately and categorize each line item into one of: Food, Beverage, Alcohol, Paper, Supplies, Other. Use the record_invoice tool. Do not reply in prose.

Categorization rules:
- Food: meat, cheese, bread, produce, dairy, eggs, frozen food, dry goods, sauces
- Beverage: coffee, tea, juice, soda, syrups, non-alcoholic drinks
- Alcohol: beer, wine, spirits, mixers that come from a liquor distributor
- Paper: napkins, togo containers, cups, straws, bags, receipt paper, foil, film wrap
- Supplies: cleaning chemicals, gloves, sanitizer, smallwares, equipment parts
- Other: anything that doesn't fit (labor, delivery fees, credits, etc.)

If the image is unreadable or not an invoice, still call the tool but set total_amount to 0 and line_items to [].`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS });
  }

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { image_base64, mime_type = "image/jpeg", org_id } = body as {
      image_base64?: string;
      mime_type?: string;
      org_id?: string;
    };

    if (!image_base64) {
      return new Response(JSON.stringify({ error: "image_base64 required" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ── 1. Upload to storage ───────────────────────────────────────────────
    const ts = Date.now();
    const ext = mime_type.split("/")[1]?.split("+")[0] || "jpg";
    const path = `${org_id ?? "unassigned"}/${ts}.${ext}`;
    const bytes = Uint8Array.from(atob(image_base64), (c) => c.charCodeAt(0));
    const { error: uploadErr } = await supabase.storage
      .from("invoices")
      .upload(path, bytes, { contentType: mime_type, upsert: false });
    if (uploadErr) throw new Error(`storage upload: ${uploadErr.message}`);

    const { data: urlData } = supabase.storage.from("invoices").getPublicUrl(path);
    const imageUrl = urlData.publicUrl;

    // ── 2. Claude Vision + tool-use ─────────────────────────────────────────
    const anthropicRes = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: [EXTRACT_TOOL],
        tool_choice: { type: "tool", name: "record_invoice" },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mime_type, data: image_base64 },
              },
              { type: "text", text: "Extract this invoice." },
            ],
          },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      throw new Error(`anthropic ${anthropicRes.status}: ${errText}`);
    }

    const claudeJson = await anthropicRes.json();
    const toolBlock = claudeJson.content?.find(
      (b: { type: string; name?: string }) =>
        b.type === "tool_use" && b.name === "record_invoice",
    );
    if (!toolBlock) throw new Error("no tool_use block in Claude response");

    const parsed = toolBlock.input as {
      vendor_name: string;
      invoice_number?: string;
      invoice_date?: string;
      due_date?: string;
      subtotal?: number;
      tax_amount?: number;
      total_amount: number;
      primary_category: string;
      line_items: Array<Record<string, unknown>>;
    };

    // ── 3. Insert into invoices table ───────────────────────────────────────
    const today = new Date().toISOString().slice(0, 10);
    const insertRow = {
      org_id: org_id ?? null,
      vendor_name: parsed.vendor_name || "Unknown Vendor",
      invoice_number: parsed.invoice_number || null,
      invoice_date: parsed.invoice_date || today,
      due_date: parsed.due_date || null,
      category: parsed.primary_category || "Other",
      amount: parsed.subtotal ?? parsed.total_amount ?? 0,
      tax_amount: parsed.tax_amount ?? 0,
      total_amount: parsed.total_amount ?? 0,
      status: "pending",
      source: "scanned",
      raw_image_url: imageUrl,
      line_items: parsed.line_items ?? [],
    };

    const { data: inserted, error: insertErr } = await supabase
      .from("invoices")
      .insert(insertRow)
      .select()
      .single();
    if (insertErr) throw new Error(`insert: ${insertErr.message}`);

    return new Response(
      JSON.stringify({ ok: true, invoice: inserted, parsed }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("parse-invoice error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});

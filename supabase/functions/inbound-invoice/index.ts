// inbound-invoice — Postmark inbound webhook.
// Receives an email JSON from Postmark, extracts PDF/image attachments,
// runs Claude Vision (tool-use) to extract structured fields + line items,
// uploads the attachment to the `invoices` storage bucket, and inserts
// a row into the `invoices` table with source='email'.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5-20250929";

// Same schema the mobile scanner uses — keeps categorization consistent.
const EXTRACT_TOOL = {
  name: "record_invoice",
  description:
    "Record the structured data extracted from a restaurant/bar supplier invoice.",
  input_schema: {
    type: "object",
    properties: {
      vendor_name: { type: "string" },
      invoice_number: { type: "string" },
      invoice_date: { type: "string", description: "YYYY-MM-DD or empty" },
      due_date: { type: "string", description: "YYYY-MM-DD or empty" },
      subtotal: { type: "number" },
      tax_amount: { type: "number" },
      total_amount: { type: "number" },
      primary_category: {
        type: "string",
        enum: ["Food", "Beverage", "Alcohol", "Paper", "Supplies", "Other"],
      },
      line_items: {
        type: "array",
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
            },
          },
          required: ["description", "total", "category"],
        },
      },
    },
    required: ["vendor_name", "total_amount", "primary_category", "line_items"],
  },
};

const SYSTEM_PROMPT = `You are an invoice OCR + categorizer for a restaurant (GCDC Grilled Cheese Bar in Washington DC). You will be shown a supplier invoice (image or PDF). Extract every field accurately and categorize each line item into one of: Food, Beverage, Alcohol, Paper, Supplies, Other. Use the record_invoice tool. Do not reply in prose.

Categorization rules:
- Food: meat, cheese, bread, produce, dairy, eggs, frozen food, dry goods, sauces
- Beverage: coffee, tea, juice, soda, syrups, non-alcoholic drinks
- Alcohol: beer, wine, spirits, mixers from a liquor distributor
- Paper: napkins, togo containers, cups, straws, bags, receipt paper, foil, film
- Supplies: cleaning chemicals, gloves, sanitizer, smallwares, equipment parts
- Other: credits, delivery fees, labor, anything that doesn't fit

If the document is unreadable or not an invoice, still call the tool but set total_amount to 0 and line_items to [].`;

type PostmarkAttachment = {
  Name: string;
  ContentType: string;
  ContentLength: number;
  Content: string; // base64
  ContentID?: string;
};

type PostmarkInbound = {
  From?: string;
  FromName?: string;
  Subject?: string;
  Date?: string;
  MessageID?: string;
  TextBody?: string;
  HtmlBody?: string;
  Attachments?: PostmarkAttachment[];
};

function isInvoiceAttachment(a: PostmarkAttachment): boolean {
  const ct = a.ContentType.toLowerCase();
  return (
    ct === "application/pdf" ||
    ct.startsWith("image/")
  );
}

async function parseWithClaude(
  apiKey: string,
  base64: string,
  contentType: string,
): Promise<Record<string, unknown>> {
  const isPdf = contentType.toLowerCase() === "application/pdf";
  const userContent: Array<Record<string, unknown>> = [
    isPdf
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: base64 },
        }
      : {
          type: "image",
          source: { type: "base64", media_type: contentType, data: base64 },
        },
    { type: "text", text: "Extract this invoice." },
  ];

  const res = await fetch(ANTHROPIC_URL, {
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
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`anthropic ${res.status}: ${t.slice(0, 500)}`);
  }
  const json = await res.json();
  const tb = json.content?.find(
    (b: { type: string; name?: string }) =>
      b.type === "tool_use" && b.name === "record_invoice",
  );
  if (!tb) throw new Error("no tool_use block in Claude response");
  return tb.input as Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  // ── Shared-secret auth via ?token=... query param ──────────────────────────
  const webhookSecret = Deno.env.get("POSTMARK_WEBHOOK_SECRET");
  if (webhookSecret) {
    const url = new URL(req.url);
    if (url.searchParams.get("token") !== webhookSecret) {
      return new Response("unauthorized", { status: 401 });
    }
  }

  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = (await req.json()) as PostmarkInbound;

    const attachments = (body.Attachments ?? []).filter(isInvoiceAttachment);
    if (attachments.length === 0) {
      // Ack so Postmark doesn't retry forever.
      console.log(`no invoice attachments from ${body.From} / ${body.Subject}`);
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: "no invoice attachments" }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    const inserted: Array<Record<string, unknown>> = [];
    const fromLabel = body.FromName
      ? `${body.FromName} <${body.From}>`
      : body.From || "unknown@email";

    for (const att of attachments) {
      // ── 1. Upload the original to storage ──────────────────────────────────
      const ts = Date.now();
      const safeName = att.Name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `email/${ts}_${safeName}`;
      const bytes = Uint8Array.from(atob(att.Content), (c) => c.charCodeAt(0));
      const { error: upErr } = await supabase.storage
        .from("invoices")
        .upload(path, bytes, { contentType: att.ContentType, upsert: false });
      if (upErr) throw new Error(`storage: ${upErr.message}`);
      const { data: urlData } = supabase.storage.from("invoices").getPublicUrl(path);

      // ── 2. Claude Vision extraction ────────────────────────────────────────
      const parsed = await parseWithClaude(apiKey, att.Content, att.ContentType);

      const today = new Date().toISOString().slice(0, 10);
      const row = {
        vendor_name:
          (parsed.vendor_name as string) ||
          body.FromName ||
          body.From ||
          "Unknown Vendor",
        invoice_number: (parsed.invoice_number as string) || null,
        invoice_date: (parsed.invoice_date as string) || today,
        due_date: (parsed.due_date as string) || null,
        category: (parsed.primary_category as string) || "Other",
        amount:
          (parsed.subtotal as number) ?? (parsed.total_amount as number) ?? 0,
        tax_amount: (parsed.tax_amount as number) ?? 0,
        total_amount: (parsed.total_amount as number) ?? 0,
        status: "pending",
        source: "email",
        raw_image_url: urlData.publicUrl,
        raw_ocr_text: `from: ${fromLabel}\nsubject: ${body.Subject ?? ""}\ndate: ${body.Date ?? ""}`,
        line_items: (parsed.line_items as unknown[]) ?? [],
      };

      const { data: newRow, error: insErr } = await supabase
        .from("invoices")
        .insert(row)
        .select()
        .single();
      if (insErr) throw new Error(`insert: ${insErr.message}`);
      inserted.push(newRow);
    }

    return new Response(
      JSON.stringify({ ok: true, count: inserted.length, invoices: inserted }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("inbound-invoice error:", err);
    // Return 200 anyway so Postmark doesn't retry-storm on hard failures.
    // Supabase function logs capture the real error for debugging.
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
});

// ocr-handwriting — Supabase Edge Function
// Accepts a base64 image and returns the handwritten text in it.
// Used by the mobile Log tab to OCR handwritten notes into log entries.
//
// Returns { ok: true, has_text: boolean, text: string } on success
// or     { ok: false, error: string }                  on failure.
//
// Does NOT upload the image to storage — the calling client uploads
// separately when the log entry is submitted (via useLogStore.addEntry).

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5-20250929";

// Extended thinking budget. Lets the model "look twice" at ambiguous
// strokes AND sanity-check the result against real English before
// committing — meaningful accuracy lift on hard handwriting, costs a
// few cents per call. Output cap stays well above any plausible note.
const THINKING_BUDGET = 3072;
const MAX_OUTPUT_TOKENS = 8192;

// Tool schema — forces Claude to return a structured object so we don't
// have to parse free-form text. has_text lets us distinguish "no writing
// here" from "writing was unreadable" cleanly.
const EXTRACT_TOOL = {
  name: "extract_handwritten_text",
  description: "Record the handwritten text found in the photo.",
  input_schema: {
    type: "object",
    properties: {
      has_text: {
        type: "boolean",
        description:
          "True if the image contains readable handwritten or printed text " +
          "(notes, lists, instructions, labels). False if it's a photo of " +
          "something else (food, equipment, the room) without legible writing.",
      },
      text: {
        type: "string",
        description:
          "The extracted text, exactly as written, preserving line breaks. " +
          "Don't paraphrase, don't add headers, don't add commentary. " +
          "Empty string if has_text is false.",
      },
    },
    required: ["has_text", "text"],
  },
};

const SYSTEM_PROMPT = `You are a handwriting reader for a restaurant operator. The user just photographed a note (orders, shopping lists, reminders, vendor instructions, prep tasks). Your job is to produce clean, readable text that matches what the writer meant — not a slavish character-by-character transcription.

Think of yourself as a person, not a scanner. A human reading a handwritten note doesn't write back "ordes" when the writer clearly meant "order" — they read it as "order" because that's the only word the strokes plausibly represent.

Approach:
1. Scan the entire image and identify all writing.
2. Read top-to-bottom, left-to-right. Preserve line breaks and structure.
3. For each word, look at the strokes AND interpret them as a real word — use restaurant context (vendors, ingredients, prep tasks, times, employees) and plain English as your reference.
4. After your initial read, sanity-check every word: does it look like real English (or a recognized proper noun)? If a word came out as gibberish ("ordes", "knves", "delivry"), correct it to the obvious intended word ("order", "knives", "delivery"). If words run together with no space ("ordersand cleaning"), split them ("orders and cleaning").

Permission you have:
- Fix obvious single-character misreads (missing letter, swapped letter).
- Insert missing spaces between words that were written without them.
- Use restaurant context to disambiguate (e.g., choose "ribeye" over "ribege" if either is possible).
- Preserve abbreviations the writer used intentionally ("Sat", "AM", "tbsp").
- Preserve proper nouns (vendor names, employee names, brand names) — don't "correct" these even if they look unusual.

What you should NOT do:
- Don't invent content that isn't there. Read what the writer wrote, just read it correctly.
- Don't paraphrase or summarize. If the writer wrote "low on onions get more tomorrow" you write that, not "buy more onions."
- Don't translate.
- Don't add markdown, headers, or bullets that aren't on the page.

Last-resort uncertainty:
- Reserve [unclear] for words that are GENUINELY illegible — blurry, ink-faded, scribbled out, or strokes that don't form any plausible word. This should be rare on a typical phone photo.
- Don't use [unclear] for "I might be wrong" — commit to the most plausible read.

When the photo doesn't contain readable writing (it's a photo of food, equipment, the room), set has_text to false and text to "".

Always call the extract_handwritten_text tool. Do not reply in prose.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS });
  }

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    const body = await req.json();
    const { image_base64, mime_type = "image/jpeg" } = body as {
      image_base64?: string;
      mime_type?: string;
    };

    if (!image_base64) {
      return new Response(
        JSON.stringify({ ok: false, error: "image_base64 required" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const anthropicRes = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        // Extended thinking lets Claude examine ambiguous strokes more
        // carefully before committing to a transcription. Tool choice
        // must be "auto" when thinking is enabled (forced tool_choice is
        // incompatible with thinking).
        thinking: { type: "enabled", budget_tokens: THINKING_BUDGET },
        system: SYSTEM_PROMPT,
        tools: [EXTRACT_TOOL],
        tool_choice: { type: "auto" },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mime_type, data: image_base64 },
              },
              {
                type: "text",
                text:
                  "Read this handwritten note and call the extract_handwritten_text tool with the result. " +
                  "Interpret the strokes as real English words — fix obvious misreads, restore missing spaces, " +
                  "and use restaurant context. Only mark [unclear] for words that are truly illegible.",
              },
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
    const blocks = (claudeJson.content ?? []) as Array<{
      type: string;
      name?: string;
      text?: string;
      input?: { has_text?: boolean; text?: string };
    }>;

    // Preferred path: Claude called the tool, gives us a structured result.
    const toolBlock = blocks.find(
      (b) => b.type === "tool_use" && b.name === "extract_handwritten_text",
    );
    if (toolBlock?.input) {
      return new Response(
        JSON.stringify({
          ok: true,
          has_text: !!toolBlock.input.has_text,
          text: toolBlock.input.text ?? "",
        }),
        { headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // Fallback: Claude responded with plain text only (can happen with
    // tool_choice="auto" + extended thinking). Treat the concatenated
    // text blocks as the OCR result.
    const textOnly = blocks
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("\n")
      .trim();

    if (textOnly) {
      return new Response(
        JSON.stringify({ ok: true, has_text: true, text: textOnly }),
        { headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    throw new Error("no tool_use or text block in Claude response");
  } catch (err) {
    console.error("ocr-handwriting error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});

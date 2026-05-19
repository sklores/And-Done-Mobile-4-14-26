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
// strokes before committing — meaningful accuracy lift on hard
// handwriting, costs a few cents per call. Output cap stays well above
// any plausible note length.
const THINKING_BUDGET = 2048;
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

const SYSTEM_PROMPT = `You are a careful handwriting OCR assistant for a restaurant operator. The user just photographed a note (orders, shopping lists, reminders, vendor instructions). Handwriting can be messy. Your job is to transcribe it as faithfully as possible.

Approach:
1. Scan the entire image first to identify writing areas.
2. Read top-to-bottom, left-to-right. Preserve line breaks and indentation as written.
3. For each word, examine the actual strokes — don't guess based on context unless the strokes truly support multiple readings.
4. Restaurant context is a hint, not a license to invent. Common items: vendor names (Sysco, US Foods, Restaurant Depot), ingredients, prep tasks, counts, prices, employee names, time-of-day labels (lunch / dinner / AM / PM).

Uncertainty handling:
- If a word is genuinely illegible, write [unclear] in its place rather than guessing.
- If you're 60–80% sure, write your best read with a "?" at the end of that word: e.g. "fryer?".
- If only one character in a word is ambiguous, write your best read without marker — minor character-level uncertainty is normal handwriting.
- Don't [unclear] entire lines if most of the line is readable.

Output:
- Don't paraphrase. Don't add headers, bullets, or commentary that aren't on the page.
- Don't fix spelling — write what's actually written.
- Don't translate.
- Preserve underlines as nothing (no markdown), line breaks as line breaks, dashes/bullets as they appear.

When the photo doesn't contain readable writing (a photo of food, equipment, the room), set has_text to false and text to "".

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
                  "Transcribe the handwritten or printed text in this photo into the extract_handwritten_text tool. " +
                  "Examine the strokes carefully before deciding on each word. " +
                  "Use [unclear] for genuinely illegible words and `word?` for low-confidence reads.",
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

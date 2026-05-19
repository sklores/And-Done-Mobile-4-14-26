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

const SYSTEM_PROMPT = `You are an OCR assistant for a restaurant operator using a mobile app's quick-note feature. The user just took a photo with their phone, usually of a handwritten note (orders, reminders, shopping lists, instructions, vendor notes), but sometimes of something else entirely (a piece of equipment, food, the kitchen).

Your job:
- If the photo contains readable handwritten or printed text, extract it exactly as written. Preserve line breaks and structure. Don't paraphrase, don't add headers, don't add commentary. Don't translate. Don't fix spelling.
- If the photo does not contain readable text (it's a photo of food, equipment, the room, a blurry image, etc.), set has_text to false and text to "".

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
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        tools: [EXTRACT_TOOL],
        tool_choice: { type: "tool", name: "extract_handwritten_text" },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mime_type, data: image_base64 },
              },
              { type: "text", text: "Extract the text from this photo." },
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
        b.type === "tool_use" && b.name === "extract_handwritten_text",
    );
    if (!toolBlock) throw new Error("no tool_use block in Claude response");

    const parsed = toolBlock.input as { has_text: boolean; text: string };

    return new Response(
      JSON.stringify({
        ok: true,
        has_text: !!parsed.has_text,
        text: parsed.text ?? "",
      }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("ocr-handwriting error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});

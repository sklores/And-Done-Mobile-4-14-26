// Client adapter for the ocr-handwriting Edge Function.
// Used by the Log tab to extract handwritten text from a photo into
// the note text field.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const OCR_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/ocr-handwriting` : "";

export type OcrResult = {
  ok: boolean;
  text: string;        // empty string when has_text is false or on error
  has_text: boolean;
  error?: string;
};

/** Convert a browser File to a raw base64 string (no data: URI prefix). */
function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(",");
      const base64 = comma >= 0 ? result.slice(comma + 1) : result;
      resolve({ base64, mimeType: file.type || "image/jpeg" });
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
}

/**
 * OCR a handwritten note photo. Returns the extracted text (or empty
 * string if the photo doesn't contain readable writing). Never throws —
 * always returns a result object with `ok` indicating success.
 */
export async function ocrHandwriting(file: File): Promise<OcrResult> {
  if (!OCR_URL || !SUPABASE_KEY) {
    return { ok: false, text: "", has_text: false, error: "Supabase env not configured" };
  }
  try {
    const { base64, mimeType } = await fileToBase64(file);
    const res = await fetch(OCR_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({ image_base64: base64, mime_type: mimeType }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        text: "",
        has_text: false,
        error: data?.error ?? `http ${res.status}`,
      };
    }
    return {
      ok: true,
      text: String(data.text ?? ""),
      has_text: !!data.has_text,
    };
  } catch (err) {
    return {
      ok: false,
      text: "",
      has_text: false,
      error: (err as Error).message,
    };
  }
}

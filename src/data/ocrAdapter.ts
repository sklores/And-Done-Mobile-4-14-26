// Handwriting OCR for a log photo.
// Used by the Log tab to extract handwritten text from a photo into
// the note text field.

import { enhanceImageForOCR } from "./imagePreprocess";

// Runs on the seed now (one Claude vision call), behind the owner session.
import { ownerFetch } from "./ownerFetch";

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
 *
 * Runs through enhanceImageForOCR first: applies EXIF rotation,
 * downsamples to ~1800px, boosts contrast. Markedly improves accuracy
 * on phone photos vs sending raw bytes.
 */
export async function ocrHandwriting(file: File): Promise<OcrResult> {
  try {
    const enhanced = await enhanceImageForOCR(file);
    const { base64, mimeType } = await fileToBase64(enhanced);
    const res = await ownerFetch("/api/seed?view=ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

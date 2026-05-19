// Image preprocessing for handwriting OCR.
//
// Phone photos are typically 4000+px wide, 3–5 MB, with EXIF rotation
// flags and uneven lighting. Three things go wrong if you ship them
// straight to Claude:
//   1. Claude Vision internally resizes oversized images aggressively,
//      which blurs fine handwriting strokes (we want to control the
//      downsample with high-quality interpolation, not theirs).
//   2. EXIF orientation flags aren't applied if you grab raw file bytes;
//      Claude can see the image sideways or upside-down.
//   3. Low contrast on lined notebook paper / Post-its makes faint
//      pen strokes hard to distinguish from background.
//
// Fix: redraw the image on a canvas with rotation applied, downsample
// to ~1800px on the long edge, bump contrast and saturation, export as
// a clean JPEG. ~10× smaller payload, more legible result.

const MAX_DIMENSION = 1800;            // Claude Vision sweet spot
const JPEG_QUALITY  = 0.92;            // high quality, modest size
const CANVAS_FILTER = "contrast(1.18) brightness(1.06) saturate(0.65)";

/**
 * Load a File into an ImageBitmap with EXIF rotation applied.
 * Falls back to <img>-based loading on browsers without createImageBitmap
 * orientation support (very rare in 2026).
 */
async function loadOriented(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // fall through to <img>
    }
  }
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = URL.createObjectURL(file);
  });
}

function getDims(src: ImageBitmap | HTMLImageElement): { w: number; h: number } {
  return { w: src.width, h: src.height };
}

/**
 * Resize + contrast-boost a photo for handwriting OCR.
 * Returns a fresh JPEG File. On any failure, returns the original file
 * untouched (so the OCR call still has *something* to send).
 */
export async function enhanceImageForOCR(file: File): Promise<File> {
  try {
    const src = await loadOriented(file);
    const { w, h } = getDims(src);

    const longest = Math.max(w, h);
    const scale   = longest > MAX_DIMENSION ? MAX_DIMENSION / longest : 1;
    const targetW = Math.round(w * scale);
    const targetH = Math.round(h * scale);

    const canvas = document.createElement("canvas");
    canvas.width  = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.filter = CANVAS_FILTER;
    ctx.drawImage(src as CanvasImageSource, 0, 0, targetW, targetH);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) return file;

    return new File([blob], "ocr-input.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

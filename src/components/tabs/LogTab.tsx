import { useState, useRef, useEffect } from "react";
import { TabPanel } from "./TabPanel";
import { useLogStore } from "../../stores/useLogStore";
import { useSkin } from "../../theme/skins";
import { ocrHandwriting } from "../../data/ocrAdapter";

type Props = { open: boolean; onClose: () => void };

const countLineStyle = (bodyFont: string): React.CSSProperties => ({
  fontSize: 9, fontWeight: 700, letterSpacing: ".1em",
  textTransform: "uppercase", color: "#8A9C9C",
  fontFamily: bodyFont, marginBottom: 4,
});

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function LogTab({ open, onClose }: Props) {
  const skin = useSkin();
  const entries   = useLogStore((s) => s.entries);
  const addEntry  = useLogStore((s) => s.addEntry);
  const removeEntry = useLogStore((s) => s.removeEntry);
  const hydrate   = useLogStore((s) => s.hydrate);
  // The store owns the hydrate phase; read the fields straight off it so a
  // rename fails the build instead of silently flipping this screen to a
  // permanent "couldn't load" over a read that succeeded.
  const loadStatus = useLogStore((s) => s.status);
  const loadError  = useLogStore((s) => s.error);
  const loaded     = useLogStore((s) => s.loaded);

  const [draft, setDraft] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);
  const [ocrStatus, setOcrStatus] = useState<"idle" | "reading" | "no-text" | "failed">("idle");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // A delete that failed belongs next to the list it was pressed in, not under
  // the composer at the top of the panel.
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // The list is only ever in one of three named states. The store's own status
  // names the failure when it has one, and a pull this screen started that
  // never marked the store loaded names it either way -- "no entries" is never
  // stated over a read that never landed.
  const [pulling, setPulling] = useState(false);
  const [attempted, setAttempted] = useState(false);

  async function reload() {
    setPulling(true);
    try { await hydrate(); } finally { setPulling(false); setAttempted(true); }
  }

  useEffect(() => {
    if (!open || loaded || pulling) return;
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one pull per open while the log is unloaded
  }, [open]);

  const loading    = pulling || loadStatus === "loading";
  // The fallback stands on its own: a pull this screen started that finished
  // without the store marking itself loaded IS a failed read, whatever other
  // fields the store grows later.
  const loadFailed = !loading && (loadStatus === "error" || (attempted && !loaded));

  // The note only leaves the composer once the seed has it. A failed save
  // keeps the text and the photo on screen and says what went wrong.
  async function handleAdd() {
    const trimmed = draft.trim();
    if ((!trimmed && !photo) || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await addEntry(trimmed, "manual", { mediaFile: photo });
      setDraft("");
      if (photoPreview) URL.revokeObjectURL(photoPreview);
      setPhoto(null);
      setPhotoPreview(null);
      setOcrStatus("idle");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "could not save — your note is still here");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(id: string) {
    setDeleteError(null);
    try {
      await removeEntry(id);
    } catch (e) {
      // The store already put the row back, so the list still matches the
      // seed. All that's left to do is say the delete didn't land.
      setDeleteError(e instanceof Error ? e.message : "could not delete");
    }
  }

  async function handleExtractText() {
    if (!photo || ocrStatus === "reading") return;
    setOcrStatus("reading");
    const result = await ocrHandwriting(photo);
    if (result.ok && result.has_text && result.text.trim()) {
      // Append on new line if there's existing text, replace if field is empty
      setDraft((prev) => {
        const trimmedPrev = prev.trim();
        return trimmedPrev ? `${trimmedPrev}\n${result.text.trim()}` : result.text.trim();
      });
      setOcrStatus("idle");
    } else if (result.ok && !result.has_text) {
      setOcrStatus("no-text");
      // Auto-clear the "no text" message after 2.5s
      setTimeout(() => setOcrStatus("idle"), 2500);
    } else {
      // The read failed: say so rather than bouncing back to the idle label,
      // which looks like nothing happened. Typing the note still works.
      setOcrStatus("failed");
      setTimeout(() => setOcrStatus("idle"), 4000);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") void handleAdd();
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(f);
    setPhotoPreview(URL.createObjectURL(f));
  }

  function clearPhoto() {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(null);
    setPhotoPreview(null);
    setOcrStatus("idle");
    if (fileRef.current) fileRef.current.value = "";
  }

  const canSubmit = (draft.trim().length > 0 || photo !== null) && !saving;

  return (
    <TabPanel open={open} onClose={onClose} title="Activity Log" accent="#2A3C48">
      {/* ── Add note input ─────────────────────────────── */}
      <div style={{ padding: "16px 18px 12px" }}>
        <div style={{
          display: "flex",
          gap: 8,
          background: "#fff",
          borderRadius: 14,
          padding: "10px 14px",
          boxShadow: "0 1px 6px rgba(0,0,0,0.08)",
          alignItems: "center",
        }}>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFile}
            style={{ display: "none" }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            aria-label="Attach photo"
            style={{
              background: photo ? "#4EC89A" : "rgba(0,0,0,0.05)",
              color: photo ? "#fff" : "#2A3C48",
              border: "none",
              borderRadius: 10,
              width: 34, height: 34,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16,
              cursor: "pointer",
              flexShrink: 0,
              transition: "background 0.2s",
            }}
          >
            📷
          </button>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKey}
            placeholder={photo ? "Caption (optional)…" : "Add a note…"}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontFamily: skin.fonts.body,
              fontSize: 13,
              color: "#1A2E28",
            }}
          />
          <button
            onClick={() => void handleAdd()}
            disabled={!canSubmit}
            style={{
              background: canSubmit ? "#2A3C48" : "rgba(0,0,0,0.08)",
              color: canSubmit ? "#fff" : "#aaa",
              border: "none",
              borderRadius: 10,
              padding: "7px 14px",
              fontFamily: skin.fonts.body,
              fontWeight: 800,
              fontSize: 11,
              cursor: canSubmit ? "pointer" : "default",
              letterSpacing: ".04em",
              transition: "background 0.2s",
            }}
          >
            {saving ? "SAVING…" : "LOG"}
          </button>
        </div>

        {/* A save that failed: the note is still in the box above. */}
        {saveError && (
          <div style={{
            marginTop: 8,
            fontFamily: skin.fonts.body, fontSize: 11, fontWeight: 700,
            color: "#B94A4A",
          }}>
            ⚠ Not saved — {saveError}
          </div>
        )}

        {/* Photo preview strip */}
        {photoPreview && (
          <div style={{
            marginTop: 8,
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "#fff",
            borderRadius: 12,
            padding: 8,
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          }}>
            <img
              src={photoPreview}
              alt="Preview"
              style={{
                width: 54, height: 54, objectFit: "cover",
                borderRadius: 8,
              }}
            />
            <button
              onClick={() => void handleExtractText()}
              disabled={ocrStatus === "reading"}
              style={{
                flex: 1,
                background:
                  ocrStatus === "reading"  ? "rgba(0,0,0,0.06)" :
                  ocrStatus === "no-text"  ? "rgba(255,200,80,0.16)" :
                  ocrStatus === "failed"   ? "rgba(185,74,74,0.10)" :
                                             "rgba(78,200,154,0.14)",
                color:
                  ocrStatus === "reading"  ? "#8A9C9C" :
                  ocrStatus === "no-text"  ? "#7A5510" :
                  ocrStatus === "failed"   ? "#B94A4A" :
                                             "#084020",
                border:
                  ocrStatus === "no-text"
                    ? "1px solid rgba(255,200,80,0.45)"
                    : ocrStatus === "failed"
                      ? "1px solid rgba(185,74,74,0.35)"
                      : "1px solid rgba(78,200,154,0.30)",
                borderRadius: 8,
                padding: "8px 10px",
                fontFamily: skin.fonts.body,
                fontSize: 12,
                fontWeight: 700,
                cursor: ocrStatus === "reading" ? "default" : "pointer",
                textAlign: "left",
                letterSpacing: ".02em",
                transition: "background 0.2s",
                animation: ocrStatus === "reading" ? "kpiSkeleton 1.4s ease-in-out infinite" : undefined,
              }}
            >
              {ocrStatus === "reading"
                ? "Reading note…"
                : ocrStatus === "no-text"
                  ? "No text detected — type the note instead"
                  : ocrStatus === "failed"
                    ? "Couldn't read the photo — tap to try again"
                    : "📝 Extract text from photo"}
            </button>
            <button
              onClick={clearPhoto}
              aria-label="Remove photo"
              style={{
                background: "rgba(0,0,0,0.06)", border: "none",
                borderRadius: 8, cursor: "pointer",
                width: 28, height: 28, fontSize: 14, color: "#4A5A64",
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* ── Entry list ─────────────────────────────────── */}
      <div style={{ padding: "0 18px 32px", display: "flex", flexDirection: "column", gap: 6 }}>
        {/* A delete that failed: the note is still on the seed, and the store
            has already put its row back in the list below. */}
        {deleteError && (
          <div style={{
            fontFamily: skin.fonts.body, fontSize: 11, fontWeight: 700,
            color: "#B94A4A", marginBottom: 2,
          }}>
            ⚠ Not deleted — {deleteError}
          </div>
        )}

        {loadFailed ? (
          <button
            type="button"
            onClick={() => void reload()}
            style={{
              ...countLineStyle(skin.fonts.body),
              background: "none", border: "none", padding: 0,
              textAlign: "left", cursor: "pointer", color: "#B94A4A",
            }}
          >
            Couldn't load the log — tap to retry
          </button>
        ) : (
          <div style={countLineStyle(skin.fonts.body)}>
            {/* Nothing here knows what the seed caps the log at, so this says
                only what it can see: how many rows are on the screen. */}
            {loading
              ? "Loading…"
              : `${entries.length} ${entries.length === 1 ? "entry" : "entries"} shown`}
          </div>
        )}

        {entries.map((entry) => (
          <div
            key={entry.id}
            style={{
              background: entry.type === "auto" ? "rgba(42,60,72,0.06)" : "#fff",
              borderRadius: 12,
              padding: "11px 14px",
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              boxShadow: entry.type === "manual" ? "0 1px 4px rgba(0,0,0,0.06)" : "none",
              border: entry.type === "auto" ? "1px solid rgba(42,60,72,0.10)" : "none",
            }}
          >
            {/* Icon */}
            <div style={{
              width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
              background:
                entry.type === "auto"  ? "rgba(42,60,72,0.12)" :
                entry.type === "gizmo" ? "rgba(26,158,138,0.18)" :
                                         "#4EC89A",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13,
            }}>
              {entry.type === "auto"  ? "⚡" :
               entry.type === "gizmo" ? "🦝" :
                                        "✏️"}
            </div>

            {/* Text + timestamp */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {entry.text && (
                <div style={{
                  fontFamily: skin.fonts.body, fontSize: 13, fontWeight: 600,
                  color: "#1A2E28", lineHeight: 1.4,
                }}>
                  {entry.text}
                </div>
              )}
              {entry.mediaUrl && entry.mediaType === "image" && (
                <img
                  src={entry.mediaUrl}
                  alt=""
                  onClick={() => setViewingPhoto(entry.mediaUrl!)}
                  style={{
                    marginTop: entry.text ? 6 : 0,
                    width: "100%",
                    maxWidth: 240,
                    maxHeight: 180,
                    objectFit: "cover",
                    borderRadius: 8,
                    cursor: "pointer",
                    display: "block",
                  }}
                />
              )}
              <div style={{
                fontSize: 10, color: "#8A9C9C", marginTop: 2,
                fontFamily: skin.fonts.body,
                display: "flex", alignItems: "center", gap: 5,
              }}>
                <span style={{
                  display: "inline-block",
                  background:
                    entry.type === "auto"  ? "rgba(42,60,72,0.12)" :
                    entry.type === "gizmo" ? "rgba(26,158,138,0.20)" :
                                             "rgba(78,200,154,0.18)",
                  borderRadius: 4, padding: "1px 5px",
                  fontWeight: 700, fontSize: 9, letterSpacing: ".06em", textTransform: "uppercase",
                  color:
                    entry.type === "auto"  ? "#4A5A64" :
                    entry.type === "gizmo" ? "#0F5A4E" :
                                             "#084020",
                }}>
                  {entry.type}
                </span>
                <span>{relativeTime(entry.timestamp)}</span>
              </div>
            </div>

            {/* Delete (manual + gizmo entries) */}
            {(entry.type === "manual" || entry.type === "gizmo") && (
              <button
                onClick={() => void handleRemove(entry.id)}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "#C0CCCC", fontSize: 16, padding: 0, lineHeight: 1,
                  flexShrink: 0, marginTop: 1,
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}

        {entries.length === 0 && (
          <div style={{
            textAlign: "center", padding: "40px 0",
            color: loadFailed ? "#B94A4A" : "#8A9C9C",
            fontFamily: skin.fonts.body, fontSize: 13,
          }}>
            {loadFailed ? (
              <>
                <div>Couldn't load your notes.</div>
                {loadError && (
                  <div style={{ fontSize: 11, marginTop: 3, opacity: 0.8 }}>{loadError}</div>
                )}
                <button
                  type="button"
                  onClick={() => void reload()}
                  style={{
                    marginTop: 10,
                    background: "#2A3C48", color: "#fff", border: "none",
                    borderRadius: 10, padding: "8px 16px",
                    fontFamily: skin.fonts.body, fontWeight: 800, fontSize: 11,
                    letterSpacing: ".04em", cursor: "pointer",
                  }}
                >
                  RETRY
                </button>
              </>
            ) : loading ? (
              "Loading your notes…"
            ) : (
              "No entries yet — add your first note above."
            )}
          </div>
        )}
      </div>

      {/* Full-size photo viewer */}
      {viewingPhoto && (
        <div
          onClick={() => setViewingPhoto(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(0,0,0,0.88)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16, cursor: "pointer",
          }}
        >
          <img
            src={viewingPhoto}
            alt=""
            style={{
              maxWidth: "100%", maxHeight: "100%",
              borderRadius: 10, objectFit: "contain",
            }}
          />
        </div>
      )}
    </TabPanel>
  );
}

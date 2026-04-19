import { useState } from "react";
import { TabPanel } from "./TabPanel";
import { useLogStore } from "../../stores/useLogStore";
import { coastal } from "../../theme/skins";

type Props = { open: boolean; onClose: () => void };

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
  const entries   = useLogStore((s) => s.entries);
  const addEntry  = useLogStore((s) => s.addEntry);
  const removeEntry = useLogStore((s) => s.removeEntry);

  const [draft, setDraft] = useState("");

  function handleAdd() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    void addEntry(trimmed, "manual");
    setDraft("");
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleAdd();
  }

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
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Add a note…"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontFamily: coastal.fonts.manrope,
              fontSize: 13,
              color: "#1A2E28",
            }}
          />
          <button
            onClick={handleAdd}
            disabled={!draft.trim()}
            style={{
              background: draft.trim() ? "#2A3C48" : "rgba(0,0,0,0.08)",
              color: draft.trim() ? "#fff" : "#aaa",
              border: "none",
              borderRadius: 10,
              padding: "7px 14px",
              fontFamily: coastal.fonts.manrope,
              fontWeight: 800,
              fontSize: 11,
              cursor: draft.trim() ? "pointer" : "default",
              letterSpacing: ".04em",
              transition: "background 0.2s",
            }}
          >
            LOG
          </button>
        </div>
      </div>

      {/* ── Entry list ─────────────────────────────────── */}
      <div style={{ padding: "0 18px 32px", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{
          fontSize: 9, fontWeight: 700, letterSpacing: ".1em",
          textTransform: "uppercase", color: "#8A9C9C",
          fontFamily: coastal.fonts.manrope, marginBottom: 4,
        }}>
          {entries.length} entries today
        </div>

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
              <div style={{
                fontFamily: coastal.fonts.manrope, fontSize: 13, fontWeight: 600,
                color: "#1A2E28", lineHeight: 1.4,
              }}>
                {entry.text}
              </div>
              <div style={{
                fontSize: 10, color: "#8A9C9C", marginTop: 2,
                fontFamily: coastal.fonts.manrope,
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
                onClick={() => void removeEntry(entry.id)}
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
            color: "#8A9C9C", fontFamily: coastal.fonts.manrope, fontSize: 13,
          }}>
            No entries yet — add your first note above.
          </div>
        )}
      </div>
    </TabPanel>
  );
}

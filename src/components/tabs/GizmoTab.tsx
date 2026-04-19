import { useState, useRef, useEffect } from "react";
import { TabPanel } from "./TabPanel";
import { useKpiStore } from "../../stores/useKpiStore";
import { useLogStore } from "../../stores/useLogStore";
import { coastal } from "../../theme/skins";

type Props = { open: boolean; onClose: () => void };

type Message = { id: string; role: "gizmo" | "user"; text: string };

// ── Brand colors ─────────────────────────────────────────────────────────────
const GIZMO_ACCENT = "#1A9E8A";
const GIZMO_DARK   = "#1A2E28";
const GIZMO_BUBBLE = "#148A78";

// ── Edge Function endpoint ───────────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const ASK_GIZMO_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/ask-gizmo` : "";

async function callGizmo(
  messages: Message[],
  mode: "chat" | "opening_summary",
): Promise<{ text: string; logged_note: { id: string; text: string; created_at: string } | null }> {
  if (!ASK_GIZMO_URL || !SUPABASE_KEY) {
    return { text: "Gizmo isn't configured yet — Supabase credentials missing.", logged_note: null };
  }

  const payload = {
    mode,
    messages: messages.map((m) => ({
      role: m.role === "gizmo" ? "assistant" : "user",
      content: m.text,
    })),
  };

  try {
    const res = await fetch(ASK_GIZMO_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.ok) {
      return { text: `Hm, hit an error: ${data.error ?? "unknown"}`, logged_note: null };
    }
    return { text: data.text as string, logged_note: data.logged_note ?? null };
  } catch (e) {
    return { text: `Network issue reaching Gizmo — try again. (${(e as Error).message})`, logged_note: null };
  }
}

// ── Full Gizmo character SVG (coastal skin) ──────────────────────────────────
function GizmoCharacter({ size = 120, blink = false }: { size?: number; blink?: boolean }) {
  const h = Math.round(size * 1.25);
  return (
    <svg width={size} height={h} viewBox="0 0 80 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M13 36 Q4 6 22 18 Q19 26 17 34 Z" fill="#6B4020"/>
      <path d="M14 34 Q7 10 21 20 Q18 27 17 33 Z" fill="#A87048"/>
      <path d="M67 36 Q76 6 58 18 Q61 26 63 34 Z" fill="#6B4020"/>
      <path d="M66 34 Q73 10 59 20 Q62 27 63 33 Z" fill="#A87048"/>
      <ellipse cx="40" cy="38" rx="27" ry="24" fill="#C09870"/>
      <ellipse cx="40" cy="24" rx="26" ry="5" fill="#7B5030" opacity=".45"/>
      <ellipse cx="40" cy="32" rx="25" ry="3.5" fill="#7B5030" opacity=".28"/>
      <ellipse cx="40" cy="40" rx="21" ry="18" fill="#D4B490"/>
      <circle cx="27" cy="36" r="11" fill="white"/>
      <circle cx="53" cy="36" r="11" fill="white"/>
      {blink ? (
        <>
          <rect x="19.5" y="34" width="15" height="3" rx="1.5" fill="#9B6A38"/>
          <rect x="45.5" y="34" width="15" height="3" rx="1.5" fill="#9B6A38"/>
        </>
      ) : (
        <>
          <circle cx="27" cy="37" r="7.5" fill="#9B6A38"/>
          <circle cx="53" cy="37" r="7.5" fill="#9B6A38"/>
          <circle cx="27" cy="37" r="4.5" fill="#1A0C04"/>
          <circle cx="53" cy="37" r="4.5" fill="#1A0C04"/>
          <circle cx="29.5" cy="33.5" r="2" fill="white"/>
          <circle cx="55.5" cy="33.5" r="2" fill="white"/>
          <circle cx="24.5" cy="39" r=".9" fill="white" opacity=".5"/>
          <circle cx="50.5" cy="39" r=".9" fill="white" opacity=".5"/>
        </>
      )}
      <circle cx="27" cy="36" r="12.5" fill="none" stroke="#2A1A0A" strokeWidth="1.8"/>
      <circle cx="53" cy="36" r="12.5" fill="none" stroke="#2A1A0A" strokeWidth="1.8"/>
      <path d="M39.5 35 Q40 33 40.5 35" stroke="#2A1A0A" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      <line x1="14.5" y1="31" x2="11" y2="27" stroke="#2A1A0A" strokeWidth="1.3"/>
      <line x1="65.5" y1="31" x2="69" y2="27" stroke="#2A1A0A" strokeWidth="1.3"/>
      <ellipse cx="40" cy="46" rx="3.5" ry="2.5" fill="#8B4A28"/>
      <circle cx="38.5" cy="46.5" r="1" fill="#6A3418"/>
      <circle cx="41.5" cy="46.5" r="1" fill="#6A3418"/>
      <path d="M34 53 Q40 58 46 53" stroke="#6A3018" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <ellipse cx="40" cy="63" rx="10" ry="6" fill="#C09870"/>
      <ellipse cx="40" cy="73" rx="15" ry="12" fill="#C09870"/>
      <ellipse cx="40" cy="75" rx="10" ry="8" fill="#D4B490"/>
      <rect x="25" y="74" width="30" height="16" rx="5" fill="#1A9E8A"/>
      <rect x="25" y="74" width="30" height="4" rx="2" fill="#148A78"/>
      <line x1="31" y1="79" x2="30" y2="89" stroke="#12806E" strokeWidth="1" opacity=".5"/>
      <line x1="37" y1="80" x2="37" y2="90" stroke="#12806E" strokeWidth="1" opacity=".5"/>
      <line x1="43" y1="80" x2="43" y2="90" stroke="#12806E" strokeWidth="1" opacity=".5"/>
      <line x1="49" y1="79" x2="50" y2="89" stroke="#12806E" strokeWidth="1" opacity=".5"/>
      <path d="M26 68 Q13 75 13 83" stroke="#C09870" strokeWidth="6" strokeLinecap="round" fill="none"/>
      <path d="M54 68 Q67 75 67 83" stroke="#C09870" strokeWidth="6" strokeLinecap="round" fill="none"/>
      <ellipse cx="13" cy="84" rx="4.5" ry="3.5" fill="#C09870"/>
      <ellipse cx="67" cy="84" rx="4.5" ry="3.5" fill="#C09870"/>
      <ellipse cx="33" cy="93" rx="6" ry="3.5" fill="#C09870"/>
      <ellipse cx="47" cy="93" rx="6" ry="3.5" fill="#C09870"/>
      <ellipse cx="33" cy="97" rx="8.5" ry="2.5" fill="#7BBFAA"/>
      <ellipse cx="47" cy="97" rx="8.5" ry="2.5" fill="#7BBFAA"/>
      <line x1="33" y1="93" x2="33" y2="97" stroke="#5BA090" strokeWidth="1.2"/>
      <line x1="47" y1="93" x2="47" y2="97" stroke="#5BA090" strokeWidth="1.2"/>
    </svg>
  );
}

// ── Mini head for chat bubbles ───────────────────────────────────────────────
function GizmoHead({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="14 14 52 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M13 36 Q4 6 22 18 Q19 26 17 34 Z" fill="#6B4020"/>
      <path d="M14 34 Q7 10 21 20 Q18 27 17 33 Z" fill="#A87048"/>
      <path d="M67 36 Q76 6 58 18 Q61 26 63 34 Z" fill="#6B4020"/>
      <path d="M66 34 Q73 10 59 20 Q62 27 63 33 Z" fill="#A87048"/>
      <ellipse cx="40" cy="38" rx="27" ry="24" fill="#C09870"/>
      <ellipse cx="40" cy="24" rx="26" ry="5" fill="#7B5030" opacity=".45"/>
      <ellipse cx="40" cy="40" rx="21" ry="18" fill="#D4B490"/>
      <circle cx="27" cy="36" r="11" fill="white"/>
      <circle cx="53" cy="36" r="11" fill="white"/>
      <circle cx="27" cy="37" r="7.5" fill="#9B6A38"/>
      <circle cx="53" cy="37" r="7.5" fill="#9B6A38"/>
      <circle cx="27" cy="37" r="4.5" fill="#1A0C04"/>
      <circle cx="53" cy="37" r="4.5" fill="#1A0C04"/>
      <circle cx="29.5" cy="33.5" r="2" fill="white"/>
      <circle cx="55.5" cy="33.5" r="2" fill="white"/>
      <circle cx="27" cy="36" r="12.5" fill="none" stroke="#2A1A0A" strokeWidth="1.8"/>
      <circle cx="53" cy="36" r="12.5" fill="none" stroke="#2A1A0A" strokeWidth="1.8"/>
      <path d="M39.5 35 Q40 33 40.5 35" stroke="#2A1A0A" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      <ellipse cx="40" cy="46" rx="3.5" ry="2.5" fill="#8B4A28"/>
      <path d="M34 53 Q40 58 46 53" stroke="#6A3018" strokeWidth="2" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

// ── Typing indicator ─────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div style={{ display: "flex", gap: 4, padding: "10px 13px" }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 6, height: 6, borderRadius: "50%",
            background: GIZMO_ACCENT, opacity: 0.5,
            animation: `gizmo-dot 1.2s infinite ease-in-out`,
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────
export function GizmoTab({ open, onClose }: Props) {
  const salesVal   = useKpiStore((s) => s.sales.value);
  const netVal     = useKpiStore((s) => s.net.value);
  const tiles      = useKpiStore((s) => s.tiles);

  const laborTile = tiles.find((t) => t.key === "labor");
  const cogsTile  = tiles.find((t) => t.key === "cogs");

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState("");
  const [sending, setSending]   = useState(false);
  const [blink, setBlink]       = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const openedOnce = useRef(false);

  // Periodic blink
  useEffect(() => {
    const id = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 180);
    }, 3800);
    return () => clearInterval(id);
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  // Opening summary: fire once per mount of the open tab
  useEffect(() => {
    if (!open) {
      openedOnce.current = false;
      return;
    }
    if (openedOnce.current) return;
    openedOnce.current = true;

    // Reset messages for a fresh session each time the tab opens (per spec #5)
    setMessages([]);
    setSending(true);
    callGizmo([], "opening_summary").then(({ text }) => {
      setMessages([{ id: `g-${Date.now()}`, role: "gizmo", text }]);
      setSending(false);
    });
  }, [open]);

  async function sendMessage(text?: string) {
    const trimmed = (text ?? input).trim();
    if (!trimmed || sending) return;
    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", text: trimmed };
    if (!text) setInput("");
    const next = [...messages, userMsg];
    setMessages(next);
    setSending(true);

    const { text: reply, logged_note } = await callGizmo(next, "chat");
    setMessages((m) => [...m, { id: `g-${Date.now()}`, role: "gizmo", text: reply }]);
    setSending(false);

    // If Gizmo wrote a log note, mirror it into the store so the Log tab
    // updates instantly even if realtime hasn't delivered yet.
    if (logged_note) {
      useLogStore.setState((s) => {
        if (s.entries.some((e) => e.id === logged_note.id)) return s;
        return {
          entries: [
            { id: logged_note.id, timestamp: logged_note.created_at, text: logged_note.text, type: "gizmo" },
            ...s.entries,
          ],
        };
      });
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") void sendMessage();
  }

  return (
    <TabPanel open={open} onClose={onClose} title="Gizmo" accent={GIZMO_DARK}>
      {/* ── Avatar ───────────────────────────────────── */}
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        padding: "16px 18px 8px",
        background: "linear-gradient(180deg, rgba(26,158,138,0.08) 0%, transparent 100%)",
      }}>
        <GizmoCharacter size={110} blink={blink} />
        <div style={{
          fontFamily: coastal.fonts.condensed, fontSize: 20, fontWeight: 800,
          color: GIZMO_DARK, letterSpacing: ".04em", marginTop: 4,
        }}>
          GIZMO
        </div>
        <div style={{ fontFamily: coastal.fonts.manrope, fontSize: 11, color: "#8A9C9C", marginTop: 1 }}>
          your pocket restaurant analyst
        </div>
      </div>

      {/* ── Live snapshot chips ───────────────────────── */}
      <div style={{
        display: "flex", gap: 8, padding: "10px 18px 14px",
        overflowX: "auto", scrollbarWidth: "none",
      }}>
        {[
          { label: "Sales", val: salesVal > 0 ? `$${salesVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "--" },
          { label: "Labor", val: laborTile?.value ?? "--" },
          { label: "COGS",  val: cogsTile?.value  ?? "--" },
          { label: "Net",   val: netVal           },
        ].map((chip) => (
          <div key={chip.label} style={{
            flexShrink: 0, background: "#fff", borderRadius: 10,
            padding: "7px 12px",
            boxShadow: "0 1px 5px rgba(0,0,0,0.07)",
            border: "1px solid rgba(0,0,0,0.05)",
          }}>
            <div style={{ fontFamily: coastal.fonts.manrope, fontSize: 9, fontWeight: 700, color: "#8A9C9C", textTransform: "uppercase", letterSpacing: ".06em" }}>
              {chip.label}
            </div>
            <div style={{ fontFamily: coastal.fonts.condensed, fontSize: 16, fontWeight: 800, color: GIZMO_DARK, marginTop: 1 }}>
              {chip.val}
            </div>
          </div>
        ))}
      </div>

      {/* ── Chat messages ─────────────────────────────── */}
      <div style={{ padding: "0 18px 12px", display: "flex", flexDirection: "column", gap: 8, minHeight: 120 }}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              alignItems: "flex-end",
              gap: 8,
            }}
          >
            {msg.role === "gizmo" && (
              <div style={{
                width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                background: "rgba(26,158,138,0.10)",
                display: "flex", alignItems: "center", justifyContent: "center",
                overflow: "hidden",
              }}>
                <GizmoHead size={30} />
              </div>
            )}
            <div style={{
              maxWidth: "72%",
              background: msg.role === "gizmo" ? "#fff" : GIZMO_BUBBLE,
              color: msg.role === "gizmo" ? "#1A2E28" : "#fff",
              borderRadius: msg.role === "gizmo" ? "4px 14px 14px 14px" : "14px 4px 14px 14px",
              padding: "10px 13px",
              fontFamily: coastal.fonts.manrope,
              fontSize: 13,
              lineHeight: 1.5,
              boxShadow: "0 1px 5px rgba(0,0,0,0.08)",
              whiteSpace: "pre-wrap",
            }}>
              {msg.text}
            </div>
          </div>
        ))}

        {sending && (
          <div style={{ display: "flex", justifyContent: "flex-start", alignItems: "flex-end", gap: 8 }}>
            <div style={{
              width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
              background: "rgba(26,158,138,0.10)",
              display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
            }}>
              <GizmoHead size={30} />
            </div>
            <div style={{
              background: "#fff",
              borderRadius: "4px 14px 14px 14px",
              boxShadow: "0 1px 5px rgba(0,0,0,0.08)",
            }}>
              <TypingDots />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input bar ─────────────────────────────────── */}
      <div style={{
        padding: "8px 18px 28px",
        position: "sticky", bottom: 0,
        background: "#F2F7F6",
        borderTop: "1px solid rgba(0,0,0,0.06)",
      }}>
        <div style={{
          display: "flex", gap: 8, background: "#fff",
          borderRadius: 14, padding: "10px 14px",
          boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
          alignItems: "center",
        }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={sending ? "Gizmo is thinking…" : "Ask Gizmo anything…"}
            disabled={sending}
            style={{
              flex: 1, border: "none", outline: "none",
              background: "transparent",
              fontFamily: coastal.fonts.manrope,
              fontSize: 13, color: "#1A2E28",
            }}
          />
          <button
            onClick={() => void sendMessage()}
            disabled={!input.trim() || sending}
            style={{
              background: input.trim() && !sending ? GIZMO_ACCENT : "rgba(0,0,0,0.08)",
              color: input.trim() && !sending ? "#fff" : "#aaa",
              border: "none", borderRadius: 10,
              padding: "7px 14px",
              fontFamily: coastal.fonts.manrope, fontWeight: 800, fontSize: 11,
              cursor: input.trim() && !sending ? "pointer" : "default",
              letterSpacing: ".04em", transition: "background 0.2s",
            }}
          >
            SEND
          </button>
        </div>

        {/* Quick prompts */}
        <div style={{ display: "flex", gap: 6, marginTop: 8, overflowX: "auto", scrollbarWidth: "none" }}>
          {["How are sales?", "Recent invoices?", "This week vs last?", "Log something"].map((q) => (
            <button
              key={q}
              onClick={() => void sendMessage(q)}
              disabled={sending}
              style={{
                flexShrink: 0,
                background: "rgba(26,158,138,0.10)",
                color: GIZMO_DARK,
                border: `1px solid rgba(26,158,138,0.22)`,
                borderRadius: 20, padding: "5px 11px",
                fontFamily: coastal.fonts.manrope, fontSize: 10, fontWeight: 700,
                cursor: sending ? "default" : "pointer",
                whiteSpace: "nowrap",
                opacity: sending ? 0.5 : 1,
              }}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes gizmo-dot {
          0%, 80%, 100% { transform: scale(0.8); opacity: 0.4; }
          40%           { transform: scale(1.2); opacity: 1;   }
        }
      `}</style>
    </TabPanel>
  );
}

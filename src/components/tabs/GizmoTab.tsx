import { useState, useRef, useEffect } from "react";
import { TabPanel } from "./TabPanel";
import { useKpiStore } from "../../stores/useKpiStore";
import { coastal } from "../../theme/skins";

type Props = { open: boolean; onClose: () => void };

type Message = { id: string; role: "gizmo" | "user"; text: string };

// ── Brand colors ─────────────────────────────────────────────────────────────
const GIZMO_ACCENT = "#1A9E8A";   // teal from swim trunks
const GIZMO_DARK   = "#1A2E28";   // dark coastal
const GIZMO_BUBBLE = "#148A78";   // user bubble

// ── Full Gizmo character SVG (coastal skin) ──────────────────────────────────
function GizmoCharacter({ size = 120, blink = false }: { size?: number; blink?: boolean }) {
  const h = Math.round(size * 1.25); // maintain ~4:5 aspect ratio
  return (
    <svg width={size} height={h} viewBox="0 0 80 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Left ear */}
      <path d="M13 36 Q4 6 22 18 Q19 26 17 34 Z" fill="#6B4020"/>
      <path d="M14 34 Q7 10 21 20 Q18 27 17 33 Z" fill="#A87048"/>
      {/* Right ear */}
      <path d="M67 36 Q76 6 58 18 Q61 26 63 34 Z" fill="#6B4020"/>
      <path d="M66 34 Q73 10 59 20 Q62 27 63 33 Z" fill="#A87048"/>
      {/* Head */}
      <ellipse cx="40" cy="38" rx="27" ry="24" fill="#C09870"/>
      {/* Fur stripes */}
      <ellipse cx="40" cy="24" rx="26" ry="5" fill="#7B5030" opacity=".45"/>
      <ellipse cx="40" cy="32" rx="25" ry="3.5" fill="#7B5030" opacity=".28"/>
      {/* Face lighter area */}
      <ellipse cx="40" cy="40" rx="21" ry="18" fill="#D4B490"/>
      {/* Eye whites */}
      <circle cx="27" cy="36" r="11" fill="white"/>
      <circle cx="53" cy="36" r="11" fill="white"/>
      {/* Iris */}
      {blink ? (
        <>
          <rect x="19.5" y="34" width="15" height="3" rx="1.5" fill="#9B6A38"/>
          <rect x="45.5" y="34" width="15" height="3" rx="1.5" fill="#9B6A38"/>
        </>
      ) : (
        <>
          <circle cx="27" cy="37" r="7.5" fill="#9B6A38"/>
          <circle cx="53" cy="37" r="7.5" fill="#9B6A38"/>
          {/* Pupils */}
          <circle cx="27" cy="37" r="4.5" fill="#1A0C04"/>
          <circle cx="53" cy="37" r="4.5" fill="#1A0C04"/>
          {/* Eye shine */}
          <circle cx="29.5" cy="33.5" r="2" fill="white"/>
          <circle cx="55.5" cy="33.5" r="2" fill="white"/>
          <circle cx="24.5" cy="39" r=".9" fill="white" opacity=".5"/>
          <circle cx="50.5" cy="39" r=".9" fill="white" opacity=".5"/>
        </>
      )}
      {/* Nerdy glasses */}
      <circle cx="27" cy="36" r="12.5" fill="none" stroke="#2A1A0A" strokeWidth="1.8"/>
      <circle cx="53" cy="36" r="12.5" fill="none" stroke="#2A1A0A" strokeWidth="1.8"/>
      {/* Glasses bridge */}
      <path d="M39.5 35 Q40 33 40.5 35" stroke="#2A1A0A" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      {/* Glasses arms */}
      <line x1="14.5" y1="31" x2="11" y2="27" stroke="#2A1A0A" strokeWidth="1.3"/>
      <line x1="65.5" y1="31" x2="69" y2="27" stroke="#2A1A0A" strokeWidth="1.3"/>
      {/* Nose */}
      <ellipse cx="40" cy="46" rx="3.5" ry="2.5" fill="#8B4A28"/>
      <circle cx="38.5" cy="46.5" r="1" fill="#6A3418"/>
      <circle cx="41.5" cy="46.5" r="1" fill="#6A3418"/>
      {/* Smile */}
      <path d="M34 53 Q40 58 46 53" stroke="#6A3018" strokeWidth="2" fill="none" strokeLinecap="round"/>
      {/* Neck / chest */}
      <ellipse cx="40" cy="63" rx="10" ry="6" fill="#C09870"/>
      {/* Body */}
      <ellipse cx="40" cy="73" rx="15" ry="12" fill="#C09870"/>
      <ellipse cx="40" cy="75" rx="10" ry="8" fill="#D4B490"/>
      {/* Swim trunks */}
      <rect x="25" y="74" width="30" height="16" rx="5" fill="#1A9E8A"/>
      <rect x="25" y="74" width="30" height="4" rx="2" fill="#148A78"/>
      {/* Trunk stripes */}
      <line x1="31" y1="79" x2="30" y2="89" stroke="#12806E" strokeWidth="1" opacity=".5"/>
      <line x1="37" y1="80" x2="37" y2="90" stroke="#12806E" strokeWidth="1" opacity=".5"/>
      <line x1="43" y1="80" x2="43" y2="90" stroke="#12806E" strokeWidth="1" opacity=".5"/>
      <line x1="49" y1="79" x2="50" y2="89" stroke="#12806E" strokeWidth="1" opacity=".5"/>
      {/* Arms */}
      <path d="M26 68 Q13 75 13 83" stroke="#C09870" strokeWidth="6" strokeLinecap="round" fill="none"/>
      <path d="M54 68 Q67 75 67 83" stroke="#C09870" strokeWidth="6" strokeLinecap="round" fill="none"/>
      <ellipse cx="13" cy="84" rx="4.5" ry="3.5" fill="#C09870"/>
      <ellipse cx="67" cy="84" rx="4.5" ry="3.5" fill="#C09870"/>
      {/* Feet */}
      <ellipse cx="33" cy="93" rx="6" ry="3.5" fill="#C09870"/>
      <ellipse cx="47" cy="93" rx="6" ry="3.5" fill="#C09870"/>
      {/* Flip flops */}
      <ellipse cx="33" cy="97" rx="8.5" ry="2.5" fill="#7BBFAA"/>
      <ellipse cx="47" cy="97" rx="8.5" ry="2.5" fill="#7BBFAA"/>
      <line x1="33" y1="93" x2="33" y2="97" stroke="#5BA090" strokeWidth="1.2"/>
      <line x1="47" y1="93" x2="47" y2="97" stroke="#5BA090" strokeWidth="1.2"/>
    </svg>
  );
}

// ── Mini head for chat bubbles (head only, no body) ──────────────────────────
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

// ── Context-aware response engine ────────────────────────────────────────────
function getGizmoReply(input: string, ctx: {
  sales: number;
  laborPct: string;
  cogsPct: string;
  netPct: string;
  netDollars: number;
}): string {
  const q = input.toLowerCase();

  if (q.includes("sale") || q.includes("revenue") || q.includes("how much")) {
    if (ctx.sales === 0) return "Sales are still at zero — either we're not open yet or the Toast connection is warming up. Check back in a few! 🏄";
    return `Today's sales are sitting at $${ctx.sales.toLocaleString(undefined, { maximumFractionDigits: 0 })}. ${ctx.sales > 1500 ? "Solid day so far, keep it rolling! 🔥" : "Still early — there's time to push. 💪"}`;
  }

  if (q.includes("labor") || q.includes("staff") || q.includes("employee") || q.includes("payroll")) {
    const pct = parseFloat(ctx.laborPct);
    if (isNaN(pct)) return "I don't have labor data yet. Give it a minute to sync from Toast! 🏄";
    const msg = pct <= 28 ? "Labor is looking clean — great efficiency!" : pct <= 32 ? "Labor is in a good range, keep an eye on overtime." : "Labor is running a bit hot. Check if any shifts can be trimmed.";
    return `Labor is at ${ctx.laborPct}%. ${msg}`;
  }

  if (q.includes("cog") || q.includes("food cost") || q.includes("cost of goods")) {
    const pct = parseFloat(ctx.cogsPct);
    if (isNaN(pct)) return "COGS data isn't loaded yet. Hang tight! 🏄";
    const msg = pct <= 28 ? "COGS is excellent — tight purchasing and low waste." : pct <= 31 ? "COGS is healthy." : "COGS is trending high. Worth reviewing portion sizes and waste.";
    return `Food & bev cost is at ${ctx.cogsPct}. ${msg}`;
  }

  if (q.includes("net") || q.includes("profit") || q.includes("margin") || q.includes("making")) {
    const pct = parseFloat(ctx.netPct);
    if (isNaN(pct) || ctx.netDollars === 0) return "Net profit isn't calculated yet — sales need to come in first. Stay patient! 🏄";
    const dollars = `$${ctx.netDollars.toLocaleString()}`;
    const msg = pct >= 15 ? "That's a great margin — keep those costs tight!" : pct >= 8 ? "Decent margin. A few efficiency wins could push it higher." : pct >= 0 ? "Slim margin today. Worth digging into fixed costs or prime cost." : "We're upside-down right now. Let's get some sales flowing! 🚨";
    return `Net profit is ${ctx.netPct} (${dollars} today). ${msg}`;
  }

  if (q.includes("prime") || q.includes("prime cost")) {
    return "Prime cost is labor + COGS combined. Industry target is under 60%. Ask me about labor or COGS separately for more detail!";
  }

  if (q.includes("fixed") || q.includes("rent") || q.includes("overhead")) {
    return "Fixed costs include rent (10% of sales), amortized monthly bills like insurance, utilities, and your loan payment, plus any M&R logged today. Check the Fixed Cost tile for the live number!";
  }

  if (q.includes("hello") || q.includes("hey") || q.includes("hi") || q.includes("who are you") || q.includes("what are you")) {
    return "Hey! I'm Gizmo — your restaurant's pocket analyst. Ask me about sales, labor, COGS, net profit, or anything going on with the business today. I'm plugged into your live data! 🏄";
  }

  if (q.includes("help") || q.includes("what can you")) {
    return "I can talk you through: Sales today, Labor %, COGS / food cost, Net profit, Prime cost, and Fixed costs. Just ask naturally — I'll pull from your live Toast data!";
  }

  if (q.includes("tip") || q.includes("advice") || q.includes("suggest") || q.includes("improve")) {
    const tips = [
      "Watch your labor on slow afternoons — that's usually where the percentage creeps up. 👀",
      "Review your top-selling items and make sure the COGS on those is as lean as possible.",
      "Third-party delivery eats ~18% in commissions. Nudge guests toward direct ordering! 📱",
      "Comps and voids add up fast. A quick weekly audit keeps that number honest.",
      "On a slow day, a well-timed special or happy hour can move the sales needle quickly.",
    ];
    return tips[Math.floor(Math.random() * tips.length)];
  }

  if (q.includes("slow") || q.includes("quiet") || q.includes("dead")) {
    return "Slow spells happen. Consider running a quick special, pushing a social post, or prepping for the next rush. Every dollar of sales improves every percentage on the board! 💪";
  }

  const fallbacks = [
    "Hmm, not sure about that one — try asking about sales, labor, COGS, or profit and I'll break it down! 🏄",
    "That's outside my wheelhouse right now, but ask me about the live numbers and I'll help!",
    "I heard you, but I'm only connected to restaurant data for now. Ask me something about sales or costs!",
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

// ── Component ────────────────────────────────────────────────────────────────
export function GizmoTab({ open, onClose }: Props) {
  const salesVal   = useKpiStore((s) => s.sales.value);
  const netVal     = useKpiStore((s) => s.net.value);
  const netDollars = useKpiStore((s) => s.net.dollars);
  const tiles      = useKpiStore((s) => s.tiles);

  const laborTile = tiles.find((t) => t.key === "labor");
  const cogsTile  = tiles.find((t) => t.key === "cogs");

  const ctx = {
    sales:     salesVal,
    laborPct:  laborTile?.value ?? "--",
    cogsPct:   cogsTile?.value  ?? "--",
    netPct:    netVal,
    netDollars,
  };

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "intro",
      role: "gizmo",
      text: "Hey! I'm Gizmo — your restaurant's pocket analyst. Ask me anything about today's numbers 🏄",
    },
  ]);
  const [input, setInput]   = useState("");
  const [blink, setBlink]   = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Periodic blink
  useEffect(() => {
    const id = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 180);
    }, 3800);
    return () => clearInterval(id);
  }, []);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function sendMessage(text?: string) {
    const trimmed = (text ?? input).trim();
    if (!trimmed) return;
    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", text: trimmed };
    if (!text) setInput("");
    setMessages((m) => [...m, userMsg]);
    setTimeout(() => {
      setMessages((m) => [...m, {
        id: `g-${Date.now()}`,
        role: "gizmo",
        text: getGizmoReply(trimmed, ctx),
      }]);
    }, 600);
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") sendMessage();
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
          { label: "Labor", val: ctx.laborPct },
          { label: "COGS",  val: ctx.cogsPct  },
          { label: "Net",   val: netVal        },
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
            }}>
              {msg.text}
            </div>
          </div>
        ))}
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
            placeholder="Ask Gizmo anything…"
            style={{
              flex: 1, border: "none", outline: "none",
              background: "transparent",
              fontFamily: coastal.fonts.manrope,
              fontSize: 13, color: "#1A2E28",
            }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim()}
            style={{
              background: input.trim() ? GIZMO_ACCENT : "rgba(0,0,0,0.08)",
              color: input.trim() ? "#fff" : "#aaa",
              border: "none", borderRadius: 10,
              padding: "7px 14px",
              fontFamily: coastal.fonts.manrope, fontWeight: 800, fontSize: 11,
              cursor: input.trim() ? "pointer" : "default",
              letterSpacing: ".04em", transition: "background 0.2s",
            }}
          >
            SEND
          </button>
        </div>

        {/* Quick prompts */}
        <div style={{ display: "flex", gap: 6, marginTop: 8, overflowX: "auto", scrollbarWidth: "none" }}>
          {["How are sales?", "Labor check", "Any tips?", "Net profit?"].map((q) => (
            <button
              key={q}
              onClick={() => sendMessage(q)}
              style={{
                flexShrink: 0,
                background: "rgba(26,158,138,0.10)",
                color: GIZMO_DARK,
                border: `1px solid rgba(26,158,138,0.22)`,
                borderRadius: 20, padding: "5px 11px",
                fontFamily: coastal.fonts.manrope, fontSize: 10, fontWeight: 700,
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    </TabPanel>
  );
}

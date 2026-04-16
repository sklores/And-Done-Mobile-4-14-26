import { useState, useMemo, useRef } from "react";
import { coastal, tileForScore } from "../theme/skins";

export type FeedKey = "reviews" | "bank" | "social" | "events";

const PX_PER_CHAR = 7;

// Mock scores — wire to real data sources when APIs are connected
const FEED_SCORES: Record<FeedKey, number> = {
  reviews: 8,   // 4.8★ excellent
  bank:    6,   // normal transactions, nothing alarming
  social:  4,   // below follower target — alert
  events:  5,   // some events need attention
};

const FEEDS: Record<FeedKey, string[]> = {
  reviews: [
    "★★★★★ \"Best grilled cheese in DC\" — Sarah M.",
    "★★★★★ \"Cozy vibe and fast service\" — Jon P.",
    "★★★★☆ \"Loved the tomato soup pairing\" — Aly R.",
  ],
  bank: [
    "Toast deposit +$1,295",
    "US Foods -$487",
    "Toast payroll -$847",
    "Unknown ACH -$890 ⚠",
  ],
  social: [
    "+142 followers this week",
    "Instagram story views trending up",
    "Mentioned by @dceats earlier today",
  ],
  events: [
    "Patio brunch Sat 10a — staff confirmed",
    "Live music Thu 7pm — performer not confirmed ⚠",
    "Trivia Tuesday 7pm — host booked",
  ],
};

const FEED_LABELS: Record<FeedKey, string> = {
  reviews: "Reviews",
  bank:    "Bank",
  social:  "Social",
  events:  "Events",
};

type Props = {
  onLongPress: (key: FeedKey) => void;
};

export function MarqueeFeed({ onLongPress }: Props) {
  const [active, setActive] = useState<Record<FeedKey, boolean>>({
    reviews: true,
    bank:    true,
    social:  true,
    events:  false,
  });
  const [paused, setPaused] = useState(false);

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress   = useRef(false);

  const items: string[] = [];
  (Object.keys(active) as FeedKey[]).forEach((k) => {
    if (active[k]) items.push(...FEEDS[k]);
  });
  const line = items.length ? items.join("   •   ") : "No feeds selected";

  const duration = useMemo(() => {
    const totalPx = line.length * PX_PER_CHAR;
    const seconds = totalPx / 80;
    return `${Math.max(seconds, 8).toFixed(1)}s`;
  }, [line]);

  const toggle = (k: FeedKey) => setActive((a) => ({ ...a, [k]: !a[k] }));

  const handlePointerDown = (k: FeedKey) => {
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      onLongPress(k);
    }, 500);
  };

  const handlePointerUp = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const handleClick = (k: FeedKey) => {
    if (!didLongPress.current) toggle(k);
  };

  return (
    <div style={{ background: coastal.marquee.bg, fontFamily: coastal.fonts.manrope, marginTop: 8 }}>
      {/* Scrolling text */}
      <div
        onClick={() => setPaused((p) => !p)}
        style={{
          overflow: "hidden",
          whiteSpace: "nowrap",
          padding: "8px 0",
          color: coastal.marquee.text,
          fontSize: 12,
          fontWeight: 500,
          cursor: "pointer",
          userSelect: "none",
          letterSpacing: ".01em",
        }}
      >
        <div
          style={{
            display: "inline-block",
            paddingLeft: "100%",
            animation: `marquee ${duration} linear infinite`,
            animationPlayState: paused ? "paused" : "running",
          }}
        >
          {line}
        </div>
      </div>

      {/* Feed chips */}
      <div style={{
        display: "flex",
        gap: 6,
        padding: "4px 8px 8px",
      }}>
        {(Object.keys(FEEDS) as FeedKey[]).map((k) => {
          const on      = active[k];
          const score   = FEED_SCORES[k];
          const palette = tileForScore(score);
          const statusLabels: Record<number, string> = {
            8: "Excellent", 7: "Good", 6: "Watch",
            5: "Caution",  4: "Alert", 3: "Bad", 2: "Critical", 1: "Critical",
          };
          return (
            <button
              key={k}
              onPointerDown={() => handlePointerDown(k)}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              onContextMenu={(e) => e.preventDefault()}
              onClick={() => handleClick(k)}
              style={{
                flex: 1,
                height: 46,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 3,
                background: on ? palette.bg : "#D4D8DC",
                color: on ? palette.label : "#8A9C9C",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                padding: 0,
                transition: "background 0.15s ease, opacity 0.15s ease",
                opacity: on ? 1 : 0.7,
                WebkitTapHighlightColor: "transparent",
                userSelect: "none",
              }}
            >
              <span style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: ".08em",
                textTransform: "uppercase",
                fontFamily: coastal.fonts.manrope,
              }}>
                {FEED_LABELS[k]}
              </span>
              <span style={{
                fontSize: 8,
                fontWeight: 700,
                letterSpacing: ".05em",
                textTransform: "uppercase",
                opacity: on ? 0.75 : 0.5,
              }}>
                {statusLabels[score]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

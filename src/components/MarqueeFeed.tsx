import { useState, useMemo } from "react";
import { coastal } from "../theme/skins";

type FeedKey = "reviews" | "sales" | "social" | "events";

// Pixels per character — controls scroll speed regardless of content length
const PX_PER_CHAR = 7;

const FEEDS: Record<FeedKey, string[]> = {
  reviews: [
    "★★★★★ \"Best grilled cheese in DC\" — Sarah M.",
    "★★★★★ \"Cozy vibe and fast service\" — Jon P.",
    "★★★★☆ \"Loved the tomato soup pairing\" — Aly R.",
  ],
  sales: [
    "Top item today: Classic Grilled Cheese",
    "Bar mix holding steady at 22% of sales",
    "Online orders up vs yesterday",
  ],
  social: [
    "+142 followers this week",
    "Instagram story views trending up",
    "Mentioned by @dceats earlier today",
  ],
  events: [
    "Patio brunch Saturday 10a",
    "Live music Thursday night",
    "Trivia Tuesday — 7pm",
  ],
};

export function MarqueeFeed() {
  const [active, setActive] = useState<Record<FeedKey, boolean>>({
    reviews: true,
    sales: true,
    social: true,
    events: false,
  });
  const [paused, setPaused] = useState(false);

  const items: string[] = [];
  (Object.keys(active) as FeedKey[]).forEach((k) => {
    if (active[k]) items.push(...FEEDS[k]);
  });
  const line = items.length ? items.join("   •   ") : "No feeds selected";

  // Duration scales with text length so speed stays constant
  const duration = useMemo(() => {
    const totalPx = line.length * PX_PER_CHAR;
    const seconds = totalPx / 80; // 80px per second
    return `${Math.max(seconds, 8).toFixed(1)}s`;
  }, [line]);

  const toggle = (k: FeedKey) => setActive((a) => ({ ...a, [k]: !a[k] }));

  return (
    <div style={{ background: coastal.marquee.bg, fontFamily: coastal.fonts.manrope }}>
      <div
        onClick={() => setPaused((p) => !p)}
        style={{
          overflow: "hidden",
          whiteSpace: "nowrap",
          padding: "11px 0",
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
      <div style={{ display: "flex", gap: 4, padding: "4px 6px 6px", justifyContent: "space-between" }}>
        {(Object.keys(FEEDS) as FeedKey[]).map((k) => {
          const on = active[k];
          return (
            <button
              key={k}
              onClick={() => toggle(k)}
              style={{
                flex: 1,
                background: on ? coastal.toggle.onBg : coastal.toggle.offBg,
                color: on ? coastal.toggle.onColor : coastal.toggle.offColor,
                border: "none",
                borderRadius: 6,
                padding: "5px 0",
                fontSize: 9,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: ".08em",
                cursor: "pointer",
              }}
            >
              {k}
            </button>
          );
        })}
      </div>
    </div>
  );
}

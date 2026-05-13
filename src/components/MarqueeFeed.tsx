import { useState, useRef, useEffect } from "react";
import { coastal, tileForScore } from "../theme/skins";
import { FEED_SCORES } from "../data/feedScores";
import { useIsDusky } from "../hooks/useTimeOfDay";

export type FeedKey = "reviews" | "bank" | "social" | "events";

const PX_PER_SEC = 22;      // auto-scroll speed
const RESUME_AFTER_MS = 1800; // how long to wait after user interaction before resuming auto-scroll

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
  /** Per-feed score overrides — falls back to FEED_SCORES if not provided. */
  scoreOverrides?: Partial<Record<FeedKey, number>>;
};

export function MarqueeFeed({ onLongPress, scoreOverrides }: Props) {
  // At night the tan driftwood border + pale bg reads as a bright "blue
  // bar" above the tab bar (the saturation filter applied to this chrome
  // section turns the tan into a grey-blue stripe). Swap to the deep
  // ocean colors so the marquee blends into the nocturnal palette.
  const isDusky = useIsDusky();
  const marqueeBorder = isDusky ? "#10243A" : "#C4B090";
  const marqueeBg     = isDusky ? "#081828" : coastal.marquee.bg;
  const marqueeText   = isDusky ? "#D8E0F0" : coastal.marquee.text;
  const [active, setActive] = useState<Record<FeedKey, boolean>>({
    reviews: true,
    bank:    true,
    social:  true,
    events:  true,
  });

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress   = useRef(false);

  const items: string[] = [];
  (Object.keys(active) as FeedKey[]).forEach((k) => {
    if (active[k]) items.push(...FEEDS[k]);
  });
  const line = items.length ? items.join("   •   ") : "No feeds selected";

  // ── Ticker refs: transform-based animation, unified pointer drag ─────────
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef    = useRef<HTMLDivElement>(null);
  const posRef      = useRef(0);                       // current translateX offset (positive = shifted left)
  const halfRef     = useRef(0);                       // half of track width (one content copy)
  const pausedRef   = useRef(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragging    = useRef(false);
  const dragStartX  = useRef(0);
  const dragStartPos = useRef(0);
  const maxDragDist = useRef(0);     // how far the pointer moved during this press — distinguishes tap vs drag
  const userPaused  = useRef(false); // sticky pause toggled by tap

  const TAP_SLOP_PX = 5;             // movement under this = tap, not drag

  const scheduleResume = () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => {
      if (!userPaused.current) pausedRef.current = false;
    }, RESUME_AFTER_MS);
  };

  const wrap = (n: number): number => {
    const h = halfRef.current;
    if (h <= 0) return n;
    return ((n % h) + h) % h;
  };

  const applyTransform = () => {
    const t = trackRef.current;
    if (t) t.style.transform = `translate3d(${-posRef.current}px, 0, 0)`;
  };

  // rAF auto-scroll loop — mutates DOM directly, no React rerenders.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = Math.min((t - last) / 1000, 0.1);
      last = t;
      halfRef.current = track.scrollWidth / 2;
      if (!pausedRef.current && !dragging.current && halfRef.current > 0) {
        posRef.current = wrap(posRef.current + PX_PER_SEC * dt);
        applyTransform();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [line]);

  // Unified pointer handlers (touch + mouse + pen via Pointer Events).
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    dragStartX.current = e.clientX;
    dragStartPos.current = posRef.current;
    maxDragDist.current = 0;
    pausedRef.current = true;
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    viewportRef.current?.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const dx = e.clientX - dragStartX.current;
    const absDx = Math.abs(dx);
    if (absDx > maxDragDist.current) maxDragDist.current = absDx;
    posRef.current = wrap(dragStartPos.current - dx);
    applyTransform();
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    viewportRef.current?.releasePointerCapture(e.pointerId);
    // Tap (barely moved) → toggle sticky pause
    if (maxDragDist.current < TAP_SLOP_PX) {
      userPaused.current = !userPaused.current;
      pausedRef.current = userPaused.current;
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    } else {
      // Was a drag → resume auto after a beat (unless user has sticky-paused)
      scheduleResume();
    }
  };

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
    <div style={{ fontFamily: coastal.fonts.manrope }}>
      {/* Scrolling text — framed in driftwood, same width as KpiBar */}
      <div style={{
        margin: "8px 10px 0",
        border: `3px solid ${marqueeBorder}`,
        borderRadius: 10,
        overflow: "hidden",
        boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
        background: marqueeBg,
        transition: "background 1.2s ease, border-color 1.2s ease",
      }}>
        <div
          ref={viewportRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{
            overflow: "hidden",
            padding: "8px 0",
            color: marqueeText,
            fontSize: 12,
            fontWeight: 500,
            cursor: "grab",
            userSelect: "none",
            letterSpacing: ".01em",
            touchAction: "pan-y", // let vertical page scroll pass through; we handle horizontal
          }}
        >
          <div
            ref={trackRef}
            style={{
              display: "inline-block",
              whiteSpace: "nowrap",
              willChange: "transform",
            }}
          >
            {/* Duplicated for seamless loop — rAF wraps at half-width */}
            <span style={{ paddingRight: 40 }}>{line}</span>
            <span style={{ paddingRight: 40 }}>{line}</span>
          </div>
        </div>
      </div>

      {/* Feed chips — unframed, same side margins as KpiBar */}
      <div style={{
        display: "flex",
        gap: 6,
        padding: "6px 10px 8px",
      }}>
        {(Object.keys(FEEDS) as FeedKey[]).map((k) => {
          const on      = active[k];
          const score   = scoreOverrides?.[k] ?? FEED_SCORES[k];
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

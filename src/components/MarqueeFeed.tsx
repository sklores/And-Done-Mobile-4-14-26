import { useState, useRef, useEffect } from "react";
import { coastal, tileForScore } from "../theme/skins";
import { FEED_SCORES } from "../data/feedScores";

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
};

export function MarqueeFeed({ onLongPress }: Props) {
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

  // ── Scrollable ticker refs/state ─────────────────────────────────────────
  const scrollRef   = useRef<HTMLDivElement>(null);
  const trackRef    = useRef<HTMLDivElement>(null);
  const pausedRef   = useRef(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragging    = useRef(false);
  const dragStartX  = useRef(0);
  const dragStartScroll = useRef(0);
  const isAutoScrolling = useRef(false); // suppresses our own scroll-event pauses

  const schedulePause = () => {
    pausedRef.current = true;
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
  };
  const scheduleResume = () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => {
      pausedRef.current = false;
    }, RESUME_AFTER_MS);
  };

  // Auto-scroll via rAF: nudges scrollLeft each frame, loops seamlessly at
  // half the track width (content is duplicated for a continuous loop).
  useEffect(() => {
    const el = scrollRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;
      if (!pausedRef.current && !dragging.current) {
        const half = track.scrollWidth / 2;
        if (half > 0) {
          isAutoScrolling.current = true;
          let next = el.scrollLeft + PX_PER_SEC * dt;
          if (next >= half) next -= half;
          el.scrollLeft = next;
          isAutoScrolling.current = false;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [line]);

  // Touch: native pan-x handles scrolling. We just pause while finger down.
  const handleTouchStart = () => schedulePause();
  const handleTouchEnd   = () => scheduleResume();

  // Mouse: implement click-drag since native overflow doesn't drag with mouse.
  const handleTickerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    dragging.current = true;
    dragStartX.current = e.clientX;
    dragStartScroll.current = scrollRef.current?.scrollLeft ?? 0;
    schedulePause();
    scrollRef.current?.setPointerCapture(e.pointerId);
  };
  const handleTickerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current || !scrollRef.current) return;
    const track = trackRef.current;
    const half = track ? track.scrollWidth / 2 : 0;
    let next = dragStartScroll.current - (e.clientX - dragStartX.current);
    if (half > 0) {
      // wrap so drag never hits an edge
      next = ((next % half) + half) % half;
    }
    scrollRef.current.scrollLeft = next;
  };
  const handleTickerPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    scrollRef.current?.releasePointerCapture(e.pointerId);
    scheduleResume();
  };

  // Catch mouse wheel / trackpad horizontal flick → pause while user scrolls.
  const handleScroll = () => {
    if (isAutoScrolling.current) return;
    schedulePause();
    scheduleResume();
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
        border: "3px solid #C4B090",
        borderRadius: 10,
        overflow: "hidden",
        boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
        background: coastal.marquee.bg,
      }}>
        <div
          ref={scrollRef}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          onPointerDown={handleTickerPointerDown}
          onPointerMove={handleTickerPointerMove}
          onPointerUp={handleTickerPointerUp}
          onPointerCancel={handleTickerPointerUp}
          onScroll={handleScroll}
          style={{
            overflowX: "auto",
            overflowY: "hidden",
            whiteSpace: "nowrap",
            padding: "8px 0",
            color: coastal.marquee.text,
            fontSize: 12,
            fontWeight: 500,
            cursor: dragging.current ? "grabbing" : "grab",
            userSelect: "none",
            letterSpacing: ".01em",
            touchAction: "pan-x",
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "none",
          }}
          className="cs-ticker-scroll"
        >
          <div
            ref={trackRef}
            style={{
              display: "inline-block",
              whiteSpace: "nowrap",
            }}
          >
            {/* Duplicated for seamless loop — rAF resets scrollLeft at half-width */}
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

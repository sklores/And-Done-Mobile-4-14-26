import { useEffect, useState } from "react";
import { Scene } from "./Scene";
import type { WeatherCondition } from "./CoastalScene";

// Fullscreen landscape vista — opened by triple-tapping the framed scene.
//
// Phones won't let a web page force a physical orientation change, so we
// rotate the CONTENT 90° instead: the container is sized viewport-height ×
// viewport-width, then rotated, which lands it exactly filling the screen.
// If the phone is ALREADY physically landscape we skip the rotation and
// just fill — so rotating the handset while this is open does the right
// thing in both directions.
//
// The scene itself is the same <Scene> the dashboard renders (live KPI
// hooks, weather, time of day, active skin) — nothing is duplicated. Its
// root div normally carries a 375/200 aspect-ratio; inside here we override
// that to 100%×100% so the SVG's preserveAspectRatio="slice" crops to fill.

interface Props {
  open: boolean;
  onClose: () => void;
  weather?: WeatherCondition;
  /** Live Reviews score 1-8 — kept in sync with the dashboard scene. */
  reviewsScore?: number
  beamPulseKey?: number;
}

const CSS = `
@keyframes fs-in   { from { opacity: 0 } to { opacity: 1 } }
@keyframes fs-hint { 0%,12% { opacity: 0 } 26%,62% { opacity: .85 } 100% { opacity: 0 } }
.fs-overlay { animation: fs-in .28s ease-out both; }
/* Scenes render <div style="aspect-ratio:375/200"><svg .../></div>.
   Fill the rotated stage instead so the SVG slices edge to edge.
   NB: scoped to .fs-scene — a broader ".fs-stage > div" also matched the
   close button + hint and blew them up to full-screen. */
.fs-scene { position: absolute; inset: 0; }
.fs-scene > div { width: 100% !important; height: 100% !important; aspect-ratio: auto !important; }
`;

export function FullscreenScene({ open, onClose, weather, beamPulseKey, reviewsScore }: Props) {
  // Rotate only when the handset is portrait; if it's already landscape the
  // scene fills directly (no double-rotation).
  const [portrait, setPortrait] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(orientation: portrait)");
    const sync = () => setPortrait(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, [open]);

  // Lock page scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Esc closes (desktop)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Mount only while open so we never run a second scene animation in the
  // background.
  if (!open) return null;

  const stage: React.CSSProperties = portrait
    ? { width: "100dvh", height: "100dvw", transform: "translate(-50%,-50%) rotate(90deg)" }
    : { width: "100dvw", height: "100dvh", transform: "translate(-50%,-50%)" };

  return (
    <div
      className="fs-overlay"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        background: "#000",
        overflow: "hidden",
        touchAction: "none",
      }}
    >
      <style>{CSS}</style>

      <div
        className="fs-stage"
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transformOrigin: "center center",
          overflow: "hidden",
          ...stage,
        }}
      >
        <div className="fs-scene">
          <Scene weather={weather} beamPulseKey={beamPulseKey} reviewsScore={reviewsScore} />
        </div>

        {/* Close affordance — lives inside the rotated stage so it reads
            upright in the landscape view. Safe-area padded for notches. */}
        <div
          role="button"
          aria-label="Exit fullscreen"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          style={{
            position: "absolute",
            top: "calc(12px + env(safe-area-inset-top))",
            right: "calc(12px + env(safe-area-inset-right))",
            width: 34,
            height: 34,
            borderRadius: "50%",
            background: "rgba(0,0,0,0.34)",
            backdropFilter: "blur(3px)",
            WebkitBackdropFilter: "blur(3px)",
            color: "rgba(255,255,255,0.92)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 17,
            fontWeight: 700,
            lineHeight: 1,
            cursor: "pointer",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
        >
          ×
        </div>

        {/* Fading hint — tells you how to get out, then gets out of the way */}
        <div
          style={{
            position: "absolute",
            bottom: "calc(14px + env(safe-area-inset-bottom))",
            left: 0,
            right: 0,
            textAlign: "center",
            fontFamily: "'Manrope', sans-serif",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: ".18em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.9)",
            textShadow: "0 1px 4px rgba(0,0,0,0.55)",
            pointerEvents: "none",
            animation: "fs-hint 4.2s ease-in-out both",
          }}
        >
          Tap anywhere to exit
        </div>
      </div>
    </div>
  );
}

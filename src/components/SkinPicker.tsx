import { SKIN_IDS, SKINS, useSkin, useSkinStore } from "../theme/skins";
import type { SkinId } from "../theme/skins";

// Skin picker — opened by long-pressing the scenic vista. Four cards, one
// per skin, each rendered in its own accent + display font. Tap = live
// swap (persisted per-device via the skin store's localStorage write).

type Props = { open: boolean; onClose: () => void };

const VIBE: Record<SkinId, string> = {
  coastal:  "Early morning coastal mist — calm, purposeful",
  lemans:   "Sarthe circuit at dawn — classic, precise",
  nostromo: "BUILDING BETTER WORLDS",
  newyork:  "Manhattan at night — relentless, alive",
};

export function SkinPicker({ open, onClose }: Props) {
  const skin = useSkin();
  const setSkin = useSkinStore((s) => s.setSkin);

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.45)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.22s ease",
          zIndex: 120,
        }}
      />

      {/* Sheet */}
      <div
        style={{
          position: "fixed",
          bottom: 0, left: "50%",
          transform: `translateX(-50%) translateY(${open ? "0%" : "100%"})`,
          transition: "transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)",
          width: 375,
          maxWidth: "100vw",
          background: skin.sheetBg,
          borderRadius: "18px 18px 0 0",
          overflow: "hidden",
          zIndex: 121,
          boxShadow: open ? "0 -8px 40px rgba(0,0,0,0.25)" : "none",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div style={{ padding: "14px 18px 6px" }}>
          <div style={{ width: 36, height: 4, background: "rgba(0,0,0,0.15)", borderRadius: 2, margin: "0 auto 12px" }} />
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: ".12em",
              textTransform: "uppercase",
              color: "#8A9C9C",
              fontFamily: skin.fonts.body,
              marginBottom: 10,
            }}
          >
            Choose a skin
          </div>
        </div>

        <div style={{ padding: "0 14px 18px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {SKIN_IDS.map((id) => {
            const s = SKINS[id];
            const isActive = id === skin.id;
            return (
              <div
                key={id}
                role="button"
                tabIndex={0}
                onClick={() => { setSkin(id); onClose(); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSkin(id); onClose(); }
                }}
                style={{
                  borderRadius: 12,
                  padding: "12px 12px 10px",
                  background: s.selector.bg,
                  color: s.selector.color,
                  cursor: "pointer",
                  userSelect: "none",
                  border: isActive ? "2.5px solid #1A2E28" : "2.5px solid transparent",
                  boxShadow: isActive ? "0 0 0 2px rgba(255,255,255,.7) inset" : "none",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    fontFamily: s.fonts.display,
                    fontStyle: s.fonts.displayItalic ? "italic" : "normal",
                    fontSize: 20,
                    fontWeight: 800,
                    lineHeight: 1.05,
                    letterSpacing: id === "nostromo" ? ".02em" : ".01em",
                  }}
                >
                  {s.name}
                </div>
                <div
                  style={{
                    fontFamily: s.fonts.body,
                    fontSize: 8.5,
                    marginTop: 5,
                    opacity: 0.85,
                    lineHeight: 1.35,
                    minHeight: 23,
                  }}
                >
                  {VIBE[id]}
                </div>
                {/* palette dots */}
                <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                  {[s.spectrum[7].bg, s.spectrum[4].bg, s.spectrum[1].bg, s.chrome.frame].map((c, i) => (
                    <span
                      key={i}
                      style={{
                        width: 10, height: 10, borderRadius: "50%",
                        background: c,
                        border: "1px solid rgba(0,0,0,.2)",
                        display: "inline-block",
                      }}
                    />
                  ))}
                </div>
                {isActive && (
                  <span
                    style={{
                      position: "absolute", top: 8, right: 10,
                      fontSize: 12, fontWeight: 800,
                      fontFamily: s.fonts.body,
                    }}
                  >
                    ✓
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

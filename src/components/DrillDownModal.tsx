import { useEffect } from "react";
import { useSkin, tileForScore } from "../theme/skins";

type Props = {
  open: boolean;
  onClose: () => void;
  score: number;
  label: string;
  value: string;
  status: string;
  children: React.ReactNode;
};

export function DrillDownModal({ open, onClose, score, label, value, status, children }: Props) {
  const skin = useSkin();
  const palette = tileForScore(score);

  // Lock body scroll when open
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

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
          zIndex: 100,
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
          zIndex: 101,
          boxShadow: open ? "0 -8px 40px rgba(0,0,0,0.18)" : "none",
        }}
      >
        {/* Header — tile color */}
        <div
          style={{
            background: palette.bg,
            padding: "20px 18px 16px",
            position: "relative",
          }}
        >
          {/* Close pill */}
          <div
            onClick={onClose}
            style={{
              position: "absolute", top: 10, right: 14,
              width: 28, height: 28,
              background: "rgba(0,0,0,0.12)",
              borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
              fontSize: 14, color: palette.label, fontWeight: 700,
            }}
          >
            ×
          </div>

          {/* Drag handle */}
          <div style={{ width: 36, height: 4, background: "rgba(0,0,0,0.15)", borderRadius: 2, margin: "0 auto 14px" }} />

          <div style={{ color: palette.label, fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 4 }}>
            {label}
          </div>
          <div style={{ color: palette.value, fontSize: 36, fontWeight: 800, fontFamily: skin.fonts.display, fontStyle: skin.fonts.displayItalic ? "italic" : undefined, lineHeight: 1 }}>
            {value}
          </div>
          <div style={{ color: palette.statusText, fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", marginTop: 4 }}>
            {status}
          </div>
        </div>

        {/* Content rows — scrollable */}
        <div style={{ padding: "8px 0 32px", background: skin.sheetBg, overflowY: "auto", maxHeight: "55vh" }}>
          {children}
        </div>
      </div>
    </>
  );
}

type RowProps = { label: string; value: string; sub?: string; dimmed?: boolean };

export function DrillRow({ label, value, sub, dimmed }: RowProps) {
  const skin = useSkin();
  return (
    <div
      style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "13px 18px",
        borderBottom: `1px solid rgba(0,0,0,0.06)`,
        opacity: dimmed ? 0.45 : 1,
      }}
    >
      <div style={{ fontFamily: skin.fonts.body, fontSize: 12, fontWeight: 600, color: "#4A5A54" }}>
        {label}
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontFamily: skin.fonts.display, fontStyle: skin.fonts.displayItalic ? "italic" : undefined, fontSize: 18, fontWeight: 700, color: "#1A2E28" }}>
          {value}
        </div>
        {sub && (
          <div style={{ fontFamily: skin.fonts.body, fontSize: 10, color: "#8A9C9C", marginTop: 1 }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect } from "react";
import { coastal } from "../../theme/skins";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  accent?: string;
  children: React.ReactNode;
};

export function TabPanel({ open, onClose, title, accent = "#1A2E28", children }: Props) {
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.55)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.24s ease",
          zIndex: 200,
        }}
      />
      <div
        style={{
          position: "fixed",
          bottom: 0, left: "50%",
          transform: `translateX(-50%) translateY(${open ? "0%" : "100%"})`,
          transition: "transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
          width: 375,
          maxWidth: "100vw",
          height: "88vh",
          background: "#F2F7F6",
          borderRadius: "20px 20px 0 0",
          overflow: "hidden",
          zIndex: 201,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.2)",
        }}
      >
        {/* Header */}
        <div style={{
          background: accent,
          padding: "14px 18px 14px",
          flexShrink: 0,
        }}>
          <div style={{ width: 36, height: 4, background: "rgba(255,255,255,0.2)", borderRadius: 2, margin: "0 auto 14px" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ color: "#fff", fontSize: 18, fontWeight: 800, fontFamily: coastal.fonts.condensed, letterSpacing: ".04em" }}>
              {title}
            </div>
            <div
              onClick={onClose}
              style={{
                width: 28, height: 28,
                background: "rgba(255,255,255,0.15)",
                borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", fontSize: 16, color: "#fff", fontWeight: 700,
              }}
            >×</div>
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", background: "#F2F7F6" }}>
          {children}
        </div>
      </div>
    </>
  );
}

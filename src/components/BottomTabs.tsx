import { coastal } from "../theme/skins";

export type TabKey = "invoices" | "log" | "gizmo";

type Props = {
  onOpen: (k: TabKey) => void;
};

type TabDef = {
  key: TabKey;
  label: string;
  icon: string;
  bg: string;
  color: string;
};

const TABS: TabDef[] = [
  { key: "invoices", label: "Invoices", icon: "📋", bg: "#2A3C48",     color: "#fff" },
  { key: "log",      label: "Log",      icon: "📝", bg: "#1A4A36",     color: "#fff" },
  { key: "gizmo",    label: "Gizmo",    icon: "⚡", bg: "#3D2880",     color: "#fff" },
];

export function BottomTabs({ onOpen }: Props) {
  return (
    <div
      style={{
        padding: "10px 14px 16px",
        background: coastal.tabs.bg,
        borderTop: "1px solid rgba(0,0,0,.06)",
        display: "flex",
        gap: 8,
        fontFamily: coastal.fonts.manrope,
      }}
    >
      {TABS.map((t) => (
        <button
          key={t.key}
          onClick={() => onOpen(t.key)}
          style={{
            flex: 1,
            background: t.bg,
            color: t.color,
            border: "none",
            borderRadius: 14,
            padding: "12px 0",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            transition: "transform 0.1s, box-shadow 0.1s",
          }}
          onMouseDown={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.96)"; }}
          onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
        >
          <span style={{ fontSize: 20 }}>{t.icon}</span>
          <span style={{
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: ".08em",
            textTransform: "uppercase",
          }}>
            {t.label}
          </span>
        </button>
      ))}
    </div>
  );
}

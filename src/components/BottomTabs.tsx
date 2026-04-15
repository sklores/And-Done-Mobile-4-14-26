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
  activeTxt: string;
};

const TABS: TabDef[] = [
  { key: "invoices", label: "Invoices", icon: "📋", bg: "#2A3C48", activeTxt: "#fff" },
  { key: "log",      label: "Log",      icon: "📝", bg: "#1A4A36", activeTxt: "#fff" },
  { key: "gizmo",    label: "Gizmo",    icon: "⚡", bg: "#1A2E28", activeTxt: "#7BBFAA" },
];

export function BottomTabs({ onOpen }: Props) {
  return (
    <div
      style={{
        display: "flex",
        background: coastal.tabs.bg,
        borderTop: "1px solid rgba(0,0,0,.07)",
        fontFamily: coastal.fonts.manrope,
        padding: "6px 10px 10px",
        gap: 7,
      }}
    >
      {TABS.map((t) => (
        <button
          key={t.key}
          onClick={() => onOpen(t.key)}
          style={{
            flex: 1,
            background: t.bg,
            color: t.activeTxt,
            border: "none",
            borderRadius: 10,
            padding: "9px 0 8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            cursor: "pointer",
            fontFamily: coastal.fonts.manrope,
          }}
        >
          <span style={{ fontSize: 13, lineHeight: 1 }}>{t.icon}</span>
          <span style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: ".06em",
            textTransform: "uppercase",
          }}>
            {t.label}
          </span>
        </button>
      ))}
    </div>
  );
}

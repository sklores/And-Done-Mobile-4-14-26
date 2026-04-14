import { coastal } from "../theme/skins";

type TabKey = "dashboard" | "invoices" | "log" | "gizmo";

type Props = {
  active: TabKey;
  onChange: (k: TabKey) => void;
};

const TABS: { key: TabKey; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "invoices", label: "Invoices" },
  { key: "log", label: "Log" },
  { key: "gizmo", label: "Gizmo" },
];

export function BottomTabs({ active, onChange }: Props) {
  return (
    <div
      style={{
        display: "flex",
        background: coastal.tabs.bg,
        borderTop: "1px solid rgba(0,0,0,.05)",
        fontFamily: coastal.fonts.manrope,
      }}
    >
      {TABS.map((t) => {
        const isActive = t.key === active;
        const color = isActive
          ? t.key === "gizmo"
            ? coastal.tabs.activeGizmo
            : "#1A2E28"
          : coastal.tabs.inactive;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              padding: "10px 0",
              color,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: ".06em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

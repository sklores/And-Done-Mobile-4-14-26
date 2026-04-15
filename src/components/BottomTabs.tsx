import { coastal } from "../theme/skins";

export type TabKey = "invoices" | "log" | "gizmo";

type Props = {
  onOpen: (k: TabKey) => void;
};

const TABS: { key: TabKey; label: string }[] = [
  { key: "invoices", label: "Invoices" },
  { key: "log",      label: "Log"      },
  { key: "gizmo",    label: "Gizmo"    },
];

export function BottomTabs({ onOpen }: Props) {
  return (
    <div
      style={{
        display: "flex",
        background: coastal.tabs.bg,
        borderTop: "1px solid rgba(0,0,0,.05)",
        fontFamily: coastal.fonts.manrope,
      }}
    >
      {TABS.map((t) => (
        <button
          key={t.key}
          onClick={() => onOpen(t.key)}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            padding: "11px 0",
            color: "#1A2E28",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: ".06em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

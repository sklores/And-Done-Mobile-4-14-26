import { useSkin } from "../theme/skins";
import { useKpiStore, type Period } from "../stores/useKpiStore";

// The bottom bar: the period the tiles sum over (Day / WTD / MTD) on the
// left, Gizmo on the right. Invoices and Log moved into the drill-downs;
// the operator asked for the bar to be these two things.

export type TabKey = "invoices" | "log" | "gizmo";

type Props = {
  onOpen: (k: TabKey) => void;
  bg?: string;
  textColor?: string;
};

const PERIODS: { key: Period; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "wtd", label: "Week" },
  { key: "mtd", label: "Month" },
];

export function BottomTabs({ onOpen, bg, textColor }: Props) {
  const skin = useSkin();
  const period = useKpiStore((s) => s.period);
  const setPeriod = useKpiStore((s) => s.setPeriod);
  const ink = textColor ?? "#1A2E28";
  // paddingBottom: iOS home-indicator safe area — extends the tab-bar color
  // into the gesture-bar zone so the controls clear it. No-op on Android (inset 0).
  return (
    <div style={{ background: bg ?? skin.tabs.bg, flexShrink: 0, paddingBottom: "env(safe-area-inset-bottom)", transition: "background 1.2s ease" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          borderTop: "1px solid rgba(0,0,0,.07)",
          fontFamily: skin.fonts.body,
        }}
      >
        <div
          role="tablist"
          aria-label="Period"
          style={{ display: "flex", flex: 1, padding: 3, borderRadius: 999, background: "rgba(0,0,0,.10)", minHeight: 46 }}
        >
          {PERIODS.map((p) => {
            const on = p.key === period;
            return (
              <button
                key={p.key}
                role="tab"
                aria-selected={on}
                onClick={() => setPeriod(p.key)}
                style={{
                  flex: 1,
                  border: "none",
                  borderRadius: 999,
                  padding: "0",
                  minHeight: 40,
                  background: on ? ink : "transparent",
                  color: on ? (bg ?? skin.tabs.bg) : ink,
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  transition: "background .2s ease, color .2s ease",
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => onOpen("gizmo")}
          aria-label="Open Gizmo"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            border: `1.5px solid ${ink}`,
            borderRadius: 999,
            padding: "0 16px",
            minHeight: 46,
            background: "transparent",
            color: ink,
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: ".08em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: ink, boxShadow: `0 0 0 3px ${ink}33` }} />
          Gizmo
        </button>
      </div>
    </div>
  );
}

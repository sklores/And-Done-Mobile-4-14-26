import { useSkin } from "../theme/skins";
import { useKpiStore, type Period } from "../stores/useKpiStore";
import { GizmoHead } from "./GizmoHead";
import { useGizmoBlink } from "../hooks/useGizmoBlink";

// The bottom bar: which period the tiles sum over, and Gizmo.
//
// ONE continuous surface in the frame color -- no inset track, no second
// slab -- so it reads like the nameplate at the top of the screen instead of
// four stacked tones. Selection is weight plus an underline. Gizmo is his own
// face in a bubble; he blinks.

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
  const blink = useGizmoBlink();
  const ink = textColor ?? "#1A2E28";
  const surface = bg ?? skin.tabs.bg;

  return (
    // paddingBottom: the surface runs past the controls to the true bottom
    // edge -- clear of the phone's gesture bar, and continuous with the
    // system nav bar wherever the OS lets a PWA draw under it.
    <div style={{ background: surface, flexShrink: 0, paddingBottom: "max(env(safe-area-inset-bottom), 12px)", transition: "background 1.2s ease" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 20px 0", fontFamily: skin.fonts.body }}>
        <div role="tablist" aria-label="Period" style={{ display: "flex", flex: 1, gap: 4 }}>
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
                  minHeight: 44,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  border: "none",
                  background: "transparent",
                  padding: 0,
                  cursor: "pointer",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <span
                  style={{
                    color: ink,
                    opacity: on ? 1 : 0.52,
                    fontSize: 12.5,
                    fontWeight: on ? 800 : 600,
                    letterSpacing: ".1em",
                    textTransform: "uppercase",
                    transition: "opacity .2s ease",
                  }}
                >
                  {p.label}
                </span>
                <span
                  aria-hidden
                  style={{
                    height: 2.5,
                    width: on ? 20 : 0,
                    borderRadius: 2,
                    background: ink,
                    opacity: on ? 1 : 0,
                    transition: "width .22s ease, opacity .22s ease",
                  }}
                />
              </button>
            );
          })}
        </div>
        <button
          onClick={() => onOpen("gizmo")}
          aria-label="Open Gizmo"
          style={{
            width: 46,
            height: 46,
            flexShrink: 0,
            borderRadius: 999,
            border: `1.5px solid ${ink}2E`,
            background: "rgba(255,255,255,.24)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <GizmoHead size={34} blink={blink} />
        </button>
      </div>
    </div>
  );
}

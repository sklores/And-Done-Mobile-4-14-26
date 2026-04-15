import { coastal } from "../theme/skins";

type Props = {
  kind: "sales" | "net";
  label: string;
  value: string;
  sub: string;
  /** Net bar only: shows dollar amount alongside the % */
  valueSub?: string;
  onClick?: () => void;
};

export function KpiBar({ kind, label, value, sub, valueSub, onClick }: Props) {
  const s = kind === "sales" ? coastal.salesBar : coastal.netBar;
  return (
    <div
      onClick={onClick}
      style={{
        background: s.bg,
        borderRadius: 10,
        margin: "6px",
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontFamily: coastal.fonts.manrope,
        cursor: onClick ? "pointer" : undefined,
      }}
    >
      <div
        style={{
          color: s.label,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: ".1em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        {/* Dollar amount shown to the left of % on net bar */}
        {valueSub && (
          <div
            style={{
              color: s.label,
              fontSize: 14,
              fontWeight: 700,
              fontFamily: coastal.fonts.condensed,
            }}
          >
            {valueSub}
          </div>
        )}
        <div
          style={{
            color: s.value,
            fontSize: 24,
            fontWeight: 800,
            fontFamily: coastal.fonts.condensed,
            lineHeight: 1,
          }}
        >
          {value}
        </div>
        <div
          style={{
            color: s.sub,
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: ".08em",
          }}
        >
          {sub}
        </div>
      </div>
    </div>
  );
}

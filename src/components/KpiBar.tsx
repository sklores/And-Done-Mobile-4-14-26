import { coastal, tileForScore } from "../theme/skins";

type Props = {
  kind: "sales" | "net";
  label: string;
  value: string;
  sub: string;
  /** Net bar only: shows dollar amount alongside the % */
  valueSub?: string;
  /** 1–8 benchmark score — when provided, bar uses the shared tile gradient */
  score?: number;
  /** Last stacked bar before the marquee — needs bottom margin for rhythm */
  isLast?: boolean;
  onClick?: () => void;
};

export function KpiBar({ kind, label, value, sub, valueSub, score, isLast, onClick }: Props) {
  const defaults = kind === "sales" ? coastal.salesBar : coastal.netBar;
  const palette = typeof score === "number" ? tileForScore(score) : null;

  const bg           = palette?.bg         ?? defaults.bg;
  const labelColor   = palette?.label      ?? defaults.label;
  const valueColor   = palette?.value      ?? defaults.value;
  const subColor     = palette?.statusText ?? defaults.sub;
  const valueSubCol  = palette?.label      ?? defaults.label;

  return (
    <div
      onClick={onClick}
      style={{
        background: bg,
        borderRadius: 10,
        margin: "8px 12px 0",
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
          color: labelColor,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: ".1em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        {/* Dollar amount shown to the left of % on net bar */}
        {valueSub && (
          <div
            style={{
              color: valueSubCol,
              fontSize: 16,
              fontWeight: 700,
              fontFamily: coastal.fonts.condensed,
            }}
          >
            {valueSub}
          </div>
        )}
        <div
          style={{
            color: valueColor,
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
            color: subColor,
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

import { useEffect, useState } from "react";
import { coastal, tileForScore } from "../theme/skins";
import type { Kpi } from "../stores/useKpiStore";

type Props = { kpi: Kpi; onClick?: () => void };

export function KpiTile({ kpi, onClick }: Props) {
  const palette = tileForScore(kpi.score);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (kpi.score === 7) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 900);
      return () => clearTimeout(t);
    }
  }, [kpi.score, kpi.value]);

  return (
    <div
      onClick={onClick}
      style={{
        background: palette.bg,
        borderRadius: 10,
        padding: "10px 8px 8px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        minHeight: 78,
        fontFamily: coastal.fonts.manrope,
        animation: flash ? "kpiFlash 0.9s ease-out" : undefined,
        cursor: onClick ? "pointer" : undefined,
      }}
    >
      <div
        style={{
          color: palette.label,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: ".08em",
          textTransform: "uppercase",
        }}
      >
        {kpi.label}
      </div>
      <div
        style={{
          color: palette.value,
          fontSize: 22,
          fontWeight: 800,
          fontFamily: coastal.fonts.condensed,
          lineHeight: 1,
          margin: "4px 0",
        }}
      >
        {kpi.value}
      </div>
      <div
        style={{
          color: palette.statusText,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: ".06em",
          textTransform: "uppercase",
        }}
      >
        {kpi.status}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { coastal, tileForScore } from "../theme/skins";
import type { Kpi } from "../stores/useKpiStore";

type Props = { kpi: Kpi; onClick?: () => void; alerting?: boolean; loading?: boolean };

export function KpiTile({ kpi, onClick, alerting, loading }: Props) {
  const palette = tileForScore(kpi.score);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (kpi.score === 7) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 900);
      return () => clearTimeout(t);
    }
  }, [kpi.score, kpi.value, loading]);

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
        animation: alerting
          ? "kpiPulse 2s ease-in-out infinite"
          : flash ? "kpiFlash 0.9s ease-out" : undefined,
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
      {loading ? (
        <div
          aria-hidden
          style={{
            width: "62%",
            height: 22,
            borderRadius: 4,
            background: "rgba(0,0,0,0.08)",
            margin: "4px 0",
            animation: "kpiSkeleton 1.4s ease-in-out infinite",
          }}
        />
      ) : (
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
      )}
      {loading ? (
        <div
          aria-hidden
          style={{
            width: "40%",
            height: 9,
            borderRadius: 3,
            background: "rgba(0,0,0,0.07)",
            animation: "kpiSkeleton 1.4s ease-in-out infinite",
          }}
        />
      ) : (
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
      )}
    </div>
  );
}

import { KpiTile } from "./KpiTile";
import type { Kpi } from "../stores/useKpiStore";

type Props = { tiles: Kpi[] };

export function KpiGrid({ tiles }: Props) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 6,
        padding: 6,
        background: "#E4EDED",
      }}
    >
      {tiles.map((k) => (
        <KpiTile key={k.key} kpi={k} />
      ))}
    </div>
  );
}

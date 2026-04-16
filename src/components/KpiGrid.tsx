import { KpiTile } from "./KpiTile";
import type { Kpi, KpiKey } from "../stores/useKpiStore";

type Props = {
  tiles: Kpi[];
  onTileClick?: (key: KpiKey) => void;
};

export function KpiGrid({ tiles, onTileClick }: Props) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 6,
        padding: "8px 12px 0",
        background: "#8A8E92",
      }}
    >
      {tiles.map((k) => (
        <KpiTile
          key={k.key}
          kpi={k}
          onClick={onTileClick ? () => onTileClick(k.key) : undefined}
        />
      ))}
    </div>
  );
}

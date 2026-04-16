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
        gap: 4,
        padding: "6px 10px 0",
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

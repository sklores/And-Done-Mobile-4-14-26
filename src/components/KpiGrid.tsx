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
        gridTemplateRows: "1fr 1fr 1fr",
        flex: 1,
        minHeight: 0,
        gap: 6,
        padding: "8px 12px 0",
        background: "#E4EDED",
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

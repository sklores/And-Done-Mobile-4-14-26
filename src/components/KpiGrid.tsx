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
        padding: 6,
        background: "#E4EDED",
        flex: 1,
        alignContent: "start",
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

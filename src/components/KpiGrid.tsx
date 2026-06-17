import { KpiTile } from "./KpiTile";
import type { Kpi, KpiKey } from "../stores/useKpiStore";
import { useIsDusky, useIsNight } from "../hooks/useTimeOfDay";

type Props = {
  tiles: Kpi[];
  onTileClick?: (key: KpiKey) => void;
  alertingKeys?: Set<string>;
  loading?: boolean;
};

export function KpiGrid({ tiles, onTileClick, alertingKeys, loading }: Props) {
  const isNight = useIsNight();
  const isDusky = useIsDusky();
  // At night we let the phone wrapper's dark bg show through so the KPI
  // grid doesn't leave a pale cream seam behind the tiles.
  const bg      = (isNight || isDusky) ? "transparent" : "#F0EBDD";
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        // Vertical breathing room between the COGS/Labor row and the
        // Prime/Fixed row; columns stay tight (4px) so the side-by-side
        // tiles don't drift apart. Universal — not PWA-gated.
        rowGap: 10,
        columnGap: 4,
        padding: "4px 10px 0",
        background: bg,
        transition: "background 1.2s ease",
      }}
    >
      {tiles.map((k) => (
        <KpiTile
          key={k.key}
          kpi={k}
          alerting={alertingKeys?.has(k.key)}
          loading={loading}
          onClick={onTileClick ? () => onTileClick(k.key) : undefined}
        />
      ))}
    </div>
  );
}

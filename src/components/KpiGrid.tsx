import { KpiTile } from "./KpiTile";
import type { Kpi, KpiKey } from "../stores/useKpiStore";
import { useIsDusky, useIsNight } from "../hooks/useTimeOfDay";
import { useSkin } from "../theme/skins";

type Props = {
  tiles: Kpi[];
  onTileClick?: (key: KpiKey) => void;
  alertingKeys?: Set<string>;
  loading?: boolean;
};

export function KpiGrid({ tiles, onTileClick, alertingKeys, loading }: Props) {
  const skin    = useSkin();
  const isNight = useIsNight();
  const isDusky = useIsDusky();
  // At night we let the phone wrapper's dark bg show through so the KPI
  // grid doesn't leave a pale cream seam behind the tiles. By day the band
  // matches the active skin's page background (cream on Coastal/Le Mans,
  // dark hull/asphalt on Nostromo/New York).
  const bg      = (isNight || isDusky) ? "transparent" : skin.pageBg;
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
        padding: "0 10px",
        flex: 2, // two rows of tiles — see StatRow's flex: 1
        alignContent: "stretch",
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

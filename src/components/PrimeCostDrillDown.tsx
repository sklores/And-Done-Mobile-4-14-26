import { useKpiStore } from "../stores/useKpiStore";
import { DrillDownModal, DrillRow } from "./DrillDownModal";
import { coastal } from "../theme/skins";
import { PRIME_TARGET_PCT } from "../config/cogsConfig";
import { buildGroups, GROUP_COGS_PCT, type CogsGroup } from "../config/cogsGroups";

type Props = { open: boolean; onClose: () => void };

function fmt$(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function SectionHeader({ title, right }: { title: string; right?: string }) {
  return (
    <div
      style={{
        padding: "10px 18px 4px",
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: ".1em",
        textTransform: "uppercase",
        color: "#8A9C9C",
        fontFamily: coastal.fonts.manrope,
        background: "#F2F7F6",
        borderTop: "1px solid rgba(0,0,0,0.05)",
        borderBottom: "1px solid rgba(0,0,0,0.05)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <span>{title}</span>
      {right && <span style={{ fontSize: 9, opacity: 0.7 }}>{right}</span>}
    </div>
  );
}

/** Horizontal split bar: labor vs cogs within prime cost */
function SplitBar({ laborPct, cogsPct }: { laborPct: number; cogsPct: number }) {
  const total = laborPct + cogsPct;
  if (total === 0) return null;
  const lW = (laborPct / total) * 100;
  const cW = (cogsPct / total) * 100;
  return (
    <div style={{ padding: "14px 18px 10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontFamily: coastal.fonts.manrope, fontSize: 10, fontWeight: 700, color: "#4A7C6F" }}>
          Labor {laborPct.toFixed(1)}%
        </span>
        <span style={{ fontFamily: coastal.fonts.manrope, fontSize: 10, fontWeight: 700, color: "#6B8FBF" }}>
          COGS {cogsPct.toFixed(1)}%
        </span>
      </div>
      <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", height: 10 }}>
        <div style={{ width: `${lW}%`, background: "#4A9B8E" }} />
        <div style={{ width: `${cW}%`, background: "#6B8FBF" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{ fontFamily: coastal.fonts.manrope, fontSize: 9, color: "#8A9C9C" }}>
          {lW.toFixed(0)}% of prime
        </span>
        <span style={{ fontFamily: coastal.fonts.manrope, fontSize: 9, color: "#8A9C9C" }}>
          {cW.toFixed(0)}% of prime
        </span>
      </div>
    </div>
  );
}

/** vs. target gauge row */
function TargetRow({ actual, target }: { actual: number; target: number }) {
  const diff = actual - target;
  const over = diff > 0;
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "10px 18px",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
        background: over ? "rgba(185,74,74,0.06)" : "rgba(74,155,142,0.06)",
      }}
    >
      <div style={{ fontFamily: coastal.fonts.manrope, fontSize: 12, fontWeight: 600, color: "#4A5A54" }}>
        vs. Target ({target.toFixed(1)}%)
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{
          fontFamily: coastal.fonts.condensed,
          fontSize: 18,
          fontWeight: 700,
          color: over ? "#B94A4A" : "#2F6B58",
        }}>
          {over ? "+" : ""}{diff.toFixed(1)}%
        </div>
        <div style={{ fontFamily: coastal.fonts.manrope, fontSize: 10, color: "#8A9C9C", marginTop: 1 }}>
          {over ? "above target" : "below target"}
        </div>
      </div>
    </div>
  );
}

export function PrimeCostDrillDown({ open, onClose }: Props) {
  const primeTile       = useKpiStore((s) => s.tiles.find((t) => t.key === "prime"));
  const laborDetail     = useKpiStore((s) => s.laborDetail);
  const laborDetailRich = useKpiStore((s) => s.laborDetailRich);
  const cogsDetail      = useKpiStore((s) => s.cogsDetail);
  const salesVal        = useKpiStore((s) => s.sales.value);

  if (!primeTile) return null;

  const primePct = parseFloat(primeTile.value) || 0;
  const laborPct = laborDetail && salesVal > 0
    ? (laborDetail.laborCost / salesVal) * 100
    : 0;
  // Use live effective COGS % — falls back to 26% (food default) if no data yet
  const cogsPct = cogsDetail?.effectiveCOGSPct ?? 26;

  // Food/Bev/Alcohol breakdown from live category data
  const groups = cogsDetail ? buildGroups(cogsDetail.categorySales) : null;

  return (
    <DrillDownModal
      open={open}
      onClose={onClose}
      score={primeTile.score}
      label="Prime Cost"
      value={primeTile.value}
      status={primeTile.status}
    >
      {/* ── Split bar ─────────────────────────────────── */}
      {primePct > 0 && <SplitBar laborPct={laborPct} cogsPct={cogsPct} />}

      {/* ── vs. Target ────────────────────────────────── */}
      {primePct > 0 && <TargetRow actual={primePct} target={PRIME_TARGET_PCT} />}

      {/* ── Labor Breakdown ───────────────────────────── */}
      <SectionHeader title="Labor" right={laborDetailRich ? undefined : "loading…"} />

      <DrillRow
        label="Hourly Labor"
        value={laborDetailRich ? fmt$(laborDetailRich.hourlyCost) : "--"}
        sub={laborDetailRich ? `${laborDetailRich.hourlyHours.toFixed(1)} hrs` : undefined}
      />
      <DrillRow
        label="Salary / Exempt"
        value={laborDetailRich ? fmt$(laborDetailRich.salaryCost) : "--"}
        sub={laborDetailRich?.salaryCost === 0 ? "none clocked in" : undefined}
        dimmed={laborDetailRich?.salaryCost === 0}
      />

      {/* FOH / BOH split — only show if jobs API resolved */}
      {laborDetailRich?.jobsResolved && (
        <>
          <DrillRow
            label="Front of House"
            value={fmt$(laborDetailRich.fohCost)}
            sub="servers · bartenders · hosts"
            dimmed
          />
          <DrillRow
            label="Back of House"
            value={fmt$(laborDetailRich.bohCost)}
            sub="kitchen · prep · dish"
            dimmed
          />
        </>
      )}

      {laborDetailRich?.hasOT && (
        <div style={{
          margin: "6px 18px",
          padding: "8px 12px",
          background: "rgba(185,74,74,0.1)",
          borderRadius: 8,
          fontFamily: coastal.fonts.manrope,
          fontSize: 11,
          fontWeight: 700,
          color: "#B94A4A",
        }}>
          ⚠️ Overtime detected today
        </div>
      )}

      {laborDetailRich?.projectedEOD != null && (
        <DrillRow
          label="Projected EOD Labor"
          value={fmt$(laborDetailRich.projectedEOD)}
          sub="extrapolated to 10 PM close"
        />
      )}

      {/* ── COGS Breakdown ────────────────────────────── */}
      <SectionHeader
        title="COGS"
        right={cogsDetail ? `${cogsDetail.effectiveCOGSPct.toFixed(1)}% effective` : "loading…"}
      />
      {groups ? (
        (["Food", "Beverage", "Alcohol"] as CogsGroup[]).map((g) => (
          <DrillRow
            key={g}
            label={`${g} (${GROUP_COGS_PCT[g]}%)`}
            value={`$${groups[g].cost.toFixed(2)}`}
            sub={`$${groups[g].revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })} sales`}
            dimmed={groups[g].revenue === 0}
          />
        ))
      ) : (
        <DrillRow label="Loading COGS data…" value="--" />
      )}

    </DrillDownModal>
  );
}

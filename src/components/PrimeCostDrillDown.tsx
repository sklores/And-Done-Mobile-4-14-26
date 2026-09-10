import { useKpiStore } from "../stores/useKpiStore";
import { DrillDownModal, DrillRow, DrillLoad } from "./DrillDownModal";
import { useSkin } from "../theme/skins";
import { PRIME_TARGET_PCT } from "../config/cogsConfig";
import { buildGroups, type CogsGroup } from "../config/cogsGroups";
import { money, money2 } from "../lib/money";

type Props = { open: boolean; onClose: () => void };

const ORDER: CogsGroup[] = ["Food", "Beverage", "Alcohol"];

function SectionHeader({ title, right }: { title: string; right?: string }) {
  const skin = useSkin();
  return (
    <div
      style={{
        padding: "10px 18px 4px",
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: ".1em",
        textTransform: "uppercase",
        color: "#8A9C9C",
        fontFamily: skin.fonts.body,
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
  const skin = useSkin();
  const total = laborPct + cogsPct;
  if (total === 0) return null;
  const lW = (laborPct / total) * 100;
  const cW = (cogsPct / total) * 100;
  return (
    <div style={{ padding: "14px 18px 10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontFamily: skin.fonts.body, fontSize: 10, fontWeight: 700, color: "#4A7C6F" }}>
          Labor {laborPct.toFixed(1)}%
        </span>
        <span style={{ fontFamily: skin.fonts.body, fontSize: 10, fontWeight: 700, color: "#6B8FBF" }}>
          COGS {cogsPct.toFixed(1)}%
        </span>
      </div>
      <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", height: 10 }}>
        <div style={{ width: `${lW}%`, background: "#4A9B8E" }} />
        <div style={{ width: `${cW}%`, background: "#6B8FBF" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{ fontFamily: skin.fonts.body, fontSize: 9, color: "#8A9C9C" }}>
          {lW.toFixed(0)}% of prime
        </span>
        <span style={{ fontFamily: skin.fonts.body, fontSize: 9, color: "#8A9C9C" }}>
          {cW.toFixed(0)}% of prime
        </span>
      </div>
    </div>
  );
}

/** vs. target gauge row — only ever rendered against a real target. */
function TargetRow({ actual, target }: { actual: number; target: number }) {
  const skin = useSkin();
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
      <div style={{ fontFamily: skin.fonts.body, fontSize: 12, fontWeight: 600, color: "#4A5A54" }}>
        vs. Target ({target.toFixed(1)}%)
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{
          fontFamily: skin.fonts.display,
          fontSize: 18,
          fontWeight: 700,
          color: over ? "#B94A4A" : "#2F6B58",
        }}>
          {over ? "+" : ""}{diff.toFixed(1)}%
        </div>
        <div style={{ fontFamily: skin.fonts.body, fontSize: 10, color: "#8A9C9C", marginTop: 1 }}>
          {over ? "above target" : "below target"}
        </div>
      </div>
    </div>
  );
}

export function PrimeCostDrillDown({ open, onClose }: Props) {
  const skin = useSkin();
  const primeTile       = useKpiStore((s) => s.tiles.find((t) => t.key === "prime"));
  const laborDetail     = useKpiStore((s) => s.laborDetail);
  const laborDetailRich = useKpiStore((s) => s.laborDetailRich);
  const cogsDetail      = useKpiStore((s) => s.cogsDetail);
  const salesVal        = useKpiStore((s) => s.sales.value);
  const meta            = useKpiStore((s) => s.meta);
  const snapStatus      = useKpiStore((s) => s.status);
  const asOf            = useKpiStore((s) => s.asOf);
  const refresh         = useKpiStore((s) => s.refresh);
  const detailStatus    = useKpiStore((s) => s.detailStatus);

  if (!primeTile) return null;

  const primePct = parseFloat(primeTile.value) || 0;
  const laborPct = laborDetail && salesVal > 0
    ? (laborDetail.laborCost / salesVal) * 100
    : null;
  // The period's effective COGS % from the seed; no split bar until it is here.
  const cogsPct = cogsDetail && Number.isFinite(cogsDetail.effectiveCOGSPct)
    ? cogsDetail.effectiveCOGSPct
    : null;

  // Food/Bev/Alcohol breakdown — revenue from the category rows, cost from the
  // seed's own rate on each row (never a house 26/20/22).
  const groups = cogsDetail ? buildGroups(cogsDetail.categorySales) : null;
  // ...and buildGroups([]) is three groups of zero, not three groups worth $0:
  // a COGS read that carried no category rows has measured nothing here, so the
  // rows only exist once some category revenue does (the same guard the COGS
  // sheet puts on the same data).
  const groupTotal = groups
    ? groups.Food.revenue + groups.Beverage.revenue + groups.Alcohol.revenue
    : 0;

  return (
    <DrillDownModal
      open={open}
      onClose={onClose}
      score={primeTile.score}
      label="Prime Cost"
      value={primeTile.value}
      status={primeTile.status}
      feed={{ status: snapStatus, asOf, daysExpected: meta?.daysExpected, daysMissing: meta?.daysMissing }}
    >
      {/* ── Split bar ─────────────────────────────────── */}
      {primePct > 0 && cogsPct != null && laborPct != null && <SplitBar laborPct={laborPct} cogsPct={cogsPct} />}

      {/* ── vs. Target ────────────────────────────────── */}
      {/* No target ships in the app (the old one was summed from a column the
          config file declared a mock). Say so rather than score against it. */}
      {primePct > 0 && PRIME_TARGET_PCT != null && <TargetRow actual={primePct} target={PRIME_TARGET_PCT} />}
      {primePct > 0 && PRIME_TARGET_PCT == null && (
        <DrillRow label="vs. Target" value="--" sub="no prime-cost target on file for this restaurant" dimmed />
      )}

      {/* ── Labor Breakdown ───────────────────────────── */}
      <SectionHeader title="Labor" />

      <DrillRow
        label="Hourly Labor"
        value={laborDetailRich ? money(laborDetailRich.hourlyCost) : "--"}
        sub={laborDetailRich ? `${laborDetailRich.hourlyHours.toFixed(1)} hrs` : undefined}
      />
      <DrillRow
        label="Salary / Exempt"
        value={laborDetailRich ? money(laborDetailRich.salaryCost) : "--"}
        sub={laborDetailRich?.salaryCost === 0 ? "none clocked in" : undefined}
        dimmed={laborDetailRich?.salaryCost === 0}
      />

      {/* FOH / BOH split — only show if jobs API resolved */}
      {laborDetailRich?.jobsResolved && (
        <>
          <DrillRow
            label="Front of House"
            value={money(laborDetailRich.fohCost)}
            sub="servers · bartenders · hosts"
            dimmed
          />
          <DrillRow
            label="Back of House"
            value={money(laborDetailRich.bohCost)}
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
          fontFamily: skin.fonts.body,
          fontSize: 11,
          fontWeight: 700,
          color: "#B94A4A",
        }}>
          ⚠️ Overtime detected
        </div>
      )}

      {laborDetailRich?.projectedEOD != null && (
        <DrillRow
          label="Projected EOD Labor"
          value={money(laborDetailRich.projectedEOD)}
          sub="extrapolated to 10 PM close"
        />
      )}

      {/* ── COGS Breakdown ────────────────────────────── */}
      <SectionHeader
        title="COGS"
        right={cogsPct != null ? `${cogsPct.toFixed(1)}% effective` : undefined}
      />
      {groups && groupTotal > 0 ? (
        ORDER.map((g) => {
          const d = groups[g];
          return (
            <DrillRow
              key={g}
              label={d.pct != null ? `${g} (${d.pct.toFixed(1)}%)` : g}
              value={d.cost != null ? money2(d.cost) : "--"}
              sub={d.cost != null
                ? `${money(d.revenue)} sales`
                : `${money(d.revenue)} sales · no cost from the seed`}
              dimmed={d.revenue === 0 || d.cost == null}
            />
          );
        })
      ) : cogsDetail ? (
        <DrillRow label="No category data from Toast" value="--" sub="Sales categories may not be configured in Toast" dimmed />
      ) : null}

      <DrillLoad
        open={open}
        present={!!laborDetailRich && !!cogsDetail}
        status={detailStatus}
        subject="the prime-cost breakdown"
        load={refresh}
      />

    </DrillDownModal>
  );
}

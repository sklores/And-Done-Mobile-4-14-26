import { useKpiStore } from "../stores/useKpiStore";
import { DrillDownModal, DrillRow } from "./DrillDownModal";
import { coastal } from "../theme/skins";
import { buildGroups, GROUP_COGS_PCT, type CogsGroup } from "../config/cogsGroups";

type Props = { open: boolean; onClose: () => void };

function fmt$(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
function fmtDec$(n: number) {
  return `$${n.toFixed(2)}`;
}

function SectionHeader({ title, right }: { title: string; right?: string }) {
  return (
    <div style={{
      padding: "10px 18px 4px",
      fontSize: 9, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase",
      color: "#8A9C9C", fontFamily: coastal.fonts.manrope,
      background: "#F2F7F6",
      borderTop: "1px solid rgba(0,0,0,0.05)",
      borderBottom: "1px solid rgba(0,0,0,0.05)",
      display: "flex", justifyContent: "space-between", alignItems: "center",
    }}>
      <span>{title}</span>
      {right && <span style={{ opacity: 0.65, fontSize: 9 }}>{right}</span>}
    </div>
  );
}

/** Mini horizontal bar: Food / Beverage / Alcohol */
const GROUP_COLORS: Record<CogsGroup, string> = {
  Food:     "#4A9B8E",
  Beverage: "#6B8FBF",
  Alcohol:  "#BFA96B",
};

function GroupBar({ groups, total }: {
  groups: Record<CogsGroup, { revenue: number; cost: number }>;
  total: number;
}) {
  if (!total) return null;
  const order: CogsGroup[] = ["Food", "Beverage", "Alcohol"];
  return (
    <div style={{ padding: "14px 18px 10px" }}>
      <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", height: 10 }}>
        {order.map((g) => (
          <div key={g}
            style={{ width: `${(groups[g].revenue / total) * 100}%`, background: GROUP_COLORS[g] }}
          />
        ))}
      </div>
      <div style={{ display: "flex", gap: "6px 14px", marginTop: 6, flexWrap: "wrap" }}>
        {order.map((g) => (
          <div key={g} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: GROUP_COLORS[g] }} />
            <span style={{ fontFamily: coastal.fonts.manrope, fontSize: 9, color: "#8A9C9C", fontWeight: 700 }}>
              {g} {total > 0 ? ((groups[g].revenue / total) * 100).toFixed(0) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}


export function COGSDrillDown({ open, onClose }: Props) {
  const cogsTile = useKpiStore((s) => s.tiles.find((t) => t.key === "cogs"));
  const detail   = useKpiStore((s) => s.cogsDetail);
  const salesVal = useKpiStore((s) => s.sales.value);

  if (!cogsTile) return null;

  const hasReal = !!detail && salesVal > 0;
  const groups  = detail ? buildGroups(detail.categorySales) : null;
  const groupTotal = groups
    ? groups.Food.revenue + groups.Beverage.revenue + groups.Alcohol.revenue
    : 0;

  return (
    <DrillDownModal
      open={open}
      onClose={onClose}
      score={cogsTile.score}
      label="COGS"
      value={cogsTile.value}
      status={hasReal ? `${detail.effectiveCOGSPct.toFixed(1)}% effective · ${fmt$(detail.effectiveCOGS)}` : cogsTile.status}
    >
      {/* ── Food / Beverage / Alcohol breakdown ──────────── */}
      {groups && groupTotal > 0 && (
        <GroupBar groups={groups} total={groupTotal} />
      )}

      <SectionHeader
        title="By Type"
        right={groups && groupTotal > 0
          ? fmtDec$(groups.Food.cost + groups.Beverage.cost + groups.Alcohol.cost)
          : "loading…"}
      />

      {groups && groupTotal > 0 ? (
        (["Food", "Beverage", "Alcohol"] as CogsGroup[]).map((g) => (
          <DrillRow
            key={g}
            label={`${g} (${GROUP_COGS_PCT[g]}% COGS)`}
            value={fmtDec$(groups[g].cost)}
            sub={`${fmt$(groups[g].revenue)} sales · ${groupTotal > 0
              ? ((groups[g].revenue / groupTotal) * 100).toFixed(0)
              : 0}% of mix`}
          />
        ))
      ) : detail ? (
        <DrillRow label="No category data from Toast" value="--" sub="Sales categories may not be configured in Toast" dimmed />
      ) : (
        <DrillRow label="Loading…" value="--" />
      )}

      {/* ── Sales by Toast category ───────────────────────── */}
      <SectionHeader
        title="By Sales Category"
        right={detail ? `${detail.categoryCOGSPct.toFixed(1)}% est. COGS` : "loading…"}
      />
      {detail ? detail.categorySales.map((cat) => (
        <DrillRow
          key={cat.name}
          label={cat.name}
          value={fmt$(cat.revenue)}
          sub={`${cat.revenuePct}% of sales · ${cat.cogsPct}% COGS = ${fmtDec$(cat.cogsDollars)}`}
        />
      )) : (
        <DrillRow label="Loading categories…" value="--" />
      )}

      {/* ── Packaging ─────────────────────────────────────── */}
      <SectionHeader title="Packaging" right={detail ? fmtDec$(detail.totalPaper) : undefined} />
      <DrillRow
        label="Dine-In (1%)"
        value={detail ? fmtDec$(detail.dineInPaper) : "--"}
        sub={detail ? `${fmt$(detail.dineInSales)} dine-in sales` : undefined}
        dimmed
      />
      <DrillRow
        label="Takeout & Delivery (4%)"
        value={detail ? fmtDec$(detail.takeoutDeliveryPaper) : "--"}
        sub={detail ? `${fmt$(detail.takeoutDeliverySales)} takeout + delivery sales` : undefined}
        dimmed
      />

      {/* ── 3rd Party Commissions ─────────────────────────── */}
      <SectionHeader
        title="3rd Party Commissions (18%)"
        right={detail ? fmtDec$(detail.thirdPartyCommission) : undefined}
      />
      {detail && detail.doordashSales > 0 && (
        <DrillRow label="DoorDash" value={fmtDec$(detail.doordashSales * 0.18)}
          sub={`18% of ${fmt$(detail.doordashSales)}`} dimmed />
      )}
      {detail && detail.ubereatsSales > 0 && (
        <DrillRow label="Uber Eats" value={fmtDec$(detail.ubereatsSales * 0.18)}
          sub={`18% of ${fmt$(detail.ubereatsSales)}`} dimmed />
      )}
      {detail && detail.grubhubSales > 0 && (
        <DrillRow label="Grubhub" value={fmtDec$(detail.grubhubSales * 0.18)}
          sub={`18% of ${fmt$(detail.grubhubSales)}`} dimmed />
      )}
      {detail && detail.commissionBase === 0 && (
        <DrillRow label="No 3rd party orders today" value="$0" dimmed />
      )}

      {/* ── Comps & Voids ─────────────────────────────────── */}
      <SectionHeader title="Comps & Voids" />
      <DrillRow
        label="Comps / Discounts"
        value={detail ? fmtDec$(detail.compValue) : "--"}
        sub={detail ? `${detail.compCount} discount${detail.compCount !== 1 ? "s" : ""} applied` : undefined}
      />
      <DrillRow
        label="Voids (est. cost)"
        value={detail ? fmtDec$(detail.voidCost) : "--"}
        sub={detail
          ? `${detail.voidCount} voided item${detail.voidCount !== 1 ? "s" : ""} · ${fmtDec$(detail.voidValue)} retail value`
          : undefined}
      />

      {/* ── Effective COGS total ──────────────────────────── */}
      <SectionHeader title="= Effective COGS" />
      <DrillRow
        label="Total COGS"
        value={detail ? fmtDec$(detail.effectiveCOGS) : "--"}
        sub={detail
          ? `${detail.effectiveCOGSPct.toFixed(1)}% of net sales`
          : "type COGS + paper + commissions + comps + voids"}
      />

      {!detail && (
        <div style={{ padding: "20px 18px", textAlign: "center",
          fontFamily: coastal.fonts.manrope, fontSize: 12, color: "#8A9C9C" }}>
          Waiting for order data…
        </div>
      )}

      {/* Temp debug — remove once category names are confirmed */}
      {detail?._debugCategoryNames && detail._debugCategoryNames.length > 0 && (
        <div style={{ padding: "10px 18px", fontFamily: coastal.fonts.manrope, fontSize: 10, color: "#8A9C9C" }}>
          <strong>Toast categories:</strong> {detail._debugCategoryNames.join(", ")}
        </div>
      )}
    </DrillDownModal>
  );
}

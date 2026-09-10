import { useKpiStore } from "../stores/useKpiStore";
import { DrillDownModal, DrillRow, DrillLoad } from "./DrillDownModal";
import { useSkin } from "../theme/skins";
import { buildGroups, type CogsGroup } from "../config/cogsGroups";
import { money, money2 } from "../lib/money";

type Props = { open: boolean; onClose: () => void };

function SectionHeader({ title, right }: { title: string; right?: string }) {
  const skin = useSkin();
  return (
    <div style={{
      padding: "10px 18px 4px",
      fontSize: 9, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase",
      color: "#8A9C9C", fontFamily: skin.fonts.body,
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
const ORDER: CogsGroup[] = ["Food", "Beverage", "Alcohol"];

function GroupBar({ groups, total }: {
  groups: Record<CogsGroup, { revenue: number; cost: number | null }>;
  total: number;
}) {
  const skin = useSkin();
  if (!total) return null;
  return (
    <div style={{ padding: "14px 18px 10px" }}>
      <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", height: 10 }}>
        {ORDER.map((g) => (
          <div key={g}
            style={{ width: `${(groups[g].revenue / total) * 100}%`, background: GROUP_COLORS[g] }}
          />
        ))}
      </div>
      <div style={{ display: "flex", gap: "6px 14px", marginTop: 6, flexWrap: "wrap" }}>
        {ORDER.map((g) => (
          <div key={g} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: GROUP_COLORS[g] }} />
            <span style={{ fontFamily: skin.fonts.body, fontSize: 9, color: "#8A9C9C", fontWeight: 700 }}>
              {g} {total > 0 ? ((groups[g].revenue / total) * 100).toFixed(0) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}


export function COGSDrillDown({ open, onClose }: Props) {
  const cogsTile   = useKpiStore((s) => s.tiles.find((t) => t.key === "cogs"));
  const detail     = useKpiStore((s) => s.cogsDetail);
  const salesVal   = useKpiStore((s) => s.sales.value);
  const meta       = useKpiStore((s) => s.meta);
  const snapStatus = useKpiStore((s) => s.status);
  const asOf       = useKpiStore((s) => s.asOf);
  const refresh    = useKpiStore((s) => s.refresh);
  // Where the drill-down read stands, so the footer below can tell a failed
  // read from one that came back with nothing.
  const detailStatus = useKpiStore((s) => s.detailStatus);

  if (!cogsTile) return null;

  const effPct  = detail && Number.isFinite(detail.effectiveCOGSPct) ? detail.effectiveCOGSPct : null;
  const hasReal = !!detail && salesVal > 0 && effPct != null;
  const groups  = detail ? buildGroups(detail.categorySales) : null;
  const groupTotal = groups
    ? groups.Food.revenue + groups.Beverage.revenue + groups.Alcohol.revenue
    : 0;
  // The section total is the seed's own priced category total (the figure the
  // tile and the P&L are built from), not a sum of the rows below -- those can
  // be missing a group the seed priced with nothing, and a partial sum under a
  // "By Type" header is a number that isn't one. Null whenever there are no
  // category rows to total: "$0.00" over the "no category data" row is a
  // measurement we never took.
  const categoryCost = detail && groupTotal > 0 && Number.isFinite(detail.categoryCOGS)
    ? detail.categoryCOGS
    : null;

  // The feed carries no comp/void columns, so it sends literal zeros for all
  // five fields. "0 discounts applied" is a measurement we never took: say
  // "not measured" unless something non-zero actually arrives.
  const compsMeasured = !!detail && (
    detail.compCount > 0 || detail.compValue !== 0 ||
    detail.voidCount > 0 || detail.voidValue !== 0 || detail.voidCost !== 0
  );
  // Same for the platform split: commission can be non-zero while DoorDash /
  // Uber Eats / Grubhub are all hard zeros, which used to print a section
  // total with no rows under it and no "no 3rd party orders" line either.
  const platformSplit = !!detail && (detail.doordashSales > 0 || detail.ubereatsSales > 0 || detail.grubhubSales > 0);
  const commissionPct = detail && detail.commissionBase > 0
    ? (detail.thirdPartyCommission / detail.commissionBase) * 100
    : null;

  const paperSub = (paper: number, sales: number, what: string) =>
    sales > 0
      ? `${money(sales)} ${what} · ${((paper / sales) * 100).toFixed(1)}% paper`
      : `no ${what} in this period`;

  // What the rows above the total actually account for, and what the seed's
  // total has on top of them. The difference is real (comps and voids are in
  // cogs_total server-side); printing it beats a total that silently exceeds
  // its own parts.
  const parts = detail && categoryCost != null
    ? categoryCost + detail.totalPaper + detail.thirdPartyCommission +
      (compsMeasured ? detail.compValue + detail.voidCost : 0)
    : null;
  const residual = detail && parts != null ? detail.effectiveCOGS - parts : null;

  return (
    <DrillDownModal
      open={open}
      onClose={onClose}
      score={cogsTile.score}
      label="COGS"
      value={cogsTile.value}
      status={hasReal ? `${effPct.toFixed(1)}% effective · ${money(detail.effectiveCOGS)}` : cogsTile.status}
      feed={{ status: snapStatus, asOf, daysExpected: meta?.daysExpected, daysMissing: meta?.daysMissing }}
    >
      {/* ── Food / Beverage / Alcohol breakdown ──────────── */}
      {groups && groupTotal > 0 && (
        <GroupBar groups={groups} total={groupTotal} />
      )}

      <SectionHeader
        title="By Type"
        right={detail ? (categoryCost != null ? money2(categoryCost) : "--") : undefined}
      />

      {groups && groupTotal > 0 ? (
        ORDER.map((g) => (
          <DrillRow
            key={g}
            label={groups[g].pct != null ? `${g} (${groups[g].pct.toFixed(1)}% COGS)` : g}
            value={groups[g].cost != null ? money2(groups[g].cost) : "--"}
            sub={`${money(groups[g].revenue)} sales · ${groupTotal > 0
              ? ((groups[g].revenue / groupTotal) * 100).toFixed(0)
              : 0}% of mix${groups[g].cost == null ? " · no cost from the seed" : ""}`}
            dimmed={groups[g].cost == null}
          />
        ))
      ) : detail ? (
        <DrillRow label="No category data from Toast" value="--" sub="Sales categories may not be configured in Toast" dimmed />
      ) : null}

      {/* ── Packaging ─────────────────────────────────────── */}
      <SectionHeader title="Packaging" right={detail ? money2(detail.totalPaper) : undefined} />
      <DrillRow
        label="Dine-In"
        value={detail ? money2(detail.dineInPaper) : "--"}
        sub={detail ? paperSub(detail.dineInPaper, detail.dineInSales, "dine-in sales") : undefined}
        dimmed
      />
      <DrillRow
        label="Takeout & Delivery"
        value={detail ? money2(detail.takeoutDeliveryPaper) : "--"}
        sub={detail ? paperSub(detail.takeoutDeliveryPaper, detail.takeoutDeliverySales, "takeout + delivery sales") : undefined}
        dimmed
      />

      {/* ── 3rd Party Commissions ─────────────────────────── */}
      <SectionHeader
        title="3rd Party Commissions"
        right={detail ? money2(detail.thirdPartyCommission) : undefined}
      />
      {detail && ([
        ["DoorDash", detail.doordashSales] as const,
        ["Uber Eats", detail.ubereatsSales] as const,
        ["Grubhub", detail.grubhubSales] as const,
      ]).filter(([, sales]) => sales > 0).map(([name, sales]) => (
        <DrillRow
          key={name}
          label={name}
          value={commissionPct != null ? money2((sales * commissionPct) / 100) : "--"}
          sub={commissionPct != null ? `${commissionPct.toFixed(0)}% of ${money(sales)}` : `${money(sales)} sales · no commission rate in the feed`}
          dimmed
        />
      ))}
      {detail && !platformSplit && detail.commissionBase === 0 && detail.thirdPartyCommission === 0 && (
        <DrillRow label="No 3rd party orders" value={money(0)} dimmed />
      )}
      {detail && !platformSplit && (detail.commissionBase > 0 || detail.thirdPartyCommission !== 0) && (
        <DrillRow
          label="3rd party orders"
          value={money2(detail.thirdPartyCommission)}
          sub={commissionPct != null
            ? `${commissionPct.toFixed(0)}% of ${money(detail.commissionBase)} · the platform split isn't in the feed`
            : "the sales behind this commission aren't in the feed"}
          dimmed
        />
      )}

      {/* ── Comps & Voids ─────────────────────────────────── */}
      <SectionHeader title="Comps & Voids" />
      {compsMeasured && detail ? (
        <>
          <DrillRow
            label="Comps / Discounts"
            value={money2(detail.compValue)}
            sub={`${detail.compCount} discount${detail.compCount !== 1 ? "s" : ""} applied`}
          />
          <DrillRow
            label="Voids (est. cost)"
            value={money2(detail.voidCost)}
            sub={`${detail.voidCount} voided item${detail.voidCount !== 1 ? "s" : ""} · ${money2(detail.voidValue)} retail value`}
          />
        </>
      ) : (
        <DrillRow
          label="Comps & voids"
          value="--"
          sub={detail ? "not measured — the feed carries no comp or void columns" : undefined}
          dimmed
        />
      )}

      {/* ── Effective COGS total ──────────────────────────── */}
      <SectionHeader title="= Effective COGS" />
      {detail && parts == null && (
        <DrillRow
          label="Unattributed"
          value="--"
          sub="the rows above can't be summed — the seed sent no category costs"
          dimmed
        />
      )}
      {detail && residual != null && Math.abs(residual) >= 1 && (
        <DrillRow
          label="Unattributed"
          value={money2(residual)}
          sub="in the seed's COGS total, not in the rows above"
          dimmed
        />
      )}
      <DrillRow
        label="Total COGS"
        value={detail ? money2(detail.effectiveCOGS) : "--"}
        sub={detail
          ? (effPct != null ? `${effPct.toFixed(1)}% of net sales` : "no sales to divide by")
          : undefined}
      />

      <DrillLoad open={open} present={!!detail} status={detailStatus} subject="the COGS breakdown" load={refresh} />

    </DrillDownModal>
  );
}

import { useKpiStore } from "../stores/useKpiStore";
import { DrillDownModal, DrillRow } from "./DrillDownModal";
import { coastal } from "../theme/skins";
import type { COGSDetailResult } from "../data/toastAdapter";

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

/** Mini horizontal bar showing each category's % of revenue */
function CategoryBar({ cats, total }: { cats: COGSDetailResult["categorySales"]; total: number }) {
  if (!total) return null;
  const colors = ["#4A9B8E","#6B8FBF","#8BBF6B","#BFA96B","#BF6B6B","#9B7ABF","#4A7C6F"];
  return (
    <div style={{ padding: "14px 18px 10px" }}>
      <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", height: 10 }}>
        {cats.map((c, i) => (
          <div key={c.name}
            style={{ width: `${(c.revenue / total) * 100}%`, background: colors[i % colors.length] }}
            title={`${c.name}: ${c.revenuePct}%`}
          />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 6 }}>
        {cats.map((c, i) => (
          <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: colors[i % colors.length] }} />
            <span style={{ fontFamily: coastal.fonts.manrope, fontSize: 9, color: "#8A9C9C", fontWeight: 700 }}>
              {c.name} {c.revenuePct}%
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

  return (
    <DrillDownModal
      open={open}
      onClose={onClose}
      score={cogsTile.score}
      label="COGS"
      value={cogsTile.value}
      status={hasReal ? `${detail.effectiveCOGSPct.toFixed(1)}% effective · ${fmt$(detail.effectiveCOGS)}` : cogsTile.status}
    >
      {/* ── Category revenue bar ──────────────────────── */}
      {detail && detail.categorySales.length > 0 && (
        <CategoryBar cats={detail.categorySales} total={detail.totalRevenue} />
      )}

      {/* ── Sales by category with COGS estimate ──────── */}
      <SectionHeader
        title="By Sales Category"
        right={detail ? `${detail.categoryCOGSPct.toFixed(1)}% est. COGS` : "loading…"}
      />
      {detail ? detail.categorySales.map((cat) => (
        <DrillRow
          key={cat.name}
          label={cat.name}
          value={fmt$(cat.revenue)}
          sub={`${cat.revenuePct}% of sales · est. ${cat.cogsPct}% COGS = ${fmtDec$(cat.cogsDollars)}`}
        />
      )) : (
        <DrillRow label="Loading categories…" value="--" />
      )}

      {/* ── Packaging ─────────────────────────────────── */}
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

      {/* ── 3rd Party Commissions ─────────────────────── */}
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

      {/* ── Comps & Voids ─────────────────────────────── */}
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

      {/* ── Effective COGS total ──────────────────────── */}
      <SectionHeader title="= Effective COGS" />
      <DrillRow
        label="Total COGS"
        value={detail ? fmtDec$(detail.effectiveCOGS) : "--"}
        sub={detail ? `${detail.effectiveCOGSPct.toFixed(1)}% of net sales` : "category est. + paper + commissions + comps + voids"}
      />

      {!detail && (
        <div style={{ padding: "20px 18px", textAlign: "center",
          fontFamily: coastal.fonts.manrope, fontSize: 12, color: "#8A9C9C" }}>
          Waiting for order data…
        </div>
      )}
    </DrillDownModal>
  );
}

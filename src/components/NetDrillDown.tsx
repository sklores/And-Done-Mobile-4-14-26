import { useKpiStore } from "../stores/useKpiStore";
import { useFixedCostStore } from "../stores/useFixedCostStore";
import { DrillDownModal, DrillRow, DrillNote, DrillLoad } from "./DrillDownModal";
import { useSkin } from "../theme/skins";
import { money } from "../lib/money";

type Props = { open: boolean; onClose: () => void };

function SectionHeader({ title }: { title: string }) {
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
      }}
    >
      {title}
    </div>
  );
}

/** Visual waterfall bar showing how sales shrinks to net profit */
function WaterfallBar({ sales, prime, fixed, net }: {
  sales: number; prime: number; fixed: number; net: number;
}) {
  const skin = useSkin();
  if (sales <= 0) return null;
  const primeW  = (prime  / sales) * 100;
  const fixedW  = (fixed  / sales) * 100;
  const netW    = Math.max(0, (net / sales) * 100);
  return (
    <div style={{ padding: "14px 18px 10px" }}>
      <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", height: 12 }}>
        <div style={{ width: `${primeW}%`, background: "#4A9B8E" }} title="Prime Cost" />
        <div style={{ width: `${fixedW}%`, background: "#6B8FBF" }} title="Fixed Cost" />
        <div style={{ width: `${netW}%`,   background: net >= 0 ? "#2F6B58" : "#B94A4A" }} title="Net Profit" />
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 6, flexWrap: "wrap" }}>
        {[
          { label: "Prime", color: "#4A9B8E", pct: primeW },
          { label: "Fixed", color: "#6B8FBF", pct: fixedW },
          { label: "Net",   color: net >= 0 ? "#2F6B58" : "#B94A4A", pct: netW },
        ].map((seg) => (
          <div key={seg.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: seg.color }} />
            <span style={{ fontFamily: skin.fonts.body, fontSize: 9, color: "#8A9C9C", fontWeight: 700 }}>
              {seg.label} {seg.pct.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function NetDrillDown({ open, onClose }: Props) {
  const net          = useKpiStore((s) => s.net);
  const detail       = useKpiStore((s) => s.netDetail);
  const period       = useKpiStore((s) => s.period);
  const meta         = useKpiStore((s) => s.meta);
  const snapStatus   = useKpiStore((s) => s.status);
  const asOf         = useKpiStore((s) => s.asOf);
  const pullSnapshot = useKpiStore((s) => s.pullSnapshot);
  const rentKind     = useFixedCostStore((s) => s.rent);
  const word   = period === "day" ? "today" : period === "wtd" ? "this week" : "this month";

  const isLoss = (detail?.netDollars ?? 0) < 0;
  // The org's own rent shape, from the seed's org_rates -- the same fact the
  // Fixed sheet and the P&L read. It is not 10% because this app says so.
  const rentLabel = rentKind?.kind === "pct_of_sales" ? `Rent (${rentKind.pct}% of sales)` : "Rent";
  const shareOfSales = (part: number) =>
    detail && detail.salesDollars > 0 ? `${((part / detail.salesDollars) * 100).toFixed(1)}% of sales` : undefined;

  return (
    <DrillDownModal
      open={open}
      onClose={onClose}
      score={net.score}
      label="Net Profit"
      value={detail
        ? `${detail.netPct.toFixed(1)}%`
        : net.value}
      status={detail
        ? (isLoss ? "Net Loss" : `${money(detail.netDollars)} ${word}`)
        : word}
      feed={{ status: snapStatus, asOf, daysExpected: meta?.daysExpected, daysMissing: meta?.daysMissing }}
    >
      {/* ── Waterfall bar ─────────────────────────────── */}
      {detail && (
        <WaterfallBar
          sales={detail.salesDollars}
          prime={detail.primeDollars}
          fixed={detail.fixedDollars}
          net={detail.netDollars}
        />
      )}

      {/* ── Revenue ───────────────────────────────────── */}
      <SectionHeader title="Revenue" />
      <DrillRow
        label="Net Sales"
        value={detail ? money(detail.salesDollars) : "--"}
        sub="pre-tax · pre-tip"
      />

      {/* ── Prime Cost ────────────────────────────────── */}
      <SectionHeader title="Less: Prime Cost" />
      <DrillRow
        label="Labor"
        value={detail ? money(detail.laborDollars) : "--"}
        sub={detail ? shareOfSales(detail.laborDollars) : undefined}
        dimmed
      />
      <DrillRow
        label="COGS"
        value={detail ? money(detail.cogsDollars) : "--"}
        sub={detail ? shareOfSales(detail.cogsDollars) : undefined}
        dimmed
      />
      <DrillRow
        label="Prime Cost Total"
        value={detail ? money(detail.primeDollars) : "--"}
        sub={detail ? `${detail.primePct.toFixed(1)}% of sales` : undefined}
      />

      {/* ── Fixed Cost ────────────────────────────────── */}
      <SectionHeader title="Less: Fixed Cost" />
      <DrillRow
        label={rentLabel}
        value={detail ? money(detail.rentDollars) : "--"}
        dimmed
      />
      <DrillRow
        label="Amortized Fixed"
        value={detail ? money(detail.amortizedDollars) : "--"}
        sub="utilities · insurance · loan · etc."
        dimmed
      />
      {detail && detail.mrDollars > 0 && (
        <DrillRow
          label="Maintenance & Repair"
          value={money(detail.mrDollars)}
          sub={`logged ${word}`}
          dimmed
        />
      )}
      <DrillRow
        label="Fixed Cost Total"
        value={detail ? money(detail.fixedDollars) : "--"}
        sub={detail ? `${detail.fixedPct.toFixed(1)}% of sales` : undefined}
      />

      {/* ── Net Profit ────────────────────────────────── */}
      <SectionHeader title="= Net Profit" />
      <DrillRow
        label={isLoss ? "Net Loss" : "Net Profit"}
        value={detail ? money(detail.netDollars) : "--"}
        sub={detail ? `${detail.netPct.toFixed(1)}% margin` : undefined}
      />

      {/* Nothing for this period yet is not a failed read -- say which it is.
          A snapshot that landed with no sales is "ready" with no netDetail
          (nothing to divide by): that is an answer, so it is the named empty
          here, never "couldn't load" over a read that succeeded. */}
      {!detail && (snapStatus === "ready" || snapStatus === "empty") && (
        <DrillNote>No sales on file for {word} yet.</DrillNote>
      )}
      <DrillLoad
        open={open}
        present={!!detail || snapStatus === "ready" || snapStatus === "empty"}
        /* A snapshot that landed with nothing in it is a read that succeeded:
           it reaches this as "ready" (the named empty above says so), never as
           a failure. */
        status={snapStatus === "empty" ? "ready" : snapStatus}
        subject="the P&L for this period"
        load={pullSnapshot}
      />
    </DrillDownModal>
  );
}

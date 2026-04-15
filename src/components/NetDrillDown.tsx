import { useKpiStore } from "../stores/useKpiStore";
import { DrillDownModal, DrillRow } from "./DrillDownModal";
import { coastal } from "../theme/skins";

type Props = { open: boolean; onClose: () => void };

function fmt$(n: number) {
  return `$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function SectionHeader({ title }: { title: string }) {
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
            <span style={{ fontFamily: coastal.fonts.manrope, fontSize: 9, color: "#8A9C9C", fontWeight: 700 }}>
              {seg.label} {seg.pct.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function NetDrillDown({ open, onClose }: Props) {
  const net    = useKpiStore((s) => s.net);
  const detail = useKpiStore((s) => s.netDetail);

  const isLoss = (detail?.netDollars ?? 0) < 0;

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
        ? (isLoss ? "Net Loss" : `$${Math.round(detail.netDollars).toLocaleString()} today`)
        : "Today"}
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
        value={detail ? fmt$(detail.salesDollars) : "--"}
        sub="pre-tax · pre-tip"
      />

      {/* ── Prime Cost ────────────────────────────────── */}
      <SectionHeader title="Less: Prime Cost" />
      <DrillRow
        label="Labor"
        value={detail ? fmt$(detail.laborDollars) : "--"}
        sub={detail ? `${((detail.laborDollars / detail.salesDollars) * 100).toFixed(1)}% of sales` : undefined}
        dimmed
      />
      <DrillRow
        label="COGS"
        value={detail ? fmt$(detail.cogsDollars) : "--"}
        sub={detail ? `26.4% of sales · mocked` : undefined}
        dimmed
      />
      <DrillRow
        label="Prime Cost Total"
        value={detail ? fmt$(detail.primeDollars) : "--"}
        sub={detail ? `${detail.primePct.toFixed(1)}% of sales` : undefined}
      />

      {/* ── Fixed Cost ────────────────────────────────── */}
      <SectionHeader title="Less: Fixed Cost" />
      <DrillRow
        label="Rent (10% of sales)"
        value={detail ? fmt$(detail.rentDollars) : "--"}
        dimmed
      />
      <DrillRow
        label="Amortized Fixed"
        value={detail ? fmt$(detail.amortizedDollars) : "--"}
        sub="utilities · insurance · loan · etc."
        dimmed
      />
      {detail && detail.mrDollars > 0 && (
        <DrillRow
          label="Maintenance & Repair"
          value={fmt$(detail.mrDollars)}
          sub="logged today"
          dimmed
        />
      )}
      <DrillRow
        label="Fixed Cost Total"
        value={detail ? fmt$(detail.fixedDollars) : "--"}
        sub={detail ? `${detail.fixedPct.toFixed(1)}% of sales` : undefined}
      />

      {/* ── Net Profit ────────────────────────────────── */}
      <SectionHeader title="= Net Profit" />
      <DrillRow
        label={isLoss ? "Net Loss" : "Net Profit"}
        value={detail
          ? `${isLoss ? "−" : ""}${fmt$(detail.netDollars)}`
          : "--"}
        sub={detail ? `${detail.netPct.toFixed(1)}% margin` : undefined}
      />

      {!detail && (
        <div style={{
          padding: "24px 18px",
          textAlign: "center",
          fontFamily: coastal.fonts.manrope,
          fontSize: 12,
          color: "#8A9C9C",
        }}>
          Waiting for sales data…
        </div>
      )}
    </DrillDownModal>
  );
}

import { useKpiStore } from "../stores/useKpiStore";
import { DrillDownModal, DrillRow } from "./DrillDownModal";
import { coastal } from "../theme/skins";
import type { PmixItem } from "../data/toastAdapter";

type Props = { open: boolean; onClose: () => void };

function fmt$(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
function fmtDec$(n: number) {
  return `$${n.toFixed(2)}`;
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

function PmixRow({ item, rank, accent }: { item: PmixItem; rank: number; accent?: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "11px 18px",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
        gap: 10,
      }}
    >
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: accent ?? "#D4E8E0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          fontWeight: 800,
          color: accent ? "#fff" : "#4A7C6F",
          fontFamily: coastal.fonts.manrope,
          flexShrink: 0,
        }}
      >
        {rank}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: coastal.fonts.manrope,
            fontSize: 12,
            fontWeight: 600,
            color: "#1A2E28",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {item.name}
        </div>
        <div style={{ fontSize: 10, color: "#8A9C9C", marginTop: 1 }}>
          {item.qty} sold
        </div>
      </div>
      <div
        style={{
          fontFamily: coastal.fonts.condensed,
          fontSize: 16,
          fontWeight: 700,
          color: "#1A2E28",
          flexShrink: 0,
        }}
      >
        {fmtDec$(item.revenue)}
      </div>
    </div>
  );
}

export function SalesDrillDown({ open, onClose }: Props) {
  const sales  = useKpiStore((s) => s.sales);
  const detail = useKpiStore((s) => s.salesDetail);

  const salesDisplay = `$${sales.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  // Derive total 3rd party
  const ch = detail?.channels;
  const thirdParty  = ch ? (ch.doordash + ch.ubereats + ch.grubhub + ch.other3p) : null;
  const totalCh     = ch ? (ch.dinein + ch.takeout + ch.doordash + ch.ubereats + ch.grubhub + ch.other3p) : 0;

  function pct(val: number) {
    if (!totalCh) return "";
    return ` · ${((val / totalCh) * 100).toFixed(0)}%`;
  }

  return (
    <DrillDownModal
      open={open}
      onClose={onClose}
      score={8}
      label="Sales"
      value={salesDisplay}
      status={detail ? `${detail.pmixTop.length + detail.pmixBottom.length} items sold today` : "Today"}
    >
      {/* ── Channel Breakdown ─────────────────────────── */}
      <SectionHeader title="Sales by Channel" />

      <DrillRow
        label="Dine In"
        value={ch ? fmt$(ch.dinein) : "--"}
        sub={ch ? `${((ch.dinein / totalCh) * 100).toFixed(0)}% of sales` : undefined}
      />
      <DrillRow
        label="Takeout"
        value={ch ? fmt$(ch.takeout) : "--"}
        sub={ch ? `${((ch.takeout / totalCh) * 100).toFixed(0)}% of sales` : undefined}
      />
      <DrillRow
        label="3rd Party Total"
        value={thirdParty != null ? fmt$(thirdParty) : "--"}
        sub={ch && totalCh ? `${((thirdParty! / totalCh) * 100).toFixed(0)}% of sales` : undefined}
      />
      {ch && ch.doordash > 0 && (
        <DrillRow label="  · DoorDash"  value={fmt$(ch.doordash)} sub={`${pct(ch.doordash).replace(" · ", "")}`.trim() || undefined} dimmed />
      )}
      {ch && ch.ubereats > 0 && (
        <DrillRow label="  · Uber Eats" value={fmt$(ch.ubereats)} sub={`${pct(ch.ubereats).replace(" · ", "")}`.trim() || undefined} dimmed />
      )}
      {ch && ch.grubhub > 0 && (
        <DrillRow label="  · Grubhub"   value={fmt$(ch.grubhub)}  sub={`${pct(ch.grubhub).replace(" · ", "")}`.trim() || undefined} dimmed />
      )}
      {ch && ch.other3p > 0 && (
        <DrillRow label="  · Other"     value={fmt$(ch.other3p)}  dimmed />
      )}

      {/* ── Top Sellers ────────────────────────────────── */}
      {detail && detail.pmixTop.length > 0 && (
        <>
          <SectionHeader title="Top Sellers" />
          {detail.pmixTop.map((item, i) => (
            <PmixRow key={item.name} item={item} rank={i + 1} accent="#2F6B58" />
          ))}
        </>
      )}

      {/* ── Bottom Sellers ─────────────────────────────── */}
      {detail && detail.pmixBottom.length > 0 && (
        <>
          <SectionHeader title="Slow Movers" />
          {detail.pmixBottom.map((item, i) => (
            <PmixRow key={item.name} item={item} rank={i + 1} accent="#B94A4A" />
          ))}
        </>
      )}

      {!detail && (
        <div
          style={{
            padding: "24px 18px",
            color: "#8A9C9C",
            fontFamily: coastal.fonts.manrope,
            fontSize: 12,
            textAlign: "center",
          }}
        >
          Loading sales detail…
        </div>
      )}
    </DrillDownModal>
  );
}

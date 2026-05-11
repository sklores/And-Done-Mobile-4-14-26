import { useKpiStore } from "../stores/useKpiStore";
import { DrillDownModal, DrillRow } from "./DrillDownModal";
import { coastal } from "../theme/skins";
import { computeSalesState, getDailyTarget } from "../config/salesTargetConfig";
import type { PmixItem, HourlySales } from "../data/toastAdapter";

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

// ── Sales by Hour ───────────────────────────────────────────────────────────
function formatHour(h: number): string {
  const ampm = h < 12 ? "a" : "p";
  const hr12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hr12}${ampm}`;
}

function HourBarRow({
  entry,
  peakSales,
  highlight,
}: {
  entry: HourlySales;
  peakSales: number;
  highlight: boolean;
}) {
  // Bar width as a % of the peak hour; clamp to >=2% so zero-sales hours still
  // render a visible stub on the track.
  const pctOfPeak = peakSales > 0 ? (entry.sales / peakSales) * 100 : 0;
  const barWidth  = entry.sales > 0 ? Math.max(pctOfPeak, 4) : 0;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "8px 18px",
        gap: 10,
        borderBottom: "1px solid rgba(0,0,0,0.04)",
      }}
    >
      <div
        style={{
          width: 36,
          fontFamily: coastal.fonts.manrope,
          fontSize: 11,
          fontWeight: 700,
          color: "#8A9C9C",
          letterSpacing: ".02em",
          flexShrink: 0,
        }}
      >
        {formatHour(entry.hour)}
      </div>
      <div
        style={{
          flex: 1,
          height: 18,
          background: "rgba(47,107,88,0.08)",
          borderRadius: 4,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${barWidth}%`,
            height: "100%",
            background: highlight ? "#2F6B58" : "rgba(47,107,88,0.55)",
            borderRadius: 4,
            transition: "width 0.4s ease",
          }}
        />
      </div>
      <div
        style={{
          width: 64,
          textAlign: "right",
          fontFamily: coastal.fonts.condensed,
          fontSize: 13,
          fontWeight: 700,
          color: "#1A2E28",
          flexShrink: 0,
        }}
      >
        {entry.sales > 0 ? fmt$(entry.sales) : "—"}
      </div>
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
  const sales           = useKpiStore((s) => s.sales);
  const detail          = useKpiStore((s) => s.salesDetail);
  const scheduleDetail  = useKpiStore((s) => s.scheduleDetail);

  const salesDisplay = `$${sales.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  // Sales score: projection-based (see salesTargetConfig.ts)
  const target = getDailyTarget();
  const salesState = computeSalesState(
    sales.value,
    scheduleDetail?.todayWindowStart ?? null,
    scheduleDetail?.todayWindowEnd   ?? null,
    target,
  );
  const salesScore = salesState.score;

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
      score={salesScore}
      label="Sales"
      value={salesDisplay}
      status={salesState.message}
    >
      {/* ── Projection breakdown ──────────────────────── */}
      <SectionHeader title="Day Projection" />
      <DrillRow
        label="Daily target"
        value={target > 0 ? fmt$(target) : "Closed"}
        sub={target > 0 ? `today's day-of-week target` : "no target — tile shows neutral"}
      />
      {salesState.usingDefaultWindow && (
        <DrillRow
          label="Operating window"
          value="typical hours"
          sub="no shifts scheduled — using default day-of-week window"
          dimmed
        />
      )}
      {salesState.projected !== null && (
        <DrillRow
          label="Projected end-of-day"
          value={fmt$(salesState.projected)}
          sub={target > 0 ? `${Math.round((salesState.projected / target) * 100)}% of target` : undefined}
        />
      )}
      {salesState.pace !== null && salesState.state !== "post-close" && (
        <DrillRow
          label="Running pace"
          value={`${Math.round(salesState.pace * 100)}%`}
          sub={
            salesState.pace >= 1.10 ? "ahead of expected curve"
            : salesState.pace >= 0.95 ? "on track"
            : salesState.pace >= 0.80 ? "slightly behind"
            : "well behind expected curve"
          }
        />
      )}
      {salesState.state === "pre-open" && (
        <DrillRow label="Status" value="Pre-open" dimmed />
      )}
      {salesState.state === "just-opened" && (
        <DrillRow label="Status" value="Just opened" sub="too early to project — wait until ~10% of window" dimmed />
      )}

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

      {/* ── Sales by Hour ─────────────────────────────── */}
      {detail && detail.byHour && detail.byHour.length > 0 && (() => {
        const peakSales = Math.max(...detail.byHour.map((e) => e.sales));
        return (
          <>
            <SectionHeader title="Sales by Hour (operating hours)" />
            {detail.byHour.map((e) => (
              <HourBarRow
                key={e.hour}
                entry={e}
                peakSales={peakSales}
                highlight={e.sales === peakSales && peakSales > 0}
              />
            ))}
          </>
        );
      })()}

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

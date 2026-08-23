import { useEffect, useState } from "react";
import { DrillDownModal, DrillRow } from "./DrillDownModal";
import { useSkin } from "../theme/skins";
import { fetchAging, agingToDebtScore, type AgingSnapshot } from "../data/agingAdapter";

type Props = { open: boolean; onClose: () => void };

const fmt$ = (n: number) => `$${Math.round(n).toLocaleString()}`;

function SectionHeader({ title }: { title: string }) {
  const skin = useSkin();
  return (
    <div style={{
      padding: "10px 18px 4px", fontSize: 9, fontWeight: 700, letterSpacing: ".1em",
      textTransform: "uppercase", color: "#8A9C9C", fontFamily: skin.fonts.body,
      background: "#F2F7F6", borderTop: "1px solid rgba(0,0,0,0.05)",
      borderBottom: "1px solid rgba(0,0,0,0.05)",
    }}>{title}</div>
  );
}

export function DebtDrillDown({ open, onClose }: Props) {
  const skin = useSkin();
  const [aging, setAging] = useState<AgingSnapshot | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchAging().then((a) => { if (!cancelled) setAging(a); });
    return () => { cancelled = true; };
  }, [open]);

  const score = agingToDebtScore(aging?.over90 ?? 0);

  // Bucket rows, oldest-first so the worst money reads at the top of the list.
  const buckets = aging ? [
    { label: "Over 90 days", value: aging.over90, danger: true },
    { label: "61 – 90 days", value: aging.d61_90, danger: true },
    { label: "31 – 60 days", value: aging.d31_60, danger: false },
    { label: "1 – 30 days",  value: aging.d1_30,  danger: false },
    { label: "Current",      value: aging.current, danger: false },
  ] : [];

  return (
    <DrillDownModal
      open={open}
      onClose={onClose}
      score={score}
      label="Debt"
      value={aging ? fmt$(aging.totalOpen) : "--"}
      status={aging ? `A/P open · as of ${aging.reportDate}` : "Loading"}
    >
      {aging ? (
        <>
          <SectionHeader title="Aging Buckets" />
          {buckets.map((b) => (
            <DrillRow
              key={b.label}
              label={b.label}
              value={fmt$(b.value)}
              sub={aging.totalOpen > 0 ? `${((b.value / aging.totalOpen) * 100).toFixed(0)}% of balance` : undefined}
              dimmed={b.value === 0}
            />
          ))}

          <SectionHeader title="Past Due" />
          <DrillRow
            label="Total overdue"
            value={fmt$(aging.overdue)}
            sub={aging.totalOpen > 0 ? `${((aging.overdue / aging.totalOpen) * 100).toFixed(0)}% of balance` : undefined}
          />

          <SectionHeader title={`Vendors (${aging.vendors.length})`} />
          {aging.vendors.map((v) => {
            const late = v.days_61_90 + v.days_over_90;
            return (
              <DrillRow
                key={v.vendor_name}
                label={v.vendor_name}
                value={fmt$(v.total)}
                sub={late > 0 ? `${fmt$(late)} past 60d` : v.current > 0 && v.total === v.current ? "current" : undefined}
              />
            );
          })}

          <div style={{
            padding: "12px 18px 4px", fontSize: 10, color: "#8A9C9C",
            fontFamily: skin.fonts.body, textAlign: "center",
          }}>
            From the QuickBooks A/P aging summary{aging.source ? ` (via ${aging.source})` : ""}.
          </div>
        </>
      ) : (
        <div style={{ padding: "24px 18px", color: "#8A9C9C", fontFamily: skin.fonts.body, fontSize: 12, textAlign: "center" }}>
          Loading debt detail…
        </div>
      )}
    </DrillDownModal>
  );
}

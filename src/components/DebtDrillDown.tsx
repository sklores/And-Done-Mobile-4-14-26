import { useCallback, useEffect, useRef, useState } from "react";
import { DrillDownModal, DrillRow, DrillNote, DrillRetry } from "./DrillDownModal";
import { useSkin } from "../theme/skins";
import { fetchAgingResult, agingToDebtScore, type AgingSnapshot } from "../data/agingAdapter";
import { money } from "../lib/money";

type Props = { open: boolean; onClose: () => void };

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
  const [phase, setPhase] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const inFlight = useRef(false);

  const load = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    // setState only inside the promise chain — never synchronously in an effect.
    void Promise.resolve()
      .then(() => { setPhase("loading"); return fetchAgingResult(); })
      // The adapter's three answers stay three: a snapshot, no A/P report on
      // file yet (the seed answered "nothing"), and a read that failed. Only
      // the first says what is owed, and the last two never render the same.
      .then((r) => {
        if (r.status === "ready") { setAging(r.data); setPhase("ready"); }
        else if (r.status === "empty") { setPhase("empty"); }
        else { setPhase("error"); }   // the read failed; it is not "$0 owed"
      })
      .catch(() => setPhase("error"))
      .finally(() => { inFlight.current = false; });
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
  }, [open, load]);

  // Nothing read = nothing to score. A missing A/P snapshot used to score 8
  // (over90 ?? 0) and paint this sheet's header the best colour on the ramp,
  // so the SNAPSHOT goes in and `null` (neutral) comes back when there is no
  // report. A report that DID read is scored however old it is.
  const score = agingToDebtScore(aging);

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
      value={aging ? money(aging.totalOpen) : "--"}
      status={aging
        ? `A/P open · ${aging.reportDate ? `as of ${aging.reportDate}` : "no report date on the row"}${phase === "error" ? " · couldn't refresh" : ""}`
        : phase === "empty" ? "No A/P report yet"
        : phase === "error" ? "Couldn't load" : "Loading"}
    >
      {aging ? (
        <>
          <SectionHeader title="Aging Buckets" />
          {buckets.map((b) => (
            <DrillRow
              key={b.label}
              label={b.label}
              value={money(b.value)}
              sub={aging.totalOpen > 0 ? `${((b.value / aging.totalOpen) * 100).toFixed(0)}% of balance` : undefined}
              dimmed={b.value === 0}
            />
          ))}

          <SectionHeader title="Past Due" />
          <DrillRow
            label="Total overdue"
            value={money(aging.overdue)}
            sub={aging.totalOpen > 0 ? `${((aging.overdue / aging.totalOpen) * 100).toFixed(0)}% of balance` : undefined}
          />

          <SectionHeader title={`Vendors (${aging.vendors.length})`} />
          {aging.vendors.map((v) => {
            const late = v.days_61_90 + v.days_over_90;
            return (
              <DrillRow
                key={v.vendor_name}
                label={v.vendor_name}
                value={money(v.total)}
                sub={late > 0 ? `${money(late)} past 60d` : v.current > 0 && v.total === v.current ? "current" : undefined}
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
      ) : phase === "empty" ? (
        <DrillNote>
          No A/P aging report on file yet.
          <br />
          <span style={{ opacity: 0.65, fontSize: 10 }}>
            The QuickBooks A/P aging summary lands by email; nothing has arrived here.
          </span>
        </DrillNote>
      ) : phase === "error" ? (
        <DrillRetry subject="the A/P aging summary" onRetry={load} />
      ) : (
        <DrillNote>Loading debt detail…</DrillNote>
      )}
    </DrillDownModal>
  );
}

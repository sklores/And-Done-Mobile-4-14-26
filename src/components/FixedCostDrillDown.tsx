import { useState } from "react";
import { useKpiStore, PERIOD_LABEL } from "../stores/useKpiStore";
import { useFixedCostStore } from "../stores/useFixedCostStore";
import { useMaintenanceStore } from "../stores/useMaintenanceStore";
import { DrillDownModal, DrillRow } from "./DrillDownModal";
import { useSkin } from "../theme/skins";

type Props = { open: boolean; onClose: () => void };

function fmt$(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
function fmtDec$(n: number) {
  return `$${n.toFixed(2)}`;
}

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
      {right && <span style={{ fontSize: 9, opacity: 0.65 }}>{right}</span>}
    </div>
  );
}

function AddMRForm({ onAdd }: { onAdd: () => void }) {
  const skin = useSkin();
  const addEntry = useMaintenanceStore((s) => s.addEntry);
  const [amount, setAmount]   = useState("");
  const [desc, setDesc]       = useState("");
  const [error, setError]     = useState("");

  function submit() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError("Enter a valid amount"); return; }
    if (!desc.trim())     { setError("Add a description"); return; }
    addEntry(amt, desc);
    setAmount(""); setDesc(""); setError("");
    onAdd();
  }

  const inputStyle: React.CSSProperties = {
    fontFamily: skin.fonts.body,
    fontSize: 13,
    padding: "8px 10px",
    borderRadius: 8,
    border: "1.5px solid #C8D8D4",
    background: "#fff",
    color: "#1A2E28",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  };

  return (
    <div style={{ padding: "12px 18px 4px", display: "flex", flexDirection: "column", gap: 8 }}>
      {error && (
        <div style={{ fontSize: 11, color: "#B94A4A", fontFamily: skin.fonts.body }}>{error}</div>
      )}
      <input
        type="number"
        placeholder="Amount ($)"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        style={inputStyle}
      />
      <input
        type="text"
        placeholder="Description (e.g. Hood cleaning)"
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        style={inputStyle}
      />
      <button
        onClick={submit}
        style={{
          background: "#2F6B58",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "9px 0",
          fontFamily: skin.fonts.body,
          fontWeight: 700,
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        Log Expense
      </button>
    </div>
  );
}

export function FixedCostDrillDown({ open, onClose }: Props) {
  const skin = useSkin();
  const fixedTile   = useKpiStore((s) => s.tiles.find((t) => t.key === "fixed"));
  const detail      = useKpiStore((s) => s.netDetail);
  const period      = useKpiStore((s) => s.period);
  const meta        = useKpiStore((s) => s.meta);
  const entries     = useMaintenanceStore((s) => s.entries);
  const mrTotal     = useMaintenanceStore((s) => s.total);
  const removeEntry = useMaintenanceStore((s) => s.removeEntry);
  const lineItems   = useFixedCostStore((s) => s.lineItems);
  const monthlyTotal = useFixedCostStore((s) => s.monthlyTotal);
  const rentKind    = useFixedCostStore((s) => s.rent);
  const [showForm, setShowForm] = useState(false);

  if (!fixedTile) return null;
  const word = PERIOD_LABEL[period].toLowerCase();
  // Every dollar here is the seed's number for the selected period (the same
  // row the tile is built from). Overhead is split across the monthly list
  // in proportion -- the total is the seed's, the split is for reading.
  const rent = detail?.rentDollars ?? 0, amortized = detail?.amortizedDollars ?? 0, total = detail?.fixedDollars ?? 0;
  const salesVal = detail?.salesDollars ?? 0;
  const fixedPct = salesVal > 0 ? (total / salesVal) * 100 : null;
  const share = (monthly: number) => (monthlyTotal > 0 ? amortized * (monthly / monthlyTotal) : 0);
  const rentLabel = rentKind?.kind === "pct_of_sales" ? `Rent (${rentKind.pct}% of sales)` : "Rent";

  return (
    <DrillDownModal open={open} onClose={onClose} score={fixedTile.score} label="Fixed Cost" value={fixedTile.value} status={fixedTile.status}>
      <DrillRow
        label={`Total fixed · ${word}`}
        value={fmt$(total)}
        sub={fixedPct != null ? `${fixedPct.toFixed(1)}% of net sales${meta && meta.daysMissing > 0 ? ` · ${meta.daysMissing} day${meta.daysMissing === 1 ? "" : "s"} missing` : ""}` : detail ? "no sales yet" : "—"}
      />

      <SectionHeader title="Rent" right={rentKind?.kind === "pct_of_sales" ? "% of sales" : "flat, prorated"} />
      <DrillRow label={rentLabel} value={fmtDec$(rent)} sub={salesVal > 0 ? `on ${fmt$(salesVal)} net sales ${word}` : "—"} />

      <SectionHeader title={`Overhead · ${word}`} right={monthlyTotal > 0 ? `${fmt$(monthlyTotal)}/mo` : undefined} />
      {lineItems.length === 0 ? (
        <div style={{ padding: "10px 18px", fontSize: 12, color: "#8A9C9C", fontFamily: skin.fonts.body }}>No fixed-cost list yet — set it up in the Pro Forma room.</div>
      ) : lineItems.map((item) => (
        <DrillRow key={item.label} label={item.label} value={fmtDec$(share(item.monthlyAmount))} sub={`${fmt$(item.monthlyAmount)}/mo`} />
      ))}
      <DrillRow label={`Overhead ${word}`} value={fmtDec$(amortized)} sub={period === "day" ? "accrues through the day" : `${meta?.daysClosed ?? 0} closed day${meta?.daysClosed === 1 ? "" : "s"} + today`} dimmed />

      <SectionHeader title="Maintenance & Repair" right={mrTotal > 0 ? `${fmt$(mrTotal)} ${word}` : `none ${word}`} />
      {entries.length === 0 && !showForm && (
        <div style={{ padding: "10px 18px", fontSize: 12, color: "#8A9C9C", fontFamily: skin.fonts.body }}>No M&R logged {word}.</div>
      )}
      {entries.map((entry) => (
        <div key={entry.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 18px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: skin.fonts.body, fontSize: 12, fontWeight: 600, color: "#4A5A54" }}>{entry.description || "M&R"}</div>
            <div style={{ fontSize: 10, color: "#8A9C9C", marginTop: 1 }}>{period === "day" ? "tap × to remove" : `${entry.date.slice(5).replace("-", "/")} · tap × to remove`}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontFamily: skin.fonts.display, fontSize: 16, fontWeight: 700, color: "#B94A4A" }}>{fmt$(entry.amount)}</div>
            <button type="button" aria-label="Remove" onClick={() => removeEntry(entry.id)} style={{ width: 36, height: 36, borderRadius: "50%", border: "none", padding: 0, background: "rgba(0,0,0,0.08)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 14, color: "#4A5A54", fontWeight: 700 }}>×</button>
          </div>
        </div>
      ))}

      {showForm && <AddMRForm onAdd={() => setShowForm(false)} />}
      {!showForm && (
        <button type="button" onClick={() => setShowForm(true)} style={{ display: "block", width: "calc(100% - 36px)", margin: "10px 18px", padding: "11px 0", borderRadius: 8, border: "1.5px dashed #C8D8D4", background: "transparent", textAlign: "center", fontFamily: skin.fonts.body, fontSize: 12, fontWeight: 700, color: "#4A7C6F", cursor: "pointer" }}>
          + Log M&R Expense
        </button>
      )}
    </DrillDownModal>
  );
}

import { useState } from "react";
import { useKpiStore } from "../stores/useKpiStore";
import { useMaintenanceStore } from "../stores/useMaintenanceStore";
import { DrillDownModal, DrillRow } from "./DrillDownModal";
import { coastal } from "../theme/skins";
import {
  FIXED_LINE_ITEMS,
  MONTHLY_FIXED_TOTAL,
  RENT_PCT,
  dailyFixed,
  dailyLineItem,
} from "../config/fixedCostConfig";

type Props = { open: boolean; onClose: () => void };

function fmt$(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
function fmtDec$(n: number) {
  return `$${n.toFixed(2)}`;
}

function SectionHeader({ title, right }: { title: string; right?: string }) {
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
    fontFamily: coastal.fonts.manrope,
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
        <div style={{ fontSize: 11, color: "#B94A4A", fontFamily: coastal.fonts.manrope }}>{error}</div>
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
          fontFamily: coastal.fonts.manrope,
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
  const fixedTile   = useKpiStore((s) => s.tiles.find((t) => t.key === "fixed"));
  const salesVal    = useKpiStore((s) => s.sales.value);
  const allEntries  = useMaintenanceStore((s) => s.entries);
  const removeEntry = useMaintenanceStore((s) => s.removeEntry);

  const todayStr    = new Date().toISOString().slice(0, 10);
  const todayEntries = allEntries.filter((e) => e.date === todayStr);
  const todayMR      = todayEntries.reduce((sum, e) => sum + e.amount, 0);

  const [showForm, setShowForm] = useState(false);

  if (!fixedTile) return null;

  const rentCost      = salesVal * RENT_PCT;
  const amortized     = dailyFixed();
  const totalFixed    = rentCost + amortized + todayMR;
  const fixedPct      = salesVal > 0 ? (totalFixed / salesVal) * 100 : null;

  return (
    <DrillDownModal
      open={open}
      onClose={onClose}
      score={fixedTile.score}
      label="Fixed Cost"
      value={fixedTile.value}
      status={fixedTile.status}
    >
      {/* ── Summary row ───────────────────────────────── */}
      <DrillRow
        label="Total Fixed Today"
        value={fmt$(totalFixed)}
        sub={fixedPct != null ? `${fixedPct.toFixed(1)}% of net sales` : "no sales yet"}
      />

      {/* ── Rent (variable) ───────────────────────────── */}
      <SectionHeader title="Rent" right="% of sales" />
      <DrillRow
        label="Rent (10% of sales)"
        value={fmtDec$(rentCost)}
        sub={salesVal > 0 ? `based on ${fmt$(salesVal)} net sales` : "—"}
      />

      {/* ── Monthly fixed amortized ────────────────────── */}
      <SectionHeader
        title="Fixed — Amortized Daily"
        right={`${fmt$(MONTHLY_FIXED_TOTAL)}/mo`}
      />
      {FIXED_LINE_ITEMS.map((item) => {
        const daily = dailyLineItem(item);
        return (
          <DrillRow
            key={item.key}
            label={item.label}
            value={fmtDec$(daily)}
            sub={`${fmt$(item.monthlyAmount)}/mo${item.note ? ` · ${item.note}` : ""}`}
          />
        );
      })}
      <DrillRow
        label="Daily Fixed Total"
        value={fmtDec$(amortized)}
        sub="all line items combined"
        dimmed
      />

      {/* ── Maintenance & Repair ──────────────────────── */}
      <SectionHeader
        title="Maintenance & Repair"
        right={todayMR > 0 ? fmt$(todayMR) + " today" : "none today"}
      />

      {todayEntries.length === 0 && !showForm && (
        <div style={{
          padding: "10px 18px",
          fontSize: 12,
          color: "#8A9C9C",
          fontFamily: coastal.fonts.manrope,
        }}>
          No M&R logged today.
        </div>
      )}

      {todayEntries.map((entry) => (
        <div
          key={entry.id}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "11px 18px",
            borderBottom: "1px solid rgba(0,0,0,0.06)",
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: coastal.fonts.manrope, fontSize: 12, fontWeight: 600, color: "#4A5A54" }}>
              {entry.description}
            </div>
            <div style={{ fontSize: 10, color: "#8A9C9C", marginTop: 1 }}>
              {entry.flagged ? "🏦 flagged" : "tap × to remove"}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontFamily: coastal.fonts.condensed, fontSize: 16, fontWeight: 700, color: "#B94A4A" }}>
              {fmt$(entry.amount)}
            </div>
            <div
              onClick={() => removeEntry(entry.id)}
              style={{
                width: 22, height: 22,
                borderRadius: "50%",
                background: "rgba(0,0,0,0.08)",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer",
                fontSize: 12, color: "#4A5A54", fontWeight: 700,
              }}
            >
              ×
            </div>
          </div>
        </div>
      ))}

      {showForm && <AddMRForm onAdd={() => setShowForm(false)} />}

      {!showForm && (
        <div
          onClick={() => setShowForm(true)}
          style={{
            margin: "10px 18px",
            padding: "9px 0",
            borderRadius: 8,
            border: "1.5px dashed #C8D8D4",
            textAlign: "center",
            fontFamily: coastal.fonts.manrope,
            fontSize: 12,
            fontWeight: 700,
            color: "#4A7C6F",
            cursor: "pointer",
          }}
        >
          + Log M&R Expense
        </div>
      )}
    </DrillDownModal>
  );
}

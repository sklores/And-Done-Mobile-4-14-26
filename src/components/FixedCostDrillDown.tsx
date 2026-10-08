import { useState } from "react";
import { useKpiStore, PERIOD_LABEL } from "../stores/useKpiStore";
import { useFixedCostStore } from "../stores/useFixedCostStore";
import { useMaintenanceStore } from "../stores/useMaintenanceStore";
import { DrillDownModal, DrillRow, DrillNote, DrillLoad } from "./DrillDownModal";
import { useSkin } from "../theme/skins";
import { money, money2 } from "../lib/money";

type Props = { open: boolean; onClose: () => void };

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

  const [busy, setBusy] = useState(false);
  async function submit() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError("Enter a valid amount"); return; }
    if (!desc.trim())     { setError("Add a description"); return; }
    setBusy(true);
    try {
      await addEntry(amt, desc);     // the form only closes once the seed has it
      setAmount(""); setDesc(""); setError("");
      onAdd();
    } catch (e) {
      // A save that didn't land keeps the operator's text on screen.
      setError(e instanceof Error ? `Not saved — ${e.message}` : "Not saved — could not reach the seed");
    } finally { setBusy(false); }
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
        onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
        style={inputStyle}
      />
      <button
        onClick={() => { if (!busy) void submit(); }}
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
        {busy ? "Saving…" : "Log Expense"}
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
  const snapStatus  = useKpiStore((s) => s.status);
  const asOf        = useKpiStore((s) => s.asOf);
  const pullSnapshot = useKpiStore((s) => s.pullSnapshot);
  const entries     = useMaintenanceStore((s) => s.entries);
  const mrTotal     = useMaintenanceStore((s) => s.total);
  const mrLoaded    = useMaintenanceStore((s) => s.loaded);
  const hydrateMr   = useMaintenanceStore((s) => s.hydrate);
  const mrStatus    = useMaintenanceStore((s) => s.status);
  const removeEntry = useMaintenanceStore((s) => s.removeEntry);
  const lineItems   = useFixedCostStore((s) => s.lineItems);
  const monthlyTotal = useFixedCostStore((s) => s.monthlyTotal);
  const hydrated    = useFixedCostStore((s) => s.hydrated);
  const hydrateFixed = useFixedCostStore((s) => s.hydrate);
  const fixedStatus = useFixedCostStore((s) => s.status);
  const rentKind    = useFixedCostStore((s) => s.rent);
  const [showForm, setShowForm] = useState(false);
  const [removeError, setRemoveError] = useState("");

  if (!fixedTile) return null;
  const word = PERIOD_LABEL[period].toLowerCase();
  // Every dollar here is the seed's number for the selected period (the same
  // row the tile is built from), or "--" when that row isn't here. No zeros
  // standing in for a number we don't have.
  const rent = detail?.rentDollars ?? null;
  const amortized = detail?.amortizedDollars ?? null;
  const total = detail?.fixedDollars ?? null;
  const salesVal = detail?.salesDollars ?? null;
  const fixedPct = total != null && salesVal != null && salesVal > 0 ? (total / salesVal) * 100 : null;

  // Overhead is split across the monthly list in proportion -- the total is
  // the seed's, the split is for reading. Null, not 0, when there is no
  // period total to split or no list to split it across.
  const share = (monthly: number): number | null =>
    amortized != null && monthlyTotal > 0 ? amortized * (monthly / monthlyTotal) : null;
  // Why a dollar figure above reads "--": a snapshot that landed with no sales
  // ("ready", no netDetail) is an answer, so it says so.
  const noSalesYet = detail != null || snapStatus === "ready" ? "no sales yet" : undefined;
  const rentLabel = rentKind?.kind === "pct_of_sales" ? `Rent (${rentKind.pct}% of sales)` : "Rent";

  async function remove(id: string) {
    setRemoveError("");
    try {
      await removeEntry(id);
      if (useMaintenanceStore.getState().entries.some((e) => e.id === id)) {
        setRemoveError("Couldn't remove that entry — it's still on the seed.");
      }
    } catch {
      setRemoveError("Couldn't remove that entry — it's still on the seed.");
    }
  }

  return (
    <DrillDownModal
      open={open}
      onClose={onClose}
      score={fixedTile.score}
      label="Fixed Cost"
      value={fixedTile.value}
      status={fixedTile.status}
      feed={{ status: snapStatus, asOf, daysExpected: meta?.daysExpected, daysMissing: meta?.daysMissing }}
    >
      <DrillRow
        label={`Total fixed · ${word}`}
        value={total != null ? money(total) : "--"}
        sub={fixedPct != null ? `${fixedPct.toFixed(1)}% of net sales` : noSalesYet}
      />

      <SectionHeader title="Rent" right={rentKind?.kind === "pct_of_sales" ? "% of sales" : rentKind ? "flat, prorated" : undefined} />
      <DrillRow
        label={rentLabel}
        value={rent != null ? money2(rent) : "--"}
        sub={salesVal != null && salesVal > 0 ? `on ${money(salesVal)} net sales ${word}` : noSalesYet}
      />

      <SectionHeader title={`Overhead · ${word}`} right={monthlyTotal > 0 ? `${money(monthlyTotal)}/mo` : undefined} />
      {!hydrated ? (
        <DrillLoad open={open} present={hydrated} status={fixedStatus} subject="the fixed-cost list" load={hydrateFixed} />
      ) : lineItems.length === 0 ? (
        <div style={{ padding: "10px 18px", fontSize: 12, color: "#8A9C9C", fontFamily: skin.fonts.body }}>No fixed-cost list loaded — set it up in the Pro Forma room.</div>
      ) : lineItems.map((item) => {
        const s = share(item.monthlyAmount);
        return (
          <DrillRow
            key={item.label}
            label={item.label}
            value={s != null ? money2(s) : "--"}
            sub={`${money(item.monthlyAmount)}/mo`}
            dimmed={s == null}
          />
        );
      })}
      <DrillRow
        label={`Overhead ${word}`}
        value={amortized != null ? money2(amortized) : "--"}
        sub={period === "day" ? "accrues through the day" : meta ? `${meta.daysClosed} closed day${meta.daysClosed === 1 ? "" : "s"} + today` : undefined}
        dimmed
      />

      <SectionHeader title="Maintenance & Repair" right={!mrLoaded ? "not loaded" : mrTotal > 0 ? `${money(mrTotal)} ${word}` : `none ${word}`} />
      <DrillLoad open={open} present={mrLoaded} status={mrStatus} subject="the M&R log" load={() => hydrateMr(period)} />
      {mrLoaded && entries.length === 0 && !showForm && (
        <div style={{ padding: "10px 18px", fontSize: 12, color: "#8A9C9C", fontFamily: skin.fonts.body }}>No M&R logged {word}.</div>
      )}
      {removeError && (
        <div style={{ padding: "8px 18px", fontSize: 11, color: "#B94A4A", fontFamily: skin.fonts.body }}>{removeError}</div>
      )}
      {entries.map((entry) => (
        <div key={entry.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 18px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: skin.fonts.body, fontSize: 12, fontWeight: 600, color: "#4A5A54" }}>{entry.description || "M&R"}</div>
            <div style={{ fontSize: 10, color: "#8A9C9C", marginTop: 1 }}>{period === "day" ? "tap × to remove" : `${entry.date.slice(5).replace("-", "/")} · tap × to remove`}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontFamily: skin.fonts.display, fontSize: 16, fontWeight: 700, color: "#B94A4A" }}>{money(entry.amount)}</div>
            <button type="button" aria-label="Remove" onClick={() => void remove(entry.id)} style={{ width: 36, height: 36, borderRadius: "50%", border: "none", padding: 0, background: "rgba(0,0,0,0.08)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 14, color: "#4A5A54", fontWeight: 700 }}>×</button>
          </div>
        </div>
      ))}

      {showForm && <AddMRForm onAdd={() => setShowForm(false)} />}
      {!showForm && (
        <button type="button" onClick={() => setShowForm(true)} style={{ display: "block", width: "calc(100% - 36px)", margin: "10px 18px", padding: "11px 0", borderRadius: 8, border: "1.5px dashed #C8D8D4", background: "transparent", textAlign: "center", fontFamily: skin.fonts.body, fontSize: 12, fontWeight: 700, color: "#4A7C6F", cursor: "pointer" }}>
          + Log M&R Expense
        </button>
      )}

      {/* A snapshot that landed with no sales is "ready" with no netDetail --
          an answer, so it is the named empty and never "couldn't load". */}
      {!detail && (snapStatus === "ready" || snapStatus === "empty") && (
        <DrillNote>No fixed cost booked for {word} yet.</DrillNote>
      )}
      <DrillLoad
        open={open}
        present={!!detail || snapStatus === "ready" || snapStatus === "empty"}
        /* A snapshot with nothing in it is an answer, not a failure: it lands
           here as "ready" and the named empty above is what shows. */
        status={snapStatus === "empty" ? "ready" : snapStatus}
        subject="this period's fixed costs"
        load={pullSnapshot}
      />
    </DrillDownModal>
  );
}

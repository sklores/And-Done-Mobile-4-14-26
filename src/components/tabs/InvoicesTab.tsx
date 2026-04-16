import { useRef, useState } from "react";
import { TabPanel } from "./TabPanel";
import { coastal } from "../../theme/skins";

type Props = { open: boolean; onClose: () => void };

type Invoice = {
  id: string;
  vendor: string;
  amount: number;
  date: string;
  category: string;
  status: "paid" | "pending" | "scanned";
};

const MOCK_INVOICES: Invoice[] = [
  { id: "1", vendor: "Sysco",               amount: 1247.50, date: "Apr 14", category: "Food",      status: "paid"    },
  { id: "2", vendor: "Republic National",   amount:  892.00, date: "Apr 12", category: "Alcohol",   status: "paid"    },
  { id: "3", vendor: "DC Central Kitchen",  amount:  543.20, date: "Apr 10", category: "Food",      status: "pending" },
  { id: "4", vendor: "Ecolab",              amount:  312.00, date: "Apr 8",  category: "Supplies",  status: "paid"    },
  { id: "5", vendor: "DC Office Supplies",  amount:   89.40, date: "Apr 8",  category: "Paper",     status: "paid"    },
];

const VENDORS = [
  "Sysco",
  "US Foods",
  "Republic National",
  "DC Central Kitchen",
  "Gordon Food Service",
  "Ecolab",
  "DC Office Supplies",
  "Pepco (Electric)",
  "DC Water",
  "Toast (POS Fees)",
  "Other / Custom",
];

const CATEGORIES = [
  "Food",
  "Alcohol",
  "Supplies",
  "Paper",
  "Labor",
  "Utilities",
  "Rent",
  "Equipment",
  "Marketing",
  "Other",
];

const STATUS_COLOR = { paid: "#4EC89A", pending: "#FFE070", scanned: "#7EB8D8" };
const STATUS_TEXT  = { paid: "#084020", pending: "#6A4800", scanned: "#0A3A5A" };

function todayLabel() {
  return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const ACCENT = "#2A3C48";

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1.5px solid #D0D8DC",
  fontFamily: coastal.fonts.manrope,
  fontSize: 13,
  fontWeight: 600,
  color: "#1A2E28",
  background: "#fff",
  appearance: "none",
  WebkitAppearance: "none",
  backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%238A9C9C' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 12px center",
  paddingRight: 32,
};

export function InvoicesTab({ open, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [scanned, setScanned]       = useState<Invoice[]>([]);
  const [manual, setManual]         = useState<Invoice[]>([]);
  const [preview, setPreview]       = useState<string | null>(null);
  const [showForm, setShowForm]     = useState(false);

  // Form state
  const [vendor,   setVendor]   = useState(VENDORS[0]);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [amount,   setAmount]   = useState("");

  function handleCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    const mock: Invoice = {
      id: `scan-${Date.now()}`,
      vendor: "Scanned Invoice",
      amount: 0,
      date: todayLabel(),
      category: "Uncategorized",
      status: "scanned",
    };
    setScanned((s) => [mock, ...s]);
    e.target.value = "";
  }

  function handleSave() {
    const parsed = parseFloat(amount.replace(/[^0-9.]/g, ""));
    if (!parsed || parsed <= 0) return;
    const entry: Invoice = {
      id: `manual-${Date.now()}`,
      vendor,
      amount: parsed,
      date: todayLabel(),
      category,
      status: "pending",
    };
    setManual((m) => [entry, ...m]);
    // Reset form
    setAmount("");
    setVendor(VENDORS[0]);
    setCategory(CATEGORIES[0]);
    setShowForm(false);
  }

  const allInvoices   = [...scanned, ...manual, ...MOCK_INVOICES];
  const totalPending  = allInvoices
    .filter((i) => i.status === "pending")
    .reduce((s, i) => s + i.amount, 0);

  return (
    <TabPanel open={open} onClose={onClose} title="Invoices" accent={ACCENT}>

      {/* ── Action buttons ───────────────────────────── */}
      <div style={{ padding: "20px 18px 0", display: "flex", gap: 10 }}>
        {/* Scan */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={handleCapture}
        />
        <button
          onClick={() => inputRef.current?.click()}
          style={{
            flex: 1,
            background: ACCENT,
            color: "#fff",
            border: "none",
            borderRadius: 12,
            padding: "16px 0",
            fontFamily: coastal.fonts.manrope,
            fontWeight: 800,
            fontSize: 13,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            letterSpacing: ".04em",
          }}
        >
          <span style={{ fontSize: 18 }}>📷</span>
          SCAN
        </button>

        {/* Manual Entry */}
        <button
          onClick={() => setShowForm((v) => !v)}
          style={{
            flex: 1,
            background: showForm ? "#4EC89A" : "#E8EDEC",
            color: showForm ? "#083820" : "#2A3C48",
            border: "none",
            borderRadius: 12,
            padding: "16px 0",
            fontFamily: coastal.fonts.manrope,
            fontWeight: 800,
            fontSize: 13,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            letterSpacing: ".04em",
            transition: "background 0.15s ease",
          }}
        >
          <span style={{ fontSize: 18 }}>✏️</span>
          MANUAL
        </button>
      </div>

      {/* ── Manual entry form ────────────────────────── */}
      {showForm && (
        <div style={{
          margin: "12px 18px 0",
          background: "#fff",
          borderRadius: 14,
          padding: "16px 14px",
          boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#8A9C9C", fontFamily: coastal.fonts.manrope }}>
            New Invoice · {todayLabel()}
          </div>

          {/* Vendor */}
          <div style={{ position: "relative" }}>
            <select value={vendor} onChange={(e) => setVendor(e.target.value)} style={selectStyle}>
              {VENDORS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>

          {/* Category */}
          <div style={{ position: "relative" }}>
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={selectStyle}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Amount */}
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <span style={{
              position: "absolute", left: 12,
              fontFamily: coastal.fonts.condensed, fontSize: 16,
              fontWeight: 700, color: "#8A9C9C",
            }}>$</span>
            <input
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px 10px 26px",
                borderRadius: 10,
                border: "1.5px solid #D0D8DC",
                fontFamily: coastal.fonts.condensed,
                fontSize: 18,
                fontWeight: 700,
                color: "#1A2E28",
                background: "#fff",
                outline: "none",
              }}
            />
          </div>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={!amount || parseFloat(amount) <= 0}
            style={{
              width: "100%",
              background: (!amount || parseFloat(amount) <= 0) ? "#E8EDEC" : "#4EC89A",
              color: (!amount || parseFloat(amount) <= 0) ? "#8A9C9C" : "#083820",
              border: "none",
              borderRadius: 10,
              padding: "13px 0",
              fontFamily: coastal.fonts.manrope,
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: ".06em",
              cursor: (!amount || parseFloat(amount) <= 0) ? "default" : "pointer",
              transition: "background 0.15s ease",
            }}
          >
            ADD INVOICE
          </button>
        </div>
      )}

      {/* ── Scanned preview ───────────────────────────── */}
      {preview && (
        <div style={{ padding: "12px 18px 0" }}>
          <div style={{ borderRadius: 12, overflow: "hidden", border: "2px solid #7EB8D8" }}>
            <img src={preview} alt="Scanned invoice" style={{ width: "100%", display: "block" }} />
          </div>
          <div style={{ fontSize: 10, color: "#7EB8D8", fontFamily: coastal.fonts.manrope, fontWeight: 700, textAlign: "center", marginTop: 6 }}>
            ✓ Scanned · OCR parsing coming soon
          </div>
        </div>
      )}

      {/* ── Pending summary ───────────────────────────── */}
      {totalPending > 0 && (
        <div style={{
          margin: "12px 18px 0",
          padding: "12px 14px",
          background: "rgba(255,224,112,0.2)",
          borderRadius: 10,
          border: "1px solid #FFE070",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <div style={{ fontFamily: coastal.fonts.manrope, fontSize: 12, fontWeight: 700, color: "#6A4800" }}>
            Pending Payment
          </div>
          <div style={{ fontFamily: coastal.fonts.condensed, fontSize: 18, fontWeight: 800, color: "#7A5200" }}>
            ${totalPending.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </div>
      )}

      {/* ── Invoice list ──────────────────────────────── */}
      <div style={{ padding: "12px 18px 32px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#8A9C9C", fontFamily: coastal.fonts.manrope, marginBottom: 2 }}>
          Recent Invoices
        </div>
        {allInvoices.map((inv) => (
          <div key={inv.id} style={{
            background: "#fff",
            borderRadius: 12,
            padding: "12px 14px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          }}>
            <div>
              <div style={{ fontFamily: coastal.fonts.manrope, fontSize: 13, fontWeight: 700, color: "#1A2E28" }}>
                {inv.vendor}
              </div>
              <div style={{ fontSize: 10, color: "#8A9C9C", marginTop: 2, fontFamily: coastal.fonts.manrope }}>
                {inv.category} · {inv.date}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              {inv.amount > 0 && (
                <div style={{ fontFamily: coastal.fonts.condensed, fontSize: 16, fontWeight: 700, color: "#1A2E28" }}>
                  ${inv.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              )}
              <div style={{
                display: "inline-block",
                marginTop: 2,
                padding: "2px 8px",
                borderRadius: 6,
                background: STATUS_COLOR[inv.status],
                fontSize: 9,
                fontWeight: 800,
                color: STATUS_TEXT[inv.status],
                letterSpacing: ".06em",
                textTransform: "uppercase",
                fontFamily: coastal.fonts.manrope,
              }}>
                {inv.status}
              </div>
            </div>
          </div>
        ))}
      </div>
    </TabPanel>
  );
}

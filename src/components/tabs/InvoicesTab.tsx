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
  { id: "1", vendor: "Sysco",                amount: 1247.50, date: "Apr 14", category: "Food",     status: "paid"    },
  { id: "2", vendor: "Republic National",    amount:  892.00, date: "Apr 12", category: "Alcohol",  status: "paid"    },
  { id: "3", vendor: "DC Central Kitchen",  amount:  543.20, date: "Apr 10", category: "Food",     status: "pending" },
  { id: "4", vendor: "Ecolab",              amount:  312.00, date: "Apr 8",  category: "Supplies", status: "paid"    },
  { id: "5", vendor: "DC Office Supplies",  amount:   89.40, date: "Apr 8",  category: "Paper",    status: "paid"    },
];

const STATUS_COLOR = { paid: "#4EC89A", pending: "#FFE070", scanned: "#7EB8D8" };
const STATUS_TEXT  = { paid: "#084020", pending: "#6A4800", scanned: "#0A3A5A" };

export function InvoicesTab({ open, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [scanned, setScanned] = useState<Invoice[]>([]);
  const [preview, setPreview] = useState<string | null>(null);

  function handleCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    // Mock: add a "scanned" invoice entry
    const mock: Invoice = {
      id: `scan-${Date.now()}`,
      vendor: "Scanned Invoice",
      amount: 0,
      date: "Today",
      category: "Uncategorized",
      status: "scanned",
    };
    setScanned((s) => [mock, ...s]);
    // Reset input so same file can be re-selected
    e.target.value = "";
  }

  const allInvoices = [...scanned, ...MOCK_INVOICES];
  const totalPending = allInvoices.filter((i) => i.status === "pending").reduce((s, i) => s + i.amount, 0);

  return (
    <TabPanel open={open} onClose={onClose} title="Invoices" accent="#2A3C48">
      {/* ── Scan button ───────────────────────────────── */}
      <div style={{ padding: "20px 18px 12px" }}>
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
            width: "100%",
            background: "#2A3C48",
            color: "#fff",
            border: "none",
            borderRadius: 14,
            padding: "18px 0",
            fontFamily: coastal.fonts.manrope,
            fontWeight: 800,
            fontSize: 15,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            letterSpacing: ".04em",
          }}
        >
          <span style={{ fontSize: 22 }}>📷</span>
          SCAN INVOICE
        </button>
        <div style={{ textAlign: "center", fontSize: 10, color: "#8A9C9C", marginTop: 6, fontFamily: coastal.fonts.manrope }}>
          Opens camera · tap to photograph invoice
        </div>
      </div>

      {/* ── Scanned preview ───────────────────────────── */}
      {preview && (
        <div style={{ padding: "0 18px 12px" }}>
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
          margin: "0 18px 12px",
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
      <div style={{ padding: "0 18px 32px", display: "flex", flexDirection: "column", gap: 8 }}>
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

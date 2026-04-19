import { useEffect, useRef, useState } from "react";
import { TabPanel } from "./TabPanel";
import { coastal } from "../../theme/skins";
import { supabase, supabaseReady } from "../../lib/supabase";

type Props = { open: boolean; onClose: () => void };

type InvoiceRow = {
  id: string;
  vendor_name: string;
  amount: number | null;
  total_amount: number | null;
  invoice_date: string | null;
  category: string | null;
  status: "paid" | "pending" | "scanned" | string;
  source: string | null;
  raw_image_url: string | null;
  line_items: Array<{ description?: string; total?: number; category?: string }>;
  created_at: string;
};

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
  "Beverage",
  "Alcohol",
  "Paper",
  "Supplies",
  "Labor",
  "Utilities",
  "Rent",
  "Equipment",
  "Marketing",
  "Other",
];

const STATUS_COLOR: Record<string, string> = {
  paid: "#4EC89A",
  pending: "#FFE070",
  scanned: "#7EB8D8",
};
const STATUS_TEXT: Record<string, string> = {
  paid: "#084020",
  pending: "#6A4800",
  scanned: "#0A3A5A",
};

function todayLabel() {
  return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtDate(iso: string | null) {
  if (!iso) return todayLabel();
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%238A9C9C' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 12px center",
  paddingRight: 32,
};

// Downscale to max 2000px on longest side + JPEG 0.85 so the base64
// payload stays well under Anthropic's ~5MB image cap. Phone photos can
// easily be 5-15MB raw; without this they get rejected.
async function fileToBase64(file: File): Promise<{ base64: string; mime: string }> {
  const MAX_DIM = 2000;
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });

  let { width, height } = img;
  if (width > MAX_DIM || height > MAX_DIM) {
    if (width >= height) {
      height = Math.round((height / width) * MAX_DIM);
      width = MAX_DIM;
    } else {
      width = Math.round((width / height) * MAX_DIM);
      height = MAX_DIM;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.drawImage(img, 0, 0, width, height);
  const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.85);
  const comma = jpegDataUrl.indexOf(",");
  return { base64: jpegDataUrl.slice(comma + 1), mime: "image/jpeg" };
}

export function InvoicesTab({ open, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [vendor, setVendor] = useState(VENDORS[0]);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [amount, setAmount] = useState("");

  // ── Load invoices from Supabase ────────────────────────────────────────────
  useEffect(() => {
    if (!open || !supabaseReady) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (!cancelled && !error && data) setInvoices(data as InvoiceRow[]);
    })();
    // Live updates
    const channel = supabase
      .channel("invoices-tab")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invoices" },
        (payload) => {
          setInvoices((cur) => {
            if (payload.eventType === "INSERT") {
              return [payload.new as InvoiceRow, ...cur];
            }
            if (payload.eventType === "UPDATE") {
              return cur.map((r) =>
                r.id === (payload.new as InvoiceRow).id ? (payload.new as InvoiceRow) : r,
              );
            }
            if (payload.eventType === "DELETE") {
              return cur.filter((r) => r.id !== (payload.old as InvoiceRow).id);
            }
            return cur;
          });
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [open]);

  // ── Scan flow ──────────────────────────────────────────────────────────────
  async function handleCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setScanError(null);
    setPreview(URL.createObjectURL(file));
    setScanning(true);

    try {
      const { base64, mime } = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke("parse-invoice", {
        body: { image_base64: base64, mime_type: mime },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error || "parse failed");
      // Row will stream in via realtime, but also prepend optimistically
      if (data.invoice) {
        setInvoices((cur) => {
          if (cur.some((r) => r.id === data.invoice.id)) return cur;
          return [data.invoice as InvoiceRow, ...cur];
        });
      }
    } catch (err) {
      setScanError((err as Error).message || "scan failed");
    } finally {
      setScanning(false);
    }
  }

  // ── Manual save ────────────────────────────────────────────────────────────
  async function handleSave() {
    const parsed = parseFloat(amount.replace(/[^0-9.]/g, ""));
    if (!parsed || parsed <= 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const row = {
      vendor_name: vendor,
      invoice_date: today,
      category,
      amount: parsed,
      total_amount: parsed,
      status: "pending",
      source: "manual",
    };
    if (supabaseReady) {
      const { error } = await supabase.from("invoices").insert(row);
      if (error) {
        setScanError(error.message);
        return;
      }
    } else {
      // Offline fallback — prepend locally
      setInvoices((cur) => [
        {
          id: `local-${Date.now()}`,
          ...row,
          line_items: [],
          raw_image_url: null,
          created_at: new Date().toISOString(),
        } as InvoiceRow,
        ...cur,
      ]);
    }
    setAmount("");
    setVendor(VENDORS[0]);
    setCategory(CATEGORIES[0]);
    setShowForm(false);
  }

  const totalPending = invoices
    .filter((i) => i.status === "pending")
    .reduce((s, i) => s + (Number(i.total_amount ?? i.amount) || 0), 0);

  return (
    <TabPanel open={open} onClose={onClose} title="Invoices" accent={ACCENT}>
      {/* ── Action buttons ───────────────────────────── */}
      <div style={{ padding: "20px 18px 0", display: "flex", gap: 10 }}>
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
          disabled={scanning}
          style={{
            flex: 1,
            background: scanning ? "#6A7C88" : ACCENT,
            color: "#fff",
            border: "none",
            borderRadius: 12,
            padding: "16px 0",
            fontFamily: coastal.fonts.manrope,
            fontWeight: 800,
            fontSize: 13,
            cursor: scanning ? "default" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            letterSpacing: ".04em",
          }}
        >
          <span style={{ fontSize: 18 }}>{scanning ? "⏳" : "📷"}</span>
          {scanning ? "PARSING…" : "SCAN"}
        </button>

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
        <div
          style={{
            margin: "12px 18px 0",
            background: "#fff",
            borderRadius: 14,
            padding: "16px 14px",
            boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: ".1em",
              textTransform: "uppercase",
              color: "#8A9C9C",
              fontFamily: coastal.fonts.manrope,
            }}
          >
            New Invoice · {todayLabel()}
          </div>

          <div style={{ position: "relative" }}>
            <select value={vendor} onChange={(e) => setVendor(e.target.value)} style={selectStyle}>
              {VENDORS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div style={{ position: "relative" }}>
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={selectStyle}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <span
              style={{
                position: "absolute",
                left: 12,
                fontFamily: coastal.fonts.condensed,
                fontSize: 16,
                fontWeight: 700,
                color: "#8A9C9C",
              }}
            >
              $
            </span>
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

          <button
            onClick={handleSave}
            disabled={!amount || parseFloat(amount) <= 0}
            style={{
              width: "100%",
              background: !amount || parseFloat(amount) <= 0 ? "#E8EDEC" : "#4EC89A",
              color: !amount || parseFloat(amount) <= 0 ? "#8A9C9C" : "#083820",
              border: "none",
              borderRadius: 10,
              padding: "13px 0",
              fontFamily: coastal.fonts.manrope,
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: ".06em",
              cursor: !amount || parseFloat(amount) <= 0 ? "default" : "pointer",
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
          <div
            style={{
              fontSize: 10,
              color: scanError ? "#B94A4A" : "#7EB8D8",
              fontFamily: coastal.fonts.manrope,
              fontWeight: 700,
              textAlign: "center",
              marginTop: 6,
            }}
          >
            {scanning
              ? "⏳ Claude is reading the invoice…"
              : scanError
              ? `⚠ ${scanError}`
              : "✓ Scanned & parsed"}
          </div>
        </div>
      )}

      {/* ── Pending summary ───────────────────────────── */}
      {totalPending > 0 && (
        <div
          style={{
            margin: "12px 18px 0",
            padding: "12px 14px",
            background: "rgba(255,224,112,0.2)",
            borderRadius: 10,
            border: "1px solid #FFE070",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
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
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: ".1em",
            textTransform: "uppercase",
            color: "#8A9C9C",
            fontFamily: coastal.fonts.manrope,
            marginBottom: 2,
          }}
        >
          Recent Invoices
        </div>
        {invoices.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "24px 0",
              color: "#8A9C9C",
              fontFamily: coastal.fonts.manrope,
              fontSize: 12,
            }}
          >
            No invoices yet. Scan or add one above.
          </div>
        )}
        {invoices.map((inv) => {
          const amt = Number(inv.total_amount ?? inv.amount) || 0;
          const status = (inv.status as string) || "pending";
          return (
            <div
              key={inv.id}
              style={{
                background: "#fff",
                borderRadius: 12,
                padding: "12px 14px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
              }}
            >
              <div>
                <div style={{ fontFamily: coastal.fonts.manrope, fontSize: 13, fontWeight: 700, color: "#1A2E28" }}>
                  {inv.vendor_name}
                </div>
                <div style={{ fontSize: 10, color: "#8A9C9C", marginTop: 2, fontFamily: coastal.fonts.manrope }}>
                  {inv.category || "Uncategorized"} · {fmtDate(inv.invoice_date)}
                  {inv.line_items?.length ? ` · ${inv.line_items.length} items` : ""}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                {amt > 0 && (
                  <div style={{ fontFamily: coastal.fonts.condensed, fontSize: 16, fontWeight: 700, color: "#1A2E28" }}>
                    ${amt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                )}
                <div
                  style={{
                    display: "inline-block",
                    marginTop: 2,
                    padding: "2px 8px",
                    borderRadius: 6,
                    background: STATUS_COLOR[status] || "#E8EDEC",
                    fontSize: 9,
                    fontWeight: 800,
                    color: STATUS_TEXT[status] || "#2A3C48",
                    letterSpacing: ".06em",
                    textTransform: "uppercase",
                    fontFamily: coastal.fonts.manrope,
                  }}
                >
                  {status}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </TabPanel>
  );
}

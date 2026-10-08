import { useEffect, useRef, useState } from "react";
import { TabPanel } from "./TabPanel";
import { useSkin } from "../../theme/skins";
import { ownerFetch, ownerRead } from "../../data/ownerFetch";

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
  if (!iso) return "no date";   // an unread date is not today's date
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const ACCENT = "#2A3C48";

const selectStyle = (bodyFont: string): React.CSSProperties => ({
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1.5px solid #D0D8DC",
  fontFamily: bodyFont,
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
});

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
  const skin = useSkin();
  const inputRef = useRef<HTMLInputElement>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [vendor, setVendor] = useState(VENDORS[0]);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [amount, setAmount] = useState("");

  // ── Load invoices from the seed (on open, and after every write) ─────────
  // A failed read is a named state, never an empty list: the tab must not read
  // "no invoices" (or "nothing pending") when the feed is simply down.
  async function load() {
    setStatus((prev) => (prev === "ready" ? prev : "loading"));
    const read = await ownerRead<InvoiceRow[]>("/api/seed?view=invoices");
    if (read.status === "empty") {
      // The seed answered, and the answer is "nothing filed yet". That is a
      // read that landed -- the calm empty list, not a failure.
      setInvoices([]);
      setLoadError(null);
      setStatus("ready");
      return;
    }
    if (read.status === "error" || !Array.isArray(read.data)) {
      // Either we couldn't read, or what came back isn't a list of invoices.
      // Both are "we don't know" -- named, and never rendered as "no invoices".
      setLoadError(read.status === "error" ? read.error : "invoices came back in an unexpected shape");
      setStatus("error");
      return;
    }
    setInvoices(read.data);
    setLoadError(null);
    setStatus("ready");
  }
  useEffect(() => {
    if (!open) return;
    void load();
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
      // The seed's own classifier + persist (the same pipeline a bill takes by email).
      const res = await ownerFetch("/api/seed?view=invoice-scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image_base64: base64, mime_type: mime }) });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; summary?: string };
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      await load();
    } catch (err) {
      setScanError((err as Error).message || "scan failed");
    } finally {
      setScanning(false);
    }
  }

  // ── Manual save (a bill by hand, on the seed) ─────────────────────────────
  async function handleSave() {
    const parsed = parseFloat(amount.replace(/[^0-9.]/g, ""));
    if (!parsed || parsed <= 0 || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const r = await ownerFetch("/api/seed?view=invoice-add", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vendor_name: vendor, amount: parsed, category }) });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      // Only now is the bill really on the seed -- clear the form.
      setAmount("");
      setVendor(VENDORS[0]);
      setCategory(CATEGORIES[0]);
      setShowForm(false);
      await load();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "could not save");
    } finally {
      setSaving(false);
    }
  }

  // The pending total is exactly what it says: the bills the rows themselves
  // mark "pending". Nothing else gets counted into it.
  const amountOf = (i: InvoiceRow) => Number(i.total_amount ?? i.amount) || 0;
  const statusOf = (i: InvoiceRow) => (typeof i.status === "string" ? i.status.trim() : "");
  const totalPending = invoices.filter((i) => statusOf(i) === "pending").reduce((s, i) => s + amountOf(i), 0);

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
            fontFamily: skin.fonts.body,
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
            fontFamily: skin.fonts.body,
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
              fontFamily: skin.fonts.body,
            }}
          >
            New Invoice · {todayLabel()}
          </div>

          <div style={{ position: "relative" }}>
            <select value={vendor} onChange={(e) => setVendor(e.target.value)} style={selectStyle(skin.fonts.body)}>
              {VENDORS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div style={{ position: "relative" }}>
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={selectStyle(skin.fonts.body)}>
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
                fontFamily: skin.fonts.display,
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
                fontFamily: skin.fonts.display,
                fontSize: 18,
                fontWeight: 700,
                color: "#1A2E28",
                background: "#fff",
                outline: "none",
              }}
            />
          </div>

          {saveError && (
            <div style={{ fontSize: 11, color: "#B94A4A", fontFamily: skin.fonts.body, fontWeight: 700 }}>
              ⚠ Not saved — {saveError}
            </div>
          )}

          <button
            onClick={() => void handleSave()}
            disabled={!amount || parseFloat(amount) <= 0 || saving}
            style={{
              width: "100%",
              background: !amount || parseFloat(amount) <= 0 ? "#E8EDEC" : "#4EC89A",
              color: !amount || parseFloat(amount) <= 0 ? "#8A9C9C" : "#083820",
              border: "none",
              borderRadius: 10,
              padding: "13px 0",
              fontFamily: skin.fonts.body,
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: ".06em",
              cursor: !amount || parseFloat(amount) <= 0 ? "default" : "pointer",
              transition: "background 0.15s ease",
            }}
          >
            {saving ? "SAVING…" : "ADD INVOICE"}
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
              fontFamily: skin.fonts.body,
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

      {/* ── Summary ───────────────────────────────────── */}
      {status === "ready" && totalPending > 0 && (
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
            gap: 10,
          }}
        >
          <div style={{ fontFamily: skin.fonts.body, fontSize: 12, fontWeight: 700, color: "#6A4800" }}>
            Pending Payment
          </div>
          <div style={{ fontFamily: skin.fonts.display, fontSize: 18, fontWeight: 800, color: "#7A5200" }}>
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
            fontFamily: skin.fonts.body,
            marginBottom: 2,
          }}
        >
          {/* Nothing here knows what the seed caps this list at, so the header
              counts what is on the screen instead of naming a window. */}
          Recent Invoices{invoices.length > 0 ? ` · ${invoices.length}` : ""}
        </div>
        {invoices.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "24px 0",
              color: status === "error" ? "#B94A4A" : "#8A9C9C",
              fontFamily: skin.fonts.body,
              fontSize: 12,
            }}
          >
            {status === "error" ? (
              <>
                <div style={{ fontWeight: 700 }}>Couldn't load invoices.</div>
                {loadError && <div style={{ fontSize: 11, marginTop: 3, opacity: 0.8 }}>{loadError}</div>}
                <button
                  type="button"
                  onClick={() => void load()}
                  style={{
                    marginTop: 10,
                    background: ACCENT, color: "#fff", border: "none",
                    borderRadius: 10, padding: "8px 16px",
                    fontFamily: skin.fonts.body, fontWeight: 800, fontSize: 11,
                    letterSpacing: ".04em", cursor: "pointer",
                  }}
                >
                  RETRY
                </button>
              </>
            ) : status === "ready" ? (
              "No invoices yet. Scan or add one above."
            ) : (
              "Loading invoices…"
            )}
          </div>
        )}
        {invoices.length > 0 && status === "error" && (
          <button
            type="button"
            onClick={() => void load()}
            style={{
              background: "none", border: "none", padding: 0, textAlign: "left",
              fontFamily: skin.fonts.body, fontSize: 11, fontWeight: 700,
              color: "#B94A4A", cursor: "pointer",
            }}
          >
            Couldn't refresh — tap to retry
          </button>
        )}
        {invoices.map((inv) => {
          const amt = amountOf(inv);
          const rowStatus = statusOf(inv);   // whatever the row carries, verbatim
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
                <div style={{ fontFamily: skin.fonts.body, fontSize: 13, fontWeight: 700, color: "#1A2E28" }}>
                  {inv.vendor_name}
                </div>
                <div style={{ fontSize: 10, color: "#8A9C9C", marginTop: 2, fontFamily: skin.fonts.body }}>
                  {inv.category || "Uncategorized"} · {fmtDate(inv.invoice_date)}
                  {inv.line_items?.length ? ` · ${inv.line_items.length} items` : ""}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                {amt > 0 ? (
                  <div style={{ fontFamily: skin.fonts.display, fontSize: 16, fontWeight: 700, color: "#1A2E28" }}>
                    ${amt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                ) : (
                  <div style={{ fontFamily: skin.fonts.body, fontSize: 11, fontWeight: 700, color: "#8A9C9C" }}>
                    no amount read
                  </div>
                )}
                {/* The row's own status, always shown -- a status this screen
                    doesn't have a colour for stays neutral grey. */}
                <div
                  style={{
                    display: "inline-block",
                    marginTop: 2,
                    padding: "2px 8px",
                    borderRadius: 6,
                    background: STATUS_COLOR[rowStatus] || "#E8EDEC",
                    fontSize: 9,
                    fontWeight: 800,
                    color: STATUS_TEXT[rowStatus] || "#2A3C48",
                    letterSpacing: ".06em",
                    textTransform: "uppercase",
                    fontFamily: skin.fonts.body,
                  }}
                >
                  {rowStatus || "no status"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </TabPanel>
  );
}

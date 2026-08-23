import { useEffect, useState, type ReactNode } from "react";

// The front door (D18). Nothing renders -- and nothing is fetched -- until
// /api/session says there is a cookie. A 401 from any data call raises
// "owner-session-expired" and the door closes again.

const INK = "#1A2E28", ACCENT = "#1A9E8A";

export function PinGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "locked" | "open">("checking");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/session", { cache: "no-store" }).then((r) => { if (alive) setState(r.ok ? "open" : "locked"); }).catch(() => { if (alive) setState("locked"); });
    const lock = () => setState("locked");
    window.addEventListener("owner-session-expired", lock);
    return () => { alive = false; window.removeEventListener("owner-session-expired", lock); };
  }, []);

  async function submit(value: string) {
    if (busy || value.length < 4) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin: value }) });
      if (r.ok) { setPin(""); setState("open"); return; }
      const j = await r.json().catch(() => ({}));
      setErr(r.status === 429 ? (j.error ?? "too many attempts") : "That's not it.");
      setPin("");
    } catch { setErr("Can't reach the server."); }
    finally { setBusy(false); }
  }

  if (state === "open") return <>{children}</>;
  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#E6EBEA", fontFamily: "system-ui, -apple-system, sans-serif", padding: 24 }}>
      <form onSubmit={(e) => { e.preventDefault(); submit(pin); }} style={{ width: "100%", maxWidth: 300, background: "#fff", borderRadius: 18, padding: "28px 22px", boxShadow: "0 10px 30px rgba(0,0,0,.08)", textAlign: "center" }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: INK, letterSpacing: "-.01em" }}><span style={{ color: ACCENT }}>&amp;</span> Done</div>
        <div style={{ marginTop: 4, fontSize: 11, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "#7C8B88" }}>Owner</div>
        {state === "checking" ? <div style={{ marginTop: 24, color: "#7C8B88", fontSize: 13 }}>…</div> : (
          <>
            <input
              autoFocus inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" value={pin} placeholder="PIN" aria-label="Owner PIN"
              onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 8); setPin(v); if (v.length === 4) void submit(v); }}
              style={{ marginTop: 22, width: "100%", boxSizing: "border-box", borderRadius: 12, border: "1px solid #D5DDDB", background: "#F3F6F5", padding: "14px 12px", fontSize: 22, letterSpacing: ".5em", textAlign: "center", color: INK, outline: "none" }}
            />
            <button type="submit" disabled={busy || pin.length < 4} style={{ marginTop: 14, width: "100%", minHeight: 46, borderRadius: 12, border: "none", background: ACCENT, color: "#fff", fontSize: 14, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", opacity: busy || pin.length < 4 ? 0.5 : 1 }}>
              {busy ? "…" : "Open"}
            </button>
            {err ? <div style={{ marginTop: 12, fontSize: 12.5, color: "#B3423E", fontWeight: 600 }}>{err}</div> : null}
          </>
        )}
      </form>
    </div>
  );
}

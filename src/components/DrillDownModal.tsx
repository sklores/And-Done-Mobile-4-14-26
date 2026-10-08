import { useCallback, useEffect, useRef, useState } from "react";
import { useSkin, tileForScore } from "../theme/skins";
import type { SnapshotStatus } from "../stores/useKpiStore";
import type { FetchStatus } from "../data/ownerFetch";

/** How fresh the numbers in the header actually are. A sheet that has this
 *  says so under its headline: a header must never present the last good
 *  numbers as live ones, or a period built from half its days as a whole. */
export type Feed = {
  status: SnapshotStatus;
  asOf: string | null;
  daysExpected?: number | null;
  daysMissing?: number | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  score: number | null;
  label: string;
  value: string;
  status: string;
  feed?: Feed;
  children: React.ReactNode;
};

/** A wall-clock for a stamp from today; a stamp from any other day carries its
 *  date too. A time alone ("as of 9:12 AM") reads as this morning, which is a
 *  freshness claim -- and a feed that last landed on Tuesday must not make it. */
function clock(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const today = new Date();
  const sameDay = d.getFullYear() === today.getFullYear()
    && d.getMonth() === today.getMonth()
    && d.getDate() === today.getDate();
  return sameDay ? time : `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${time}`;
}

/** The one honest line about the numbers above it -- or null when there is
 *  nothing to caveat. */
function feedNote(feed: Feed): string | null {
  const at = clock(feed.asOf);
  if (feed.status === "error") {
    return at ? `couldn't refresh · numbers as of ${at}` : "couldn't refresh — nothing has landed";
  }
  if (feed.status === "loading") return at ? `refreshing · as of ${at}` : "loading…";
  if (feed.status === "empty") return "no data for this period yet";
  const missing = feed.daysMissing ?? 0;
  const expected = feed.daysExpected ?? 0;
  if (missing > 0 && expected > 0) return `built from ${expected - missing} of ${expected} days`;
  return at ? `as of ${at}` : null;
}

export function DrillDownModal({ open, onClose, score, label, value, status, feed, children }: Props) {
  const skin = useSkin();
  const palette = tileForScore(score);
  const note = feed ? feedNote(feed) : null;

  // Lock body scroll when open
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.45)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.22s ease",
          zIndex: 100,
        }}
      />

      {/* Sheet */}
      <div
        style={{
          position: "fixed",
          bottom: 0, left: "50%",
          transform: `translateX(-50%) translateY(${open ? "0%" : "100%"})`,
          transition: "transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)",
          width: 375,
          maxWidth: "100vw",
          background: skin.sheetBg,
          borderRadius: "18px 18px 0 0",
          overflow: "hidden",
          zIndex: 101,
          boxShadow: open ? "0 -8px 40px rgba(0,0,0,0.18)" : "none",
        }}
      >
        {/* Header — tile color */}
        <div
          style={{
            background: palette.bg,
            padding: "20px 18px 16px",
            position: "relative",
          }}
        >
          {/* Close pill */}
          <button type="button" aria-label="Close"
            onClick={onClose}
            style={{
              position: "absolute", top: 10, right: 14,
              width: 44, height: 44, border: "none", padding: 0, lineHeight: 1,
              background: "rgba(0,0,0,0.12)",
              borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
              fontSize: 18, color: palette.label, fontWeight: 700,
            }}
          >
            ×
          </button>

          {/* Drag handle */}
          <div style={{ width: 36, height: 4, background: "rgba(0,0,0,0.15)", borderRadius: 2, margin: "0 auto 14px" }} />

          <div style={{ color: palette.label, fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 4 }}>
            {label}
          </div>
          <div style={{ color: palette.value, fontSize: 36, fontWeight: 800, fontFamily: skin.fonts.display, fontStyle: skin.fonts.displayItalic ? "italic" : undefined, lineHeight: 1 }}>
            {value}
          </div>
          <div style={{ color: palette.statusText, fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", marginTop: 4 }}>
            {status}
          </div>
          {note && (
            <div style={{ color: palette.statusText, opacity: 0.8, fontFamily: skin.fonts.body, fontSize: 10, fontWeight: 600, marginTop: 3 }}>
              {note}
            </div>
          )}
        </div>

        {/* Content rows — scrollable */}
        <div style={{ padding: "8px 0 32px", background: skin.sheetBg, overflowY: "auto", maxHeight: "55vh" }}>
          {children}
        </div>
      </div>
    </>
  );
}

type RowProps = { label: string; value: string; sub?: string; dimmed?: boolean };

export function DrillRow({ label, value, sub, dimmed }: RowProps) {
  const skin = useSkin();
  return (
    <div
      style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "13px 18px",
        borderBottom: `1px solid rgba(0,0,0,0.06)`,
        opacity: dimmed ? 0.45 : 1,
      }}
    >
      <div style={{ fontFamily: skin.fonts.body, fontSize: 12, fontWeight: 600, color: "#4A5A54" }}>
        {label}
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontFamily: skin.fonts.display, fontStyle: skin.fonts.displayItalic ? "italic" : undefined, fontSize: 18, fontWeight: 700, color: "#1A2E28" }}>
          {value}
        </div>
        {sub && (
          <div style={{ fontFamily: skin.fonts.body, fontSize: 10, color: "#8A9C9C", marginTop: 1 }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

/** A plain, quiet line of prose in a sheet -- an empty state, a caveat, a
 *  source note. Not a number, never styled like one. */
export function DrillNote({ children }: { children: React.ReactNode }) {
  const skin = useSkin();
  return (
    <div style={{
      padding: "24px 18px", textAlign: "center", lineHeight: 1.5,
      fontFamily: skin.fonts.body, fontSize: 12, color: "#8A9C9C",
    }}>
      {children}
    </div>
  );
}

/** A read that failed, said out loud, with the way out. Never a "Loading…"
 *  that never ends and never an empty list standing in for an error. */
export function DrillRetry({ subject, onRetry, busy }: { subject: string; onRetry: () => void; busy?: boolean }) {
  const skin = useSkin();
  return (
    <div style={{ padding: "20px 18px", textAlign: "center" }}>
      <div style={{ fontFamily: skin.fonts.body, fontSize: 12, color: "#8A9C9C", marginBottom: 10 }}>
        Couldn't load {subject}.
      </div>
      <button
        type="button"
        onClick={onRetry}
        disabled={busy}
        style={{
          minHeight: 44, width: "100%",
          borderRadius: 8, border: "1.5px solid #C8D8D4",
          background: "transparent",
          fontFamily: skin.fonts.body, fontSize: 12, fontWeight: 700,
          color: "#4A7C6F", cursor: busy ? "default" : "pointer",
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? "Retrying…" : "Tap to retry"}
      </button>
    </div>
  );
}

/** The named state of a sheet's rows when they are not here: asks the store
 *  for them once the sheet opens, then says which of the three things actually
 *  happened. The READ's own outcome decides that -- never "the load promise
 *  settled", which cannot tell a failure from a read that succeeded with
 *  nothing in it, or from a load that returned early (a period switch) having
 *  done nothing at all. Renders nothing once the rows arrive. State lives in
 *  here so every sheet tells the same story. */
export function DrillLoad({ open, present, status, subject, load }: {
  open: boolean;
  present: boolean;
  /** Where the read that fills these rows stands, from the store that owns it:
   *  "ready" with nothing present is a successful read of nothing (the calm
   *  empty state), and only "error" is a failure worth a retry button. */
  status: FetchStatus;
  subject: string;
  load: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const loadRef = useRef(load);

  useEffect(() => { loadRef.current = load; }, [load]);

  const run = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    // Every setState below sits inside the promise chain, never synchronously
    // in an effect body.
    void Promise.resolve()
      .then(() => { setBusy(true); return loadRef.current(); })
      .catch(() => undefined)
      .finally(() => { inFlight.current = false; setBusy(false); });
  }, []);

  useEffect(() => {
    if (!open || present) return;
    run();
  }, [open, present, run]);

  if (present) return null;
  if (status === "error") return <DrillRetry subject={subject} onRetry={run} busy={busy} />;
  // The read came back and there was nothing in it: an answer, said calmly.
  if (status === "ready") return <DrillNote>Nothing in {subject} for this period.</DrillNote>;
  // "idle" = the fetch this effect just kicked hasn't reported yet.
  return <DrillNote>Loading {subject}…</DrillNote>;
}

import { useSkin, tileForScore } from "../theme/skins";
import { money } from "../lib/money";

// The 2-up row that sits between the KPI grid and the Net Profit bar:
// Reviews (star rating) + Debt (A/P open balance). Replaced the scrolling
// marquee + its four feed chips.

/** What a box actually knows about its feed. A failed or absent read is a
 *  NAMED state -- never a skeleton that never ends, and never a score
 *  painted on nothing.
 *    loading      first read still in flight, nothing on screen yet
 *    ready        the read landed (the value itself may still be "none yet")
 *    empty        the feed answered: there is nothing on file yet. A real
 *                 answer about the business, not a broken pipe -- so it says
 *                 what is missing and does NOT offer a retry that could never
 *                 succeed
 *    stale        a refresh failed but an earlier read is still on screen
 *    unavailable  the read failed and there is nothing to show */
export type FeedState = "loading" | "ready" | "empty" | "stale" | "unavailable";

type BoxProps = {
  label: string;
  value: string;
  sub?: string;
  score: number | null;
  stars?: number | null;   // 0–5; renders the star strip instead of `sub`
  state: FeedState;
  /** What "nothing on file yet" is called on this box, e.g. "no A/P report
   *  yet". Shown for `empty` only -- it names the absence instead of blaming
   *  the connection for it. */
  emptyNote?: string;
  onClick?: () => void;
  /** Tapped when the box has nothing: re-runs the fetch. */
  onRetry?: () => void;
};

/** Five stars, 0–5, with partial fill on the last one. */
function StarStrip({ rating, color, dim }: { rating: number; color: string; dim: string }) {
  const pct = Math.max(0, Math.min(1, rating / 5)) * 100;
  const row = { display: "flex", gap: 1, lineHeight: 1, fontSize: 11 } as const;
  return (
    <span style={{ position: "relative", display: "inline-block", whiteSpace: "nowrap" }}
          aria-label={`${rating.toFixed(1)} out of 5 stars`}>
      {/* empty track */}
      <span style={{ ...row, color: dim }}>{"\u2605\u2605\u2605\u2605\u2605"}</span>
      {/* filled overlay, clipped to the rating */}
      <span style={{
        ...row, color, position: "absolute", left: 0, top: 0,
        width: `${pct}%`, overflow: "hidden",
      }}>{"\u2605\u2605\u2605\u2605\u2605"}</span>
    </span>
  );
}

/** "as of 7/1" for a date-only report date, "as of 3:05 PM" for a timestamp. */
function asOfLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const d = new Date(dateOnly ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return null;
  return dateOnly
    ? `as of ${d.getMonth() + 1}/${d.getDate()}`
    : `as of ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function StatBox({ label, value, sub, score, stars, state, emptyNote, onClick, onRetry }: BoxProps) {
  const skin = useSkin();
  const known = state === "ready" || state === "stale";
  // No score on nothing. A feed that hasn't landed, has nothing on file, or
  // failed with nothing behind it, takes the app's neutral tile (blank paper)
  // -- never the spectrum's "Excellent" green or its caution stop.
  const palette = tileForScore(known ? score : null);
  // Loading eats the tap, "unavailable" retries, and "empty" has nothing to
  // open or re-fetch -- retrying a feed that answered "nothing yet" can only
  // answer the same thing again. A box with a number opens its drill-down.
  const tap =
    state === "loading" || state === "empty" ? undefined
      : state === "unavailable" ? onRetry
      : onClick;
  const subLine =
    state === "loading" ? undefined
      : state === "unavailable" ? "couldn't load · tap to retry"
      : state === "empty" ? (emptyNote ?? "nothing on file yet")
      : state === "stale" ? [sub, "offline"].filter(Boolean).join(" · ")
      : sub;

  return (
    <div
      onClick={tap}
      style={{
        background: palette.bg,
        border: palette.border ? `1px solid ${palette.border}` : undefined,
        borderRadius: 10,
        padding: "10px 8px 8px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        minHeight: 78,
        fontFamily: skin.fonts.body,
        cursor: tap ? "pointer" : undefined,
        // Dim the last-known numbers when the refresh stopped landing; the
        // sub line says "offline" so the dimming is explained, not decorative.
        opacity: state === "stale" ? 0.68 : undefined,
        animation: state === "loading" ? "kpiSkeleton 1.4s ease-in-out infinite" : undefined,
      }}
    >
      <div
        style={{
          color: palette.label,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: ".08em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
        <span
          style={{
            fontFamily: skin.fonts.display,
            fontStyle: skin.fonts.displayItalic ? "italic" : undefined,
            fontSize: 22,
            fontWeight: 800,
            color: palette.value,
            lineHeight: 1,
          }}
        >
          {known ? value : "--"}
        </span>
        {known && stars != null && <StarStrip rating={stars} color={palette.value} dim={palette.bg} />}
      </div>
      {subLine && (
        <div style={{ color: palette.statusText, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>
          {subLine}
        </div>
      )}
    </div>
  );
}

type Props = {
  reviewsRating: number | null;
  reviewsCount: number;
  reviewsScore: number | null;
  reviewsState: FeedState;
  reviewsAsOf: string | null;
  debtTotal: number | null;
  debtOver90: number;
  debtScore: number | null;
  debtState: FeedState;
  debtAsOf: string | null;
  /** Set when the newest A/P report on file is old enough that its as-of
   *  would read as current (see AGING_STALE_DAYS). Replaces the as-of line so
   *  the age is stated out loud; the score is unaffected. */
  debtAgeNote?: string | null;
  onOpenReviews: () => void;
  onOpenDebt: () => void;
  onRetryReviews: () => void;
  onRetryDebt: () => void;
};

export function StatRow({
  reviewsRating, reviewsCount, reviewsScore, reviewsState, reviewsAsOf,
  debtTotal, debtOver90, debtScore, debtState, debtAsOf, debtAgeNote,
  onOpenReviews, onOpenDebt, onRetryReviews, onRetryDebt,
}: Props) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: 10, columnGap: 10, padding: "0 10px", flex: 1, alignContent: "stretch" }}>
      <StatBox
        label="Reviews"
        value={reviewsRating != null ? reviewsRating.toFixed(1) : "--"}
        stars={reviewsRating}
        // A read that landed with nothing rated says so; it is not the same
        // picture as a read that failed.
        sub={[reviewsCount > 0 ? `${reviewsCount} reviews` : "no reviews yet", asOfLabel(reviewsAsOf)].filter(Boolean).join(" · ")}
        score={reviewsScore}
        state={reviewsState}
        emptyNote="no reviews on file yet"
        onClick={onOpenReviews}
        onRetry={onRetryReviews}
      />
      <StatBox
        label="Debt"
        value={debtTotal != null ? money(debtTotal) : "--"}
        // The A/P aging report is only ever as fresh as the last emailed
        // snapshot, so its report date rides on the tile with the number --
        // stated as an age once a bare date would read as current.
        sub={[debtOver90 > 0 ? `${money(debtOver90)} past 90d` : "nothing past 90d", debtAgeNote || asOfLabel(debtAsOf)].filter(Boolean).join(" · ")}
        score={debtScore}
        state={debtState}
        emptyNote="no A/P report yet"
        onClick={onOpenDebt}
        onRetry={onRetryDebt}
      />
    </div>
  );
}

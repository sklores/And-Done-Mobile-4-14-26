import { useSkin, tileForScore } from "../theme/skins";
import { money } from "../lib/money";

// The 2-up row that sits between the KPI grid and the Net Profit bar:
// Reviews (star rating) + Debt (A/P open balance). Replaced the scrolling
// marquee + its four feed chips.

type BoxProps = {
  label: string;
  value: string;
  sub?: string;
  score: number;
  stars?: number | null;   // 0–5; renders the star strip instead of `sub`
  loading?: boolean;
  onClick?: () => void;
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

function StatBox({ label, value, sub, score, stars, loading, onClick }: BoxProps) {
  const skin = useSkin();
  const palette = tileForScore(score);

  return (
    <div
      onClick={loading ? undefined : onClick}
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
        cursor: onClick && !loading ? "pointer" : undefined,
        animation: loading ? "kpiSkeleton 1.4s ease-in-out infinite" : undefined,
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
          {loading ? "--" : value}
        </span>
        {!loading && stars != null && <StarStrip rating={stars} color={palette.value} dim={palette.bg} />}
      </div>
      {sub && !loading && (
        <div style={{ color: palette.statusText, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

type Props = {
  reviewsRating: number | null;
  reviewsCount: number;
  reviewsScore: number;
  debtTotal: number | null;
  debtOver90: number;
  debtScore: number;
  loading?: boolean;
  onOpenReviews: () => void;
  onOpenDebt: () => void;
};

export function StatRow({
  reviewsRating, reviewsCount, reviewsScore,
  debtTotal, debtOver90, debtScore,
  loading, onOpenReviews, onOpenDebt,
}: Props) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: 10, columnGap: 10, padding: "0 10px", flex: 1, alignContent: "stretch" }}>
      <StatBox
        label="Reviews"
        value={reviewsRating != null ? reviewsRating.toFixed(1) : "--"}
        stars={reviewsRating}
        sub={reviewsCount > 0 ? `${reviewsCount} reviews` : undefined}
        score={reviewsScore}
        loading={loading || reviewsRating == null}
        onClick={onOpenReviews}
      />
      <StatBox
        label="Debt"
        value={debtTotal != null ? money(debtTotal) : "--"}
        sub={debtOver90 > 0 ? `${money(debtOver90)} past 90d` : "nothing past 90d"}
        score={debtScore}
        loading={loading || debtTotal == null}
        onClick={onOpenDebt}
      />
    </div>
  );
}

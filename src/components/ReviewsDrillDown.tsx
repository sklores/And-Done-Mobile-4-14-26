import { useEffect, useState } from "react";
import { DrillDownModal, DrillRow } from "./DrillDownModal";
import { coastal } from "../theme/skins";
import { FEED_SCORES } from "../data/feedScores";
import {
  fetchReviewsBundle,
  timeAgo,
  PLATFORM_LABEL,
  PLATFORM_COLOR,
  type ReviewsBundle,
  type ReviewRow,
} from "../data/reviewsAdapter";

type Props = { open: boolean; onClose: () => void };

function SectionHeader({ title, right }: { title: string; right?: string }) {
  return (
    <div style={{
      padding: "10px 18px 4px", fontSize: 9, fontWeight: 700,
      letterSpacing: ".1em", textTransform: "uppercase",
      color: "#8A9C9C", fontFamily: coastal.fonts.manrope,
      background: "#F2F7F6",
      borderTop: "1px solid rgba(0,0,0,0.05)",
      borderBottom: "1px solid rgba(0,0,0,0.05)",
      display: "flex", justifyContent: "space-between", alignItems: "center",
    }}>
      <span>{title}</span>
      {right && <span style={{ opacity: 0.65 }}>{right}</span>}
    </div>
  );
}

function StarRow({ stars, pct, count }: { stars: number; pct: number; count: number }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "7px 18px",
      borderBottom: "1px solid rgba(0,0,0,0.05)",
    }}>
      <div style={{
        fontFamily: coastal.fonts.manrope, fontSize: 11,
        fontWeight: 700, color: "#4A5A54", width: 14, textAlign: "right",
      }}>{stars}</div>
      <span style={{ color: "#F4C430", fontSize: 10 }}>★</span>
      <div style={{ flex: 1, height: 7, background: "rgba(0,0,0,0.07)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`,
          background: stars >= 4 ? "#4EC89A" : stars === 3 ? "#FFE070" : "#FFAAA0",
          borderRadius: 4,
        }} />
      </div>
      <div style={{
        fontFamily: coastal.fonts.condensed, fontSize: 13,
        fontWeight: 700, color: "#1A2E28", width: 56, textAlign: "right",
      }}>{pct}%<span style={{ fontSize: 10, color: "#8A9C9C", marginLeft: 4 }}>({count})</span></div>
    </div>
  );
}

function PlatformRow({
  platform, label, color, count, avgRating, status,
}: {
  platform: string;
  label: string;
  color: string;
  count: number;
  avgRating: number | null;
  status: "live" | "no-data";
}) {
  const isNoData = status === "no-data";
  const hasRating = avgRating != null;
  return (
    <div key={platform} style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "11px 18px", borderBottom: "1px solid rgba(0,0,0,0.06)",
      opacity: isNoData ? 0.5 : 1,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0,
        }} />
        <div style={{ fontFamily: coastal.fonts.manrope, fontSize: 12, fontWeight: 600, color: "#4A5A54" }}>
          {label}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        {isNoData ? (
          <div style={{ fontSize: 11, color: "#8A9C9C", fontFamily: coastal.fonts.manrope, fontStyle: "italic" }}>
            no data yet
          </div>
        ) : (
          <>
            <div style={{ fontFamily: coastal.fonts.condensed, fontSize: 16, fontWeight: 700, color: "#1A2E28" }}>
              {hasRating ? `${avgRating} ★` : "no rating"}
            </div>
            <div style={{ fontSize: 10, color: "#8A9C9C", marginTop: 1 }}>
              {count} review{count === 1 ? "" : "s"}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function RecentReviewRow({ review }: { review: ReviewRow }) {
  const stars = review.rating != null ? Math.round(Number(review.rating)) : null;
  const platformLabel = PLATFORM_LABEL[review.platform] ?? review.platform;
  const ago = timeAgo(review.review_date);
  const text = (review.review_text || "").trim();
  const author = (review.reviewer_name || "Anonymous").trim();

  return (
    <div style={{
      padding: "12px 18px",
      borderBottom: "1px solid rgba(0,0,0,0.06)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, alignItems: "center" }}>
        {stars != null ? (
          <div style={{ color: "#F4C430", fontSize: 11, letterSpacing: 1 }}>
            {"★".repeat(stars)}{"☆".repeat(5 - stars)}
          </div>
        ) : (
          <div style={{ fontSize: 10, color: "#8A9C9C", fontFamily: coastal.fonts.manrope, fontStyle: "italic" }}>
            no rating
          </div>
        )}
        <div style={{ fontSize: 10, color: "#8A9C9C", fontFamily: coastal.fonts.manrope }}>
          {platformLabel}{ago ? ` · ${ago}` : ""}
        </div>
      </div>
      {text && (
        <div style={{
          fontFamily: coastal.fonts.manrope, fontSize: 12, color: "#1A2E28",
          fontStyle: "italic", marginBottom: 2, lineHeight: 1.4,
        }}>
          “{truncate(text, 220)}”
        </div>
      )}
      <div style={{ fontFamily: coastal.fonts.manrope, fontSize: 10, color: "#8A9C9C", fontWeight: 600 }}>
        — {author}
      </div>
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export function ReviewsDrillDown({ open, onClose }: Props) {
  const [bundle, setBundle] = useState<ReviewsBundle | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetchReviewsBundle()
      .then((b) => {
        if (!cancelled) {
          setBundle(b);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBundle(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Header values
  const headerValue = !bundle
    ? "--"
    : bundle.overallRating != null
      ? `${bundle.overallRating} ★`
      : "—";

  const headerStatus = !bundle
    ? loading ? "Loading" : "No data"
    : bundle.totalReviews === 0
      ? "No reviews yet"
      : `${bundle.totalReviews} review${bundle.totalReviews === 1 ? "" : "s"} across ${bundle.platforms.filter(p => p.status === "live").length} platforms`;

  return (
    <DrillDownModal
      open={open}
      onClose={onClose}
      score={FEED_SCORES.reviews}
      label="Reviews"
      value={headerValue}
      status={headerStatus}
    >
      {loading && (
        <div style={{
          padding: "24px 18px", color: "#8A9C9C",
          fontFamily: coastal.fonts.manrope, fontSize: 12, textAlign: "center",
        }}>
          Loading reviews…
        </div>
      )}

      {!loading && bundle && bundle.totalReviews === 0 && (
        <div style={{
          padding: "28px 18px", color: "#8A9C9C",
          fontFamily: coastal.fonts.manrope, fontSize: 12, textAlign: "center", lineHeight: 1.5,
        }}>
          No reviews on file yet.
          <br />
          <span style={{ opacity: 0.65, fontSize: 10 }}>
            Daily sync runs at 08:30 UTC across Yelp, Tripadvisor, and Uber Eats.
          </span>
        </div>
      )}

      {!loading && bundle && bundle.totalReviews > 0 && (
        <>
          {bundle.totalRatedReviews > 0 && (
            <>
              <SectionHeader
                title="Rating Distribution"
                right={`${bundle.totalRatedReviews} rated`}
              />
              {bundle.starDistribution.map((b) => (
                <StarRow key={b.stars} stars={b.stars} pct={b.pct} count={b.count} />
              ))}
            </>
          )}

          <SectionHeader title="By Platform" />
          {bundle.platforms.map((p) => (
            <PlatformRow
              key={p.platform}
              platform={p.platform}
              label={PLATFORM_LABEL[p.platform]}
              color={PLATFORM_COLOR[p.platform]}
              count={p.count}
              avgRating={p.avgRating}
              status={p.status}
            />
          ))}

          {bundle.recent.length > 0 && (
            <>
              <SectionHeader title="Recent" right={`${bundle.recent.length} most recent`} />
              {bundle.recent.map((r) => (
                <RecentReviewRow key={r.id} review={r} />
              ))}
            </>
          )}

          <DrillRow
            label="Respond to reviews"
            value="→"
            sub="connect Google Business API to reply in-app"
            dimmed
          />
        </>
      )}
    </DrillDownModal>
  );
}

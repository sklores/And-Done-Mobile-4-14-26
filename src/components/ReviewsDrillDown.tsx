import { useCallback, useEffect, useRef, useState } from "react";
import { DrillDownModal, DrillRow, DrillNote, DrillRetry } from "./DrillDownModal";
import { useSkin } from "../theme/skins";
import {
  fetchReviewsBundle,
  timeAgo,
  PLATFORM_LABEL,
  PLATFORM_COLOR,
  type ReviewsBundle,
  type ReviewRow,
  ratingToReviewScore,
} from "../data/reviewsAdapter";

type Props = { open: boolean; onClose: () => void };

function SectionHeader({ title, right }: { title: string; right?: string }) {
  const skin = useSkin();
  return (
    <div style={{
      padding: "10px 18px 4px", fontSize: 9, fontWeight: 700,
      letterSpacing: ".1em", textTransform: "uppercase",
      color: "#8A9C9C", fontFamily: skin.fonts.body,
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
  const skin = useSkin();
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "7px 18px",
      borderBottom: "1px solid rgba(0,0,0,0.05)",
    }}>
      <div style={{
        fontFamily: skin.fonts.body, fontSize: 11,
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
        fontFamily: skin.fonts.display, fontSize: 13,
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
  const skin = useSkin();
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
        <div style={{ fontFamily: skin.fonts.body, fontSize: 12, fontWeight: 600, color: "#4A5A54" }}>
          {label}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        {isNoData ? (
          <div style={{ fontSize: 11, color: "#8A9C9C", fontFamily: skin.fonts.body, fontStyle: "italic" }}>
            no data yet
          </div>
        ) : (
          <>
            <div style={{ fontFamily: skin.fonts.display, fontSize: 16, fontWeight: 700, color: "#1A2E28" }}>
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
  const skin = useSkin();
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
          <div style={{ fontSize: 10, color: "#8A9C9C", fontFamily: skin.fonts.body, fontStyle: "italic" }}>
            no rating
          </div>
        )}
        <div style={{ fontSize: 10, color: "#8A9C9C", fontFamily: skin.fonts.body }}>
          {platformLabel}{ago ? ` · ${ago}` : ""}
        </div>
      </div>
      {text && (
        <div style={{
          fontFamily: skin.fonts.body, fontSize: 12, color: "#1A2E28",
          fontStyle: "italic", marginBottom: 2, lineHeight: 1.4,
        }}>
          “{truncate(text, 220)}”
        </div>
      )}
      <div style={{ fontFamily: skin.fonts.body, fontSize: 10, color: "#8A9C9C", fontWeight: 600 }}>
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
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const inFlight = useRef(false);

  const load = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    // setState only inside the promise chain — never synchronously in an effect.
    void Promise.resolve()
      .then(() => { setPhase("loading"); return fetchReviewsBundle(); })
      .then((b) => {
        if (b) { setBundle(b); setPhase("ready"); }
        else { setPhase("error"); }   // a failed read is not "no reviews"
      })
      .catch(() => setPhase("error"))
      .finally(() => { inFlight.current = false; });
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
  }, [open, load]);

  const loading = phase === "loading" && !bundle;
  const failed  = phase === "error"   && !bundle;

  // bundle.fetchedAt is when THIS browser rolled the rows up, so it always
  // reads as "just now" -- it is not when the review sync last landed. The
  // rows carry that: the newest fetched_at among them. Null when there are no
  // rows, and then the header claims no freshness at all.
  const syncedAt = bundle
    ? bundle.recent.reduce<string | null>(
        (newest, r) => (r.fetched_at && (newest == null || r.fetched_at > newest) ? r.fetched_at : newest),
        null,
      )
    : null;

  // Header values
  const headerValue = !bundle
    ? "--"
    : bundle.overallRating != null
      ? `${bundle.overallRating} ★`
      : "—";

  const headerStatus = !bundle
    ? loading ? "Loading" : "Couldn't load"
    : bundle.totalReviews === 0
      ? "No reviews yet"
      : `${bundle.totalReviews} review${bundle.totalReviews === 1 ? "" : "s"} across ${bundle.platforms.filter(p => p.status === "live").length} platforms`;

  return (
    <DrillDownModal
      open={open}
      onClose={onClose}
      score={ratingToReviewScore(bundle?.overallRating ?? null)}
      label="Reviews"
      value={headerValue}
      status={headerStatus}
      feed={{ status: phase, asOf: syncedAt }}
    >
      {loading && <DrillNote>Loading reviews…</DrillNote>}

      {failed && <DrillRetry subject="the review feed" onRetry={load} />}

      {bundle && bundle.totalReviews === 0 && (
        <DrillNote>
          No reviews on file for this restaurant yet.
          <br />
          <span style={{ opacity: 0.65, fontSize: 10 }}>
            The review feeds are synced on the seed; nothing has landed here.
          </span>
        </DrillNote>
      )}

      {bundle && bundle.totalReviews > 0 && (
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

import { DrillDownModal, DrillRow } from "./DrillDownModal";
import { coastal } from "../theme/skins";
import { FEED_SCORES } from "../data/feedScores";

type Props = { open: boolean; onClose: () => void };

// ── Mock data (replace with Google/Yelp API when ready) ──────────────────────
const PLATFORMS = [
  { name: "Google",    rating: 4.9, count: 128, color: "#4285F4" },
  { name: "Yelp",      rating: 4.7, count:  89, color: "#D32323" },
  { name: "Toast",     rating: 4.8, count:  42, color: "#FF6B00" },
];

const STAR_DIST = [
  { stars: 5, pct: 82 },
  { stars: 4, pct: 12 },
  { stars: 3, pct:  4 },
  { stars: 2, pct:  1 },
  { stars: 1, pct:  1 },
];

const TOTAL_REVIEWS = PLATFORMS.reduce((s, p) => s + p.count, 0);
const OVERALL_RATING = (
  PLATFORMS.reduce((s, p) => s + p.rating * p.count, 0) / TOTAL_REVIEWS
).toFixed(1);

const RECENT = [
  { text: "Best grilled cheese in DC!",          author: "Sarah M.", stars: 5, platform: "Google", ago: "2h ago"     },
  { text: "Cozy vibe and lightning-fast service", author: "Jon P.",   stars: 5, platform: "Yelp",   ago: "5h ago"     },
  { text: "Loved the tomato soup pairing",        author: "Aly R.",   stars: 4, platform: "Google", ago: "Yesterday"  },
];

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

export function ReviewsDrillDown({ open, onClose }: Props) {
  return (
    <DrillDownModal
      open={open}
      onClose={onClose}
      score={FEED_SCORES.reviews}
      label="Reviews"
      value={`${OVERALL_RATING} ★`}
      status={`${TOTAL_REVIEWS} reviews across all platforms`}
    >
      {/* ── Star distribution bar ─────────────────────── */}
      <SectionHeader title="Rating Distribution" right={`${TOTAL_REVIEWS} total`} />
      {STAR_DIST.map(({ stars, pct }) => (
        <div key={stars} style={{
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
            fontWeight: 700, color: "#1A2E28", width: 32, textAlign: "right",
          }}>{pct}%</div>
        </div>
      ))}

      {/* ── Platform breakdown ────────────────────────── */}
      <SectionHeader title="By Platform" />
      {PLATFORMS.map((p) => (
        <div key={p.name} style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "11px 18px", borderBottom: "1px solid rgba(0,0,0,0.06)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%", background: p.color, flexShrink: 0,
            }} />
            <div style={{ fontFamily: coastal.fonts.manrope, fontSize: 12, fontWeight: 600, color: "#4A5A54" }}>
              {p.name}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: coastal.fonts.condensed, fontSize: 16, fontWeight: 700, color: "#1A2E28" }}>
              {p.rating} ★
            </div>
            <div style={{ fontSize: 10, color: "#8A9C9C", marginTop: 1 }}>
              {p.count} reviews
            </div>
          </div>
        </div>
      ))}

      {/* ── Recent reviews ────────────────────────────── */}
      <SectionHeader title="Recent" right="mock · connect API" />
      {RECENT.map((r, i) => (
        <div key={i} style={{
          padding: "12px 18px",
          borderBottom: "1px solid rgba(0,0,0,0.06)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <div style={{ color: "#F4C430", fontSize: 11, letterSpacing: 1 }}>
              {"★".repeat(r.stars)}{"☆".repeat(5 - r.stars)}
            </div>
            <div style={{ fontSize: 10, color: "#8A9C9C", fontFamily: coastal.fonts.manrope }}>
              {r.platform} · {r.ago}
            </div>
          </div>
          <div style={{ fontFamily: coastal.fonts.manrope, fontSize: 12, color: "#1A2E28", fontStyle: "italic", marginBottom: 2 }}>
            "{r.text}"
          </div>
          <div style={{ fontFamily: coastal.fonts.manrope, fontSize: 10, color: "#8A9C9C", fontWeight: 600 }}>
            — {r.author}
          </div>
        </div>
      ))}

      <DrillRow
        label="Respond to reviews"
        value="→"
        sub="connect Google Business API to reply in-app"
        dimmed
      />
    </DrillDownModal>
  );
}

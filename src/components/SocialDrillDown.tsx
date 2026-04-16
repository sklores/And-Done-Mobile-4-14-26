import { DrillDownModal, DrillRow } from "./DrillDownModal";
import { FEED_SCORES } from "../data/feedScores";
import { coastal } from "../theme/skins";

type Props = { open: boolean; onClose: () => void };

// ── Mock data — wire to Instagram Graph API / TikTok API when ready ──────────
// "+142" = net new followers gained this week across platforms
const THIS_WEEK = {
  newFollowers: 142,
  target: 200,
};

const PLATFORMS = [
  {
    name: "Instagram",
    handle: "@gcdc_grilledcheese",
    color: "#E1306C",
    followers: 4_820,
    newFollowers: 98,
    engagements: 2_340,  // likes + comments + shares
    topPost: {
      caption: "The classic gets a glow-up 🧀",
      likes: 847,
      comments: 34,
    },
  },
  {
    name: "TikTok",
    handle: "@gcdc_dc",
    color: "#010101",
    followers: 1_204,
    newFollowers: 44,
    engagements: 890,
    topPost: null,
  },
  {
    name: "Facebook",
    handle: "GCDC Grilled Cheese Bar",
    color: "#1877F2",
    followers: 3_102,
    newFollowers: 0,
    engagements: 112,
    topPost: null,
  },
];

const WEEKLY_TREND = [
  { day: "Mon", val: 210 },
  { day: "Tue", val: 185 },
  { day: "Wed", val: 198 },
  { day: "Thu", val: 156 },
  { day: "Fri", val: 142 },
  { day: "Sat", val: null },
  { day: "Sun", val: null },
];

const TOTAL_FOLLOWERS  = PLATFORMS.reduce((s, p) => s + p.followers, 0);
const TOTAL_ENGAGEMENT = PLATFORMS.reduce((s, p) => s + p.engagements, 0);
const MAX_TREND = Math.max(...WEEKLY_TREND.map((d) => d.val ?? 0));

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

function TrendBar() {
  return (
    <div style={{ padding: "12px 18px 8px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 36 }}>
        {WEEKLY_TREND.map(({ day, val }) => (
          <div key={day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <div style={{
              width: "100%",
              height: val ? `${(val / MAX_TREND) * 32}px` : 4,
              background: val ? (val >= THIS_WEEK.target ? "#4EC89A" : val >= 160 ? "#FFE070" : "#FFBC72") : "rgba(0,0,0,0.08)",
              borderRadius: 3,
            }} />
            <div style={{ fontSize: 8, color: "#8A9C9C", fontFamily: coastal.fonts.manrope, fontWeight: 700 }}>
              {day}
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 9, color: "#8A9C9C", fontFamily: coastal.fonts.manrope, marginTop: 6, textAlign: "center" }}>
        New followers per day this week · target {THIS_WEEK.target}/day
      </div>
    </div>
  );
}

export function SocialDrillDown({ open, onClose }: Props) {
  const pct = Math.round((THIS_WEEK.newFollowers / THIS_WEEK.target) * 100);

  return (
    <DrillDownModal
      open={open}
      onClose={onClose}
      score={FEED_SCORES.social}
      label="Social"
      value={`+${THIS_WEEK.newFollowers}`}
      status={`new followers this week · ${pct}% of target`}
    >
      {/* ── Weekly trend mini-chart ────────────────────── */}
      <TrendBar />

      {/* ── Summary ───────────────────────────────────── */}
      <SectionHeader title="This Week" right="mock · connect API" />
      <DrillRow
        label="New Followers"
        value={`+${THIS_WEEK.newFollowers}`}
        sub={`target +${THIS_WEEK.target} · ${pct}% there`}
      />
      <DrillRow
        label="Total Followers"
        value={TOTAL_FOLLOWERS.toLocaleString()}
        sub="across all platforms"
        dimmed
      />
      <DrillRow
        label="Total Engagements"
        value={TOTAL_ENGAGEMENT.toLocaleString()}
        sub="likes · comments · shares this week"
      />

      {/* ── Platform breakdown ────────────────────────── */}
      <SectionHeader title="By Platform" />
      {PLATFORMS.map((p) => (
        <div key={p.name} style={{
          padding: "12px 18px",
          borderBottom: "1px solid rgba(0,0,0,0.06)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.color }} />
              <span style={{ fontFamily: coastal.fonts.manrope, fontSize: 12, fontWeight: 700, color: "#1A2E28" }}>
                {p.name}
              </span>
            </div>
            <span style={{ fontFamily: coastal.fonts.manrope, fontSize: 10, color: "#8A9C9C" }}>
              {p.handle}
            </span>
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            <div>
              <div style={{ fontFamily: coastal.fonts.condensed, fontSize: 16, fontWeight: 700, color: "#1A2E28" }}>
                {p.followers.toLocaleString()}
              </div>
              <div style={{ fontSize: 9, color: "#8A9C9C", fontFamily: coastal.fonts.manrope }}>followers</div>
            </div>
            <div>
              <div style={{ fontFamily: coastal.fonts.condensed, fontSize: 16, fontWeight: 700,
                color: p.newFollowers > 0 ? "#0E5A30" : "#8A9C9C" }}>
                {p.newFollowers > 0 ? `+${p.newFollowers}` : "—"}
              </div>
              <div style={{ fontSize: 9, color: "#8A9C9C", fontFamily: coastal.fonts.manrope }}>this week</div>
            </div>
            <div>
              <div style={{ fontFamily: coastal.fonts.condensed, fontSize: 16, fontWeight: 700, color: "#1A2E28" }}>
                {p.engagements.toLocaleString()}
              </div>
              <div style={{ fontSize: 9, color: "#8A9C9C", fontFamily: coastal.fonts.manrope }}>engagements</div>
            </div>
          </div>
          {p.topPost && (
            <div style={{
              marginTop: 8, padding: "7px 10px",
              background: "rgba(0,0,0,0.04)", borderRadius: 8,
              fontFamily: coastal.fonts.manrope, fontSize: 11, color: "#4A5A54",
            }}>
              <span style={{ fontWeight: 700 }}>Top post:</span> "{p.topPost.caption}" —{" "}
              <span style={{ color: "#E1306C" }}>♥ {p.topPost.likes}</span>{" "}
              <span style={{ color: "#8A9C9C" }}>· 💬 {p.topPost.comments}</span>
            </div>
          )}
        </div>
      ))}
    </DrillDownModal>
  );
}

import { DrillDownModal } from "./DrillDownModal";
import { coastal, tileForScore } from "../theme/skins";

type Props = { open: boolean; onClose: () => void };

type Event = {
  title: string;
  date: string;
  time: string;
  note: string;
  score: number;   // 1–8: low = needs attention, high = all good
};

const EVENTS: Event[] = [
  { title: "Patio Brunch",       date: "Sat Apr 19", time: "10:00 AM",  note: "Staff confirmed, menu set",    score: 8 },
  { title: "Live Music Night",   date: "Thu Apr 17", time: "7:00 PM",   note: "Performer not yet confirmed",  score: 3 },
  { title: "Trivia Tuesday",     date: "Tue Apr 22", time: "7:00 PM",   note: "Host booked, prizes ordered",  score: 7 },
  { title: "Private Buyout",     date: "Fri Apr 25", time: "6:00 PM",   note: "Deposit received, menu TBD",   score: 5 },
  { title: "Mother's Day Brunch",date: "Sun May 11", time: "10:00 AM",  note: "Not yet staffed or promoted",  score: 2 },
  { title: "Happy Hour Promo",   date: "Daily",      time: "4–6 PM",    note: "Running smoothly",             score: 8 },
];

const OVERALL_SCORE = 5; // mixed bag — some events need attention

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

export function EventsDrillDown({ open, onClose }: Props) {
  const needsAttention = EVENTS.filter((e) => e.score <= 3).length;

  return (
    <DrillDownModal
      open={open}
      onClose={onClose}
      score={OVERALL_SCORE}
      label="Events"
      value={`${EVENTS.length} upcoming`}
      status={needsAttention > 0 ? `${needsAttention} event${needsAttention > 1 ? "s" : ""} need attention` : "All events on track"}
    >
      <SectionHeader title="Upcoming Events" right="mock data" />
      {EVENTS.map((e, i) => {
        const palette = tileForScore(e.score);
        return (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "12px 18px",
            borderBottom: "1px solid rgba(0,0,0,0.06)",
          }}>
            {/* Score indicator bar */}
            <div style={{
              width: 4, alignSelf: "stretch", borderRadius: 2,
              background: palette.bg, flexShrink: 0,
              minHeight: 36,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: coastal.fonts.manrope, fontSize: 13,
                fontWeight: 700, color: "#1A2E28", marginBottom: 2,
              }}>
                {e.title}
              </div>
              <div style={{ fontSize: 10, color: "#8A9C9C", fontFamily: coastal.fonts.manrope }}>
                {e.date} · {e.time}
              </div>
              <div style={{
                fontSize: 11, color: e.score <= 3 ? palette.value : "#4A5A54",
                fontFamily: coastal.fonts.manrope, marginTop: 3,
                fontWeight: e.score <= 3 ? 700 : 400,
              }}>
                {e.note}
              </div>
            </div>
          </div>
        );
      })}
    </DrillDownModal>
  );
}

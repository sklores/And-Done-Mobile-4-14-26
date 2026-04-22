import { useEffect, useState } from "react";
import { DrillDownModal } from "./DrillDownModal";
import { coastal, tileForScore } from "../theme/skins";
import {
  fetchNearbyEvents,
  rollUpEventsScore,
  type NearbyEvent,
  type EventCategory,
} from "../data/eventsAdapter";

type Props = { open: boolean; onClose: () => void };

// ── Category → emoji-free visual glyph + label ─────────────────────────────
const CATEGORY_META: Record<EventCategory, { label: string; dot: string }> = {
  weather:    { label: "Weather",      dot: "#7BA9C7" },
  transit:    { label: "Transit",      dot: "#B8864A" },
  venue:      { label: "Venue",        dot: "#5C4A82" },
  civic:      { label: "Civic",        dot: "#4A7C6F" },
  government: { label: "Government",   dot: "#8A5A5A" },
  competitor: { label: "Competitor",   dot: "#A86A3E" },
  trend:      { label: "Food Scene",   dot: "#2F6B58" },
  community:  { label: "Community",    dot: "#7A7A8E" },
  tourism:    { label: "Tourism",      dot: "#D4A84A" },
};

function SectionHeader({ title, right }: { title: string; right?: string }) {
  return (
    <div
      style={{
        padding: "10px 18px 4px",
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: ".1em",
        textTransform: "uppercase",
        color: "#8A9C9C",
        fontFamily: coastal.fonts.manrope,
        background: "#F2F7F6",
        borderTop: "1px solid rgba(0,0,0,0.05)",
        borderBottom: "1px solid rgba(0,0,0,0.05)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <span>{title}</span>
      {right && <span style={{ opacity: 0.65 }}>{right}</span>}
    </div>
  );
}

// ── Format helpers ─────────────────────────────────────────────────────────
function formatEventWhen(e: NearbyEvent): string {
  const start = new Date(e.startsAt);
  const now = new Date();

  const sameDay =
    start.getFullYear() === now.getFullYear() &&
    start.getMonth() === now.getMonth() &&
    start.getDate() === now.getDate();

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow =
    start.getFullYear() === tomorrow.getFullYear() &&
    start.getMonth() === tomorrow.getMonth() &&
    start.getDate() === tomorrow.getDate();

  const dateStr = sameDay
    ? "Today"
    : isTomorrow
      ? "Tomorrow"
      : start.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          timeZone: "America/New_York",
        });

  if (e.allDay) return dateStr;

  const timeStr = start.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
  return `${dateStr} · ${timeStr}`;
}

function formatDistance(m: number | null): string | null {
  if (m == null) return null;
  if (m < 200) return "just outside";
  if (m < 1000) return `${Math.round(m / 10) * 10}m away`;
  const miles = m / 1609.34;
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

// ── Single event row ───────────────────────────────────────────────────────
function EventRow({ event }: { event: NearbyEvent }) {
  const palette = tileForScore(event.severity);
  const meta = CATEGORY_META[event.category] ?? { label: event.category, dot: "#8A9C9C" };
  const when = formatEventWhen(event);
  const dist = formatDistance(event.distanceM);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "12px 18px",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
      }}
    >
      {/* Severity indicator bar */}
      <div
        style={{
          width: 4,
          alignSelf: "stretch",
          borderRadius: 2,
          background: palette.bg,
          flexShrink: 0,
          minHeight: 48,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Category + distance */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 3,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: meta.dot,
              display: "inline-block",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: "#8A9C9C",
              fontFamily: coastal.fonts.manrope,
            }}
          >
            {meta.label}
          </span>
          {dist && (
            <span
              style={{
                fontSize: 9,
                color: "#A8B4B4",
                fontFamily: coastal.fonts.manrope,
              }}
            >
              · {dist}
            </span>
          )}
        </div>
        {/* Title */}
        <div
          style={{
            fontFamily: coastal.fonts.manrope,
            fontSize: 13,
            fontWeight: 700,
            color: "#1A2E28",
            marginBottom: 2,
            lineHeight: 1.3,
          }}
        >
          {event.title}
        </div>
        {/* When + venue */}
        <div
          style={{
            fontSize: 10,
            color: "#8A9C9C",
            fontFamily: coastal.fonts.manrope,
            marginBottom: event.description ? 3 : 0,
          }}
        >
          {when}
          {event.venueName ? ` · ${event.venueName}` : ""}
        </div>
        {/* Description + impact hint */}
        {(event.description || event.impactHint) && (
          <div
            style={{
              fontSize: 11,
              color: event.severity <= 3 ? palette.value : "#4A5A54",
              fontFamily: coastal.fonts.manrope,
              fontWeight: event.severity <= 3 ? 700 : 400,
              lineHeight: 1.35,
            }}
          >
            {event.description}
            {event.description && event.impactHint ? " · " : ""}
            {event.impactHint && (
              <span style={{ fontStyle: "italic", opacity: 0.8 }}>
                {event.impactHint}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Group events into Today / Tomorrow / Upcoming ──────────────────────────
function groupByDay(events: NearbyEvent[]): {
  today: NearbyEvent[];
  tomorrow: NearbyEvent[];
  later: NearbyEvent[];
} {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const sameDay = (d: Date, ref: Date) =>
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate();

  const today: NearbyEvent[] = [];
  const tmrw: NearbyEvent[] = [];
  const later: NearbyEvent[] = [];
  for (const e of events) {
    const d = new Date(e.startsAt);
    if (sameDay(d, now)) today.push(e);
    else if (sameDay(d, tomorrow)) tmrw.push(e);
    else later.push(e);
  }
  return { today, tomorrow: tmrw, later };
}

export function EventsDrillDown({ open, onClose }: Props) {
  const [events, setEvents] = useState<NearbyEvent[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch when the sheet opens; refetch each open so data is fresh
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetchNearbyEvents()
      .then((rows) => {
        if (!cancelled) {
          setEvents(rows);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEvents([]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const score = events ? rollUpEventsScore(events) : 5;
  const groups = events ? groupByDay(events) : { today: [], tomorrow: [], later: [] };
  const attention = events ? events.filter((e) => e.severity <= 3).length : 0;

  const headerValue = !events
    ? "--"
    : events.length === 0
      ? "none"
      : `${events.length} nearby`;

  const headerStatus = !events
    ? loading
      ? "Loading"
      : "No data"
    : events.length === 0
      ? "Nothing on the radar"
      : attention > 0
        ? `${attention} need${attention > 1 ? "" : "s"} attention`
        : "All clear";

  return (
    <DrillDownModal
      open={open}
      onClose={onClose}
      score={score}
      label="Events"
      value={headerValue}
      status={headerStatus}
    >
      {loading && (
        <div
          style={{
            padding: "24px 18px",
            color: "#8A9C9C",
            fontFamily: coastal.fonts.manrope,
            fontSize: 12,
            textAlign: "center",
          }}
        >
          Loading nearby events…
        </div>
      )}

      {!loading && events && events.length === 0 && (
        <div
          style={{
            padding: "28px 18px",
            color: "#8A9C9C",
            fontFamily: coastal.fonts.manrope,
            fontSize: 12,
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          No nearby events on the radar right now.
          <br />
          <span style={{ opacity: 0.65, fontSize: 10 }}>
            Weather, transit, venue, and neighborhood signals appear here.
          </span>
        </div>
      )}

      {!loading && events && events.length > 0 && (
        <>
          {groups.today.length > 0 && (
            <>
              <SectionHeader title="Today" right={`${groups.today.length}`} />
              {groups.today.map((e) => (
                <EventRow key={e.id} event={e} />
              ))}
            </>
          )}
          {groups.tomorrow.length > 0 && (
            <>
              <SectionHeader title="Tomorrow" right={`${groups.tomorrow.length}`} />
              {groups.tomorrow.map((e) => (
                <EventRow key={e.id} event={e} />
              ))}
            </>
          )}
          {groups.later.length > 0 && (
            <>
              <SectionHeader title="Next 14 Days" right={`${groups.later.length}`} />
              {groups.later.map((e) => (
                <EventRow key={e.id} event={e} />
              ))}
            </>
          )}
        </>
      )}
    </DrillDownModal>
  );
}

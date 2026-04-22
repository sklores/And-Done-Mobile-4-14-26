// Client-side adapter for the Events drill-down.
// Reads from Supabase `nearby_events` — backend chat owns the writer side
// (scrape-nearby-events Edge Function + pg_cron). See the handoff doc at
// ~/.claude/projects/-Users-anddone/memory/project_events_scraper.md

import { supabase, supabaseReady } from "../lib/supabase";

export type EventCategory =
  | "weather"
  | "transit"
  | "venue"
  | "civic"
  | "government"
  | "competitor"
  | "trend"
  | "community"
  | "tourism";

export type ImpactHint =
  | "increases foot traffic"
  | "decreases foot traffic"
  | "access disruption"
  | "neutral";

export type NearbyEvent = {
  id: string;
  source: string;
  category: EventCategory;
  title: string;
  description: string | null;
  startsAt: string;          // ISO
  endsAt: string | null;
  allDay: boolean;
  venueName: string | null;
  distanceM: number | null;  // meters from GCDC
  severity: number;          // 1–8 (mirrors mobile tile scale)
  impactHint: ImpactHint | null;
  url: string | null;
};

// Raw snake_case row shape from Supabase
type NearbyEventRow = {
  id: string;
  source: string;
  source_id: string | null;
  category: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  venue_name: string | null;
  distance_m: number | null;
  severity: number;
  impact_hint: string | null;
  url: string | null;
};

function rowToEvent(r: NearbyEventRow): NearbyEvent {
  return {
    id: r.id,
    source: r.source,
    category: r.category as EventCategory,
    title: r.title,
    description: r.description,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    allDay: r.all_day,
    venueName: r.venue_name,
    distanceM: r.distance_m,
    severity: r.severity,
    impactHint: r.impact_hint as ImpactHint | null,
    url: r.url,
  };
}

/**
 * Fetch upcoming events in the 14-day window starting 24h ago
 * (so same-day earlier events still show for the rest of today).
 * Returns [] on any error — caller treats empty list as "no events".
 */
export async function fetchNearbyEvents(): Promise<NearbyEvent[]> {
  if (!supabaseReady) return [];
  try {
    const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const windowEnd   = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("nearby_events")
      .select("*")
      .gte("starts_at", windowStart)
      .lte("starts_at", windowEnd)
      .order("starts_at", { ascending: true })
      .limit(40);
    if (error || !data) return [];
    return (data as NearbyEventRow[]).map(rowToEvent);
  } catch {
    return [];
  }
}

/**
 * Roll a list of events into the 1–8 score the Events tile displays.
 * Logic (from handoff doc §5):
 *   - any event in next 24h with severity ≤ 2 → pull tile to that worst severity
 *   - any event in next 24h with severity ≥ 7 → tile = 7 (positive surge)
 *   - otherwise weighted mean of severity, weight = 1 / max(hoursUntilStart, 1)
 *   - no events → neutral 5
 */
export function rollUpEventsScore(events: NearbyEvent[]): number {
  if (events.length === 0) return 5;
  const now = Date.now();
  const next24h = events.filter((e) => {
    const t = new Date(e.startsAt).getTime();
    return t >= now && t <= now + 24 * 60 * 60 * 1000;
  });
  if (next24h.some((e) => e.severity <= 2)) {
    return Math.min(...next24h.map((e) => e.severity));
  }
  if (next24h.some((e) => e.severity >= 7)) return 7;

  // Weighted mean, heavier weight on near-term events
  let num = 0, den = 0;
  for (const e of events) {
    const hoursUntil = Math.max((new Date(e.startsAt).getTime() - now) / 3_600_000, 1);
    const w = 1 / hoursUntil;
    num += e.severity * w;
    den += w;
  }
  if (den === 0) return 5;
  return Math.max(1, Math.min(8, Math.round(num / den)));
}

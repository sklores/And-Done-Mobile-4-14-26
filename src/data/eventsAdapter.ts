// Client-side adapter for the Events drill-down.
// Hits /api/nearby-events — Vercel serverless function that pulls from
// NWS (weather alerts, free) and Firecrawl (configurable list of pages).
// All secrets live server-side in Vercel env vars.

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
  distanceM: number | null;
  severity: number;          // 1–8 (mirrors mobile tile scale)
  impactHint: ImpactHint | null;
  url: string | null;
};

type EventsResponse = {
  events: NearbyEvent[];
  sources?: { nws: number; firecrawl: number; firecrawlConfigured: boolean };
  fetchedAt?: string;
  error?: string;
};

/**
 * Fetch live nearby events. Returns [] on any error — the UI treats empty
 * list as "nothing on the radar".
 */
export async function fetchNearbyEvents(): Promise<NearbyEvent[]> {
  try {
    const res = await fetch("/api/nearby-events", { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as EventsResponse;
    return Array.isArray(data.events) ? data.events : [];
  } catch {
    return [];
  }
}

/**
 * Roll a list of events into the 1–8 score the Events tile displays.
 *   - any event in next 24h with severity ≤ 2 → pull tile to worst severity
 *   - any event in next 24h with severity ≥ 7 → tile = 7 (positive surge)
 *   - otherwise weighted mean of severity, weight = 1 / max(hoursUntil, 1)
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

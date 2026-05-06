// Reads review rows from the `reviews` Supabase table populated by the
// daily sync-reviews Edge Function (Yelp, TripAdvisor, UberEats via Apify).
// Read-only — never writes back. Tenant-scoped to GCDC.

import { supabase, supabaseReady } from "../lib/supabase";

// ── Tenant ───────────────────────────────────────────────────────────────
// Single-org beta. When tenancy lands, lift this into a store / config table.
const GCDC_ORG_ID = "dd261210-9748-436e-899b-a8d3f154bcff";

// ── Types ────────────────────────────────────────────────────────────────
export type ReviewPlatform = "google" | "yelp" | "tripadvisor" | "ubereats";

export type ReviewRow = {
  id: string;
  platform: ReviewPlatform;
  reviewer_name: string | null;
  rating: number | null;
  review_text: string | null;
  review_date: string | null; // ISO date "YYYY-MM-DD"
  fetched_at: string;
};

export type PlatformSummary = {
  platform: ReviewPlatform;
  count: number;
  avgRating: number | null;       // null if no rated reviews from this platform
  status: "live" | "no-data";     // "no-data" → not wired yet (Google) or zero rows
};

export type StarBucket = {
  stars: 1 | 2 | 3 | 4 | 5;
  count: number;
  pct: number;
};

export type ReviewsBundle = {
  // Top-of-screen
  overallRating: number | null;     // weighted by per-review, only rated rows
  totalReviews: number;             // every row, even null-rating UberEats
  totalRatedReviews: number;        // rows with non-null rating

  // Sections
  platforms: PlatformSummary[];     // always 4 entries in fixed order, even at count=0
  starDistribution: StarBucket[];   // 5..1, percentages of rated reviews
  recent: ReviewRow[];              // top 5 by review_date desc (then fetched_at)

  fetchedAt: string;
};

// ── Fetch + roll up ──────────────────────────────────────────────────────
const PLATFORM_ORDER: ReviewPlatform[] = ["google", "yelp", "tripadvisor", "ubereats"];
const RECENT_LIMIT = 5;

/** Fetches all reviews for GCDC and rolls them into the shape the UI needs. */
export async function fetchReviewsBundle(): Promise<ReviewsBundle | null> {
  if (!supabaseReady) return null;
  try {
    const { data, error } = await supabase
      .from("reviews")
      .select("id, platform, reviewer_name, rating, review_text, review_date, fetched_at")
      .eq("org_id", GCDC_ORG_ID)
      .order("review_date", { ascending: false, nullsFirst: false })
      .order("fetched_at", { ascending: false })
      .limit(500);
    if (error || !data) return null;
    return rollUp(data as ReviewRow[]);
  } catch {
    return null;
  }
}

function rollUp(rows: ReviewRow[]): ReviewsBundle {
  // Per-platform aggregates — always emit all 4 platforms in fixed order so
  // the UI can show Google as "no data yet" without conditional rendering.
  const platforms: PlatformSummary[] = PLATFORM_ORDER.map((p) => {
    const rowsP = rows.filter((r) => r.platform === p);
    const rated = rowsP.filter((r) => r.rating != null);
    const avg = rated.length
      ? rated.reduce((s, r) => s + Number(r.rating), 0) / rated.length
      : null;
    return {
      platform: p,
      count: rowsP.length,
      avgRating: avg != null ? round1(avg) : null,
      status: rowsP.length > 0 ? "live" : "no-data",
    };
  });

  // Overall rating: simple mean across rated rows (each review weighted 1).
  // Equivalent to per-review weighting; cleaner than weighting platforms.
  const ratedRows = rows.filter((r) => r.rating != null);
  const overallRating = ratedRows.length
    ? round1(ratedRows.reduce((s, r) => s + Number(r.rating), 0) / ratedRows.length)
    : null;

  // Star distribution — bucket rated rows by rounded rating.
  const buckets: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of ratedRows) {
    const stars = clampStars(Math.round(Number(r.rating)));
    buckets[stars] += 1;
  }
  const starDistribution: StarBucket[] = ([5, 4, 3, 2, 1] as const).map((s) => ({
    stars: s,
    count: buckets[s],
    pct: ratedRows.length ? Math.round((buckets[s] / ratedRows.length) * 100) : 0,
  }));

  // Recent: top N by review_date desc. Already ordered by query.
  const recent = rows.slice(0, RECENT_LIMIT);

  return {
    overallRating,
    totalReviews: rows.length,
    totalRatedReviews: ratedRows.length,
    platforms,
    starDistribution,
    recent,
    fetchedAt: new Date().toISOString(),
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function clampStars(n: number): 1 | 2 | 3 | 4 | 5 {
  if (n <= 1) return 1;
  if (n >= 5) return 5;
  return n as 1 | 2 | 3 | 4 | 5;
}

// ── Display helpers ──────────────────────────────────────────────────────

/** "2026-05-04" → "Today" / "Yesterday" / "3d ago" / "2w ago" / "4mo ago". */
export function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const ms = Date.now() - d.getTime();
  const days = ms / 86_400_000;
  if (days < 1) return "Today";
  if (days < 2) return "Yesterday";
  if (days < 7) return `${Math.round(days)}d ago`;
  if (days < 30) return `${Math.round(days / 7)}w ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

export const PLATFORM_LABEL: Record<ReviewPlatform, string> = {
  google:      "Google",
  yelp:        "Yelp",
  tripadvisor: "Tripadvisor",
  ubereats:    "Uber Eats",
};

export const PLATFORM_COLOR: Record<ReviewPlatform, string> = {
  google:      "#4285F4",
  yelp:        "#D32323",
  tripadvisor: "#34E0A1",
  ubereats:    "#142328",
};

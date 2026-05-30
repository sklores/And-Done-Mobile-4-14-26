// Tracked-items watchlist — operator-curated list of up to 10 menu-item
// names to follow. Source of truth lives in
// `org_settings.tracked_items_json` (a JSON array of strings).
//
// The desktop app reads/writes the list; mobile is read-only for v1.
// Cap of 10 mirrors desktop's TRACKED_ITEMS_CAP.

import { supabase, supabaseReady } from "../lib/supabase";

const GCDC_ORG_ID = "dd261210-9748-436e-899b-a8d3f154bcff";
const TRACKED_ITEMS_CAP = 10;

/** Returns the tracked item names for GCDC, deduped, capped at 10. */
export async function fetchTrackedItems(): Promise<string[]> {
  if (!supabaseReady) return [];
  try {
    const { data, error } = await supabase
      .from("org_settings")
      .select("tracked_items_json")
      .eq("org_id", GCDC_ORG_ID)
      .single();
    if (error || !data) return [];
    const raw = (data as { tracked_items_json?: unknown }).tracked_items_json;
    if (!Array.isArray(raw)) return [];

    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of raw) {
      if (typeof v !== "string") continue;
      const trimmed = v.trim();
      if (!trimmed) continue;
      const lower = trimmed.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      out.push(trimmed);
      if (out.length >= TRACKED_ITEMS_CAP) break;
    }
    return out;
  } catch {
    return [];
  }
}

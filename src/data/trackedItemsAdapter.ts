// Tracked-items watchlist — operator-curated list of up to 10 menu-item
// names to follow. Source of truth lives in
// `org_settings.tracked_items_json` (a JSON array of strings).
//
// The desktop app reads/writes the list; mobile is read-only for v1.
// Cap of 10 mirrors desktop's TRACKED_ITEMS_CAP.



/** Returns the tracked item names for GCDC, deduped, capped at 10. */
export async function fetchTrackedItems(): Promise<string[]> {
  // The watchlist lived in a Desktop-era JSON blob the seed does not carry
  // (D9: Desktop is frozen). Empty until a V2 surface owns it.
  return [];
}

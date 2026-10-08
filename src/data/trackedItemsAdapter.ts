// Tracked-items watchlist — operator-curated list of up to 10 menu-item
// names to follow. Source of truth lives in
// `org_settings.tracked_items_json` (a JSON array of strings).
//
// The desktop app reads/writes the list; mobile is read-only for v1.
// Cap of 10 mirrors desktop's TRACKED_ITEMS_CAP.



/** False while no surface owns the watchlist: the empty list below is "there
 *  is nowhere to read this from", not "the operator tracks nothing".
 *
 *  A screen that shows tracked items must say which of the two it is looking
 *  at. SalesDrillDown does not yet: it hides the whole section on
 *  `tracked.length > 0`, so the absent source reads as an empty watchlist.
 *  The one line it needs is to gate that section on TRACKED_ITEMS_AVAILABLE
 *  and, when false, name the state instead of rendering nothing. */
export const TRACKED_ITEMS_AVAILABLE = false;

/** Returns the tracked item names for GCDC, deduped, capped at 10 — [] while
 *  TRACKED_ITEMS_AVAILABLE is false, which is not an answer about what the
 *  operator tracks. */
export async function fetchTrackedItems(): Promise<string[]> {
  // The watchlist lived in a Desktop-era JSON blob the seed does not carry
  // (D9: Desktop is frozen). Empty until a V2 surface owns it —
  // see TRACKED_ITEMS_AVAILABLE above.
  return [];
}

// Maps the seed's category rows → Food / Beverage / Alcohol groups.
//
// The COST is the seed's, always: apps/web sends each category's own rate and
// dollars (CategorySale.cogsPct / cogsDollars) from the org's effective-dated
// org_rates row -- the same numbers the COGS tile and the P&L are built from.
// This file used to recompute cost from a hard-coded 26/20/22, so changing an
// org's food rate moved the tile and left the drill-down under it showing
// "Food (26% COGS)" and a smaller number. A rate is a per-restaurant fact; it
// is never a constant in the app.
//
// A category the seed priced with nothing stays unknown: cost null, rendered
// "--". Never a zero standing in for a missing read.
import type { CategorySale } from "../data/toastAdapter";

export type CogsGroup = "Food" | "Beverage" | "Alcohol";
export type GroupData = {
  revenue: number;
  /** Seed-costed dollars for the group; null = the seed priced nothing here. */
  cost: number | null;
  /** Blended COGS % implied by the seed's OWN dollars; null = nothing to divide. */
  pct: number | null;
};

const GROUPS: CogsGroup[] = ["Food", "Beverage", "Alcohol"];

const finite = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** One category's cost, from the seed: its dollars if they are on the wire,
 *  else its own rate applied to its own revenue. Null if it sent neither. */
function seedCost(cat: CategorySale): number | null {
  const dollars = finite(cat.cogsDollars);
  if (dollars != null) return dollars;
  const pct = finite(cat.cogsPct);
  return pct != null ? (cat.revenue * pct) / 100 : null;
}

/** Roll up categorySales into the three groups, carrying the seed's cost. */
export function buildGroups(cats: CategorySale[]): Record<CogsGroup, GroupData> {
  const sum: Record<CogsGroup, number> = { Food: 0, Beverage: 0, Alcohol: 0 };
  const revenue: Record<CogsGroup, number> = { Food: 0, Beverage: 0, Alcohol: 0 };
  // A group is only costed if EVERY row in it came priced -- a partial sum
  // presented as the group's cost is the same lie as a zero.
  const priced: Record<CogsGroup, boolean> = { Food: false, Beverage: false, Alcohol: false };
  const unpriced: Record<CogsGroup, boolean> = { Food: false, Beverage: false, Alcohol: false };

  for (const cat of cats) {
    const g = categoryGroup(cat.name);
    revenue[g] += cat.revenue;
    const cost = seedCost(cat);
    if (cost == null) unpriced[g] = true;
    else { sum[g] += cost; priced[g] = true; }
  }

  const out = {} as Record<CogsGroup, GroupData>;
  for (const g of GROUPS) {
    const cost = priced[g] && !unpriced[g] ? sum[g] : null;
    out[g] = {
      revenue: revenue[g],
      cost,
      pct: cost != null && revenue[g] > 0 ? (cost / revenue[g]) * 100 : null,
    };
  }
  return out;
}

const FOOD_CATS = new Set([
  "Food","Sandwiches","Grilled Cheese","Soups","Soup","Sides","Side",
  "Appetizers","Appetizer","Kids","Dessert","Desserts","Other",
  "Entrees","Entree","Mains","Salads","Salad","Snacks",
]);
const BEV_CATS = new Set([
  "NA Beverage","Non-Alcoholic","Soft Drinks","Soda",
  "Coffee","Tea","Juice","Beverages","Beverage",
]);
const ALCOHOL_CATS = new Set([
  "Beer","Draft Beer","Bottle Beer","Bottled Beer",
  "Wine","Bottle Wine","Wines",
  "Cocktails","Cocktail","Spirits","Liquor","Bar",
]);

export function categoryGroup(name: string): CogsGroup {
  // Exact-match sets (for category-level names)
  if (ALCOHOL_CATS.has(name)) return "Alcohol";
  if (BEV_CATS.has(name))     return "Beverage";
  if (FOOD_CATS.has(name))    return "Food";

  // Keyword matching for individual item names (e.g. "Port City Hazy IPA 16oz")
  const n = name.toLowerCase();

  // Root beer / ginger beer are NOT alcohol — check first
  const isRootOrGinger = n.includes("root beer") || n.includes("ginger beer");

  if (!isRootOrGinger && (
    n.includes("ipa") || n.includes("hazy") || n.includes("lager") ||
    n.includes("ale") || n.includes("stout") || n.includes("porter") ||
    n.includes("draft") || n.includes("bottle beer") ||
    n.includes("wine") || n.includes("chardonnay") || n.includes("cabernet") ||
    n.includes("merlot") || n.includes("pinot") || n.includes("rosé") || n.includes("rose") ||
    n.includes("cocktail") || n.includes("spirit") || n.includes("liquor") ||
    n.includes("whiskey") || n.includes("bourbon") || n.includes("vodka") ||
    n.includes("tequila") || n.includes("rum") || n.includes("gin") ||
    n.includes("alcohol") || n.includes("bar")
  )) return "Alcohol";

  if (
    n.includes("coke") || n.includes("cola") || n.includes("water") ||
    n.includes("soda") || n.includes("lemonade") || n.includes("tea") ||
    n.includes("juice") || n.includes("coffee") || n.includes("espresso") ||
    n.includes("latte") || n.includes("cappuccino") || n.includes("sparkling") ||
    n.includes("pellegrino") || n.includes("perrier") || n.includes("drink") ||
    n.includes("beverage") || n.includes("dr pepper") || n.includes("sprite") ||
    n.includes("orange juice") || n.includes("apple juice") || isRootOrGinger
  ) return "Beverage";

  return "Food";
}

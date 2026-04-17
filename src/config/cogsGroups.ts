// Maps Toast category names → Food / Beverage / Alcohol group.
// Any unrecognised category falls back to "Food".
import type { CategorySale } from "../data/toastAdapter";

export type CogsGroup = "Food" | "Beverage" | "Alcohol";
export type GroupData  = { revenue: number; cost: number };

/** Roll up categorySales into the three groups and apply fixed COGS %. */
export function buildGroups(cats: CategorySale[]): Record<CogsGroup, GroupData> {
  const groups: Record<CogsGroup, GroupData> = {
    Food:     { revenue: 0, cost: 0 },
    Beverage: { revenue: 0, cost: 0 },
    Alcohol:  { revenue: 0, cost: 0 },
  };
  for (const cat of cats) {
    const g = categoryGroup(cat.name);
    groups[g].revenue += cat.revenue;
    groups[g].cost    += cat.revenue * (GROUP_COGS_PCT[g] / 100);
  }
  return groups;
}

export const GROUP_COGS_PCT: Record<CogsGroup, number> = {
  Food:     26,
  Beverage: 20,
  Alcohol:  22,
};

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

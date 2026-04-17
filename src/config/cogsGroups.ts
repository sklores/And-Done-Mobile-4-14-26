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
  "Food","Sandwiches","Grilled Cheese","Soups","Sides",
  "Appetizers","Appetizer","Kids","Dessert","Desserts",
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
  if (ALCOHOL_CATS.has(name)) return "Alcohol";
  if (BEV_CATS.has(name))     return "Beverage";
  if (FOOD_CATS.has(name))    return "Food";
  // fuzzy fallback
  const n = name.toLowerCase();
  if (n.includes("beer") || n.includes("wine") || n.includes("cocktail") ||
      n.includes("spirit") || n.includes("liquor") || n.includes("alcohol")) return "Alcohol";
  if (n.includes("beverage") || n.includes("drink") || n.includes("soda") ||
      n.includes("coffee") || n.includes("tea") || n.includes("juice"))      return "Beverage";
  return "Food";
}

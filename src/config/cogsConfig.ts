// COGS category configuration.
// mockPct values are placeholder splits that sum to the current 26.4% COGS mock.
// Replace with real values once connected to an inventory system (MarketMan, etc.).

export type CogsCategory = {
  key: string;
  label: string;
  mockPct: number;   // % of net sales — mocked until real data
  targetPct: number; // operator target
  color: string;
};

export const COGS_CATEGORIES: CogsCategory[] = [
  { key: "food",    label: "Food",           mockPct: 18.0, targetPct: 18.0, color: "#4A9B8E" },
  { key: "alcohol", label: "Alcohol",         mockPct:  5.0, targetPct:  5.5, color: "#6B8FBF" },
  { key: "nabev",   label: "N/A Beverage",    mockPct:  2.0, targetPct:  2.0, color: "#8BBF6B" },
  { key: "paper",   label: "Paper & Supplies", mockPct:  1.4, targetPct:  1.5, color: "#BFA96B" },
];

// Total mock COGS % (should equal existing COGS_PCT_MOCK in useKpiStore)
export const COGS_TOTAL_MOCK_PCT = COGS_CATEGORIES.reduce((s, c) => s + c.mockPct, 0);

// Labor target for prime cost context
export const LABOR_TARGET_PCT = 30;
export const PRIME_TARGET_PCT = LABOR_TARGET_PCT + COGS_TOTAL_MOCK_PCT; // ~56.4%

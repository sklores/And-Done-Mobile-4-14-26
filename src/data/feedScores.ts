// Single source of truth for feed chip scores.
// MarqueeFeed chips and drill-down headers both read from here.
import type { FeedKey } from "../components/MarqueeFeed";

export const FEED_SCORES: Record<FeedKey, number> = {
  reviews: 8,   // 4.8★ excellent
  bank:    6,   // normal transactions, nothing alarming
  social:  4,   // below follower target — alert
  events:  5,   // some events need attention
};

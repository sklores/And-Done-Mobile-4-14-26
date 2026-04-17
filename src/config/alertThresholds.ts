// Crisis-level thresholds that trigger the continuous pulse animation.
// Distinct from the score system — a tile can be score 1 without pulsing.
// Pulse = genuinely alarming, needs immediate operator attention.

export const ALERT_THRESHOLDS = {
  sales:  { below:  400  },   // < $400 dangerously slow
  cogs:   { above:   42  },   // > 42% of sales
  labor:  { above:   50  },   // > 50% of sales
  prime:  { above:   90  },   // > 90% of sales
  fixed:  { above:   35  },   // > 35% of sales
  net:    { below:  -15  },   // < -15% net profit
} as const;

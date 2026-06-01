// ─── Bag Weight ───────────────────────────────────────────────────────────────
// Standard bag weight used across the entire app for assumed KG calculations.
// Change this ONE value if the bag weight ever changes — it updates everywhere.
export const BAG_WEIGHT_KG = 85;

// ─── Variance Thresholds ──────────────────────────────────────────────────────
// How much variance (%) is acceptable before showing a warning
export const VARIANCE_WARNING_PCT = 5;   // warn if actual is 5%+ below assumed
export const VARIANCE_DANGER_PCT  = 10;  // danger if actual is 10%+ below assumed
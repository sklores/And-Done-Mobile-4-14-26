// COGS / prime-cost targets.
//
// There is no target in this app. V1 summed the `mockPct` column of a
// placeholder category table -- a column the file itself declared a mock --
// into PRIME_TARGET_PCT and scored the operator red or green against it, so
// a prime cost of 56.7% read "+0.3% above target" in red against a target
// (56.4) invented from mocked actuals. Replacing the mocks with real numbers
// would have moved the target with them, and the operator could never miss it.
//
// Per-restaurant facts are effective-dated rows on the seed, never constants
// here (the same call salesTargetConfig made: "No targets in the app"). The
// seed sends the org's COGS rates with every category row
// (CategorySale.cogsPct / cogsDollars) but sends no prime-cost target, so the
// Prime sheet shows "no target on file" until one is on the wire.

/** The operator's prime-cost target, or null while nothing supplies one.
 *  Never derive this from the app's own placeholder numbers. */
export const PRIME_TARGET_PCT: number | null = null;

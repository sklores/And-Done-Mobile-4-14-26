// GET /api/seed?view=<view>&from=&to= -- generic pass-through to the And
// Done seed for the secondary tabs (invoices, reviews, schedule, fixed-costs).
const ALLOWED = new Set(["invoices", "reviews", "schedule", "fixed-costs", "aging"]);
export default async function handler(req, res) {
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  const url = new URL(req.url, "http://x");
  const view = url.searchParams.get("view");
  if (!ALLOWED.has(view)) { res.statusCode = 400; return res.end(JSON.stringify({ error: "unknown view" })); }
  try {
    const base = process.env.SEED_API_BASE, key = process.env.SEED_API_KEY, org = process.env.SEED_ORG_SLUG ?? "gcdc";
    const qs = new URLSearchParams({ org, view });
    for (const k of ["from", "to"]) { const v = url.searchParams.get(k); if (v) qs.set(k, v); }
    const r = await fetch(`${base}/api/owner?${qs}`, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" });
    res.statusCode = r.status;
    res.end(await r.text());
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
  }
}

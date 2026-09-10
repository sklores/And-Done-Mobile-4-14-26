// /api/seed?view=<view>[&period=][&from=&to=] -- pass-through to the seed
// for everything that is not a tile. GET views read; POST views write
// (JSON body forwarded as-is). The API key never leaves this function.
// Every failure leaves with a non-2xx and a message: an empty list the app
// would print as "no entries" is never manufactured here.
import { requireSession, readJson } from "./_auth.mjs";
import { seedEnv } from "./_seed.mjs";
const GET_VIEWS = new Set(["invoices", "reviews", "schedule", "fixed-costs", "aging", "mr", "log"]);
const POST_VIEWS = new Set(["mr-add", "mr-delete", "log-add", "log-delete", "gizmo", "invoice-scan", "invoice-add", "ocr"]);

/** What went wrong upstream, in words: the seed's own {error} when it sent one. */
function seedError(view, status, raw) {
  if (status === 401 || status === 403) return `seed rejected the API key (${status})`;
  let detail = "";
  try { const b = JSON.parse(raw); if (b && typeof b.error === "string") detail = ` -- ${b.error}`; } catch { /* not JSON */ }
  return `seed ${view}: ${status}${detail}`;
}

export default async function handler(req, res, env = process.env) {
  if (!requireSession(req, res, env)) return;
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  const url = new URL(req.url, "http://x");
  const view = url.searchParams.get("view");
  const isPost = req.method === "POST";
  if (!(isPost ? POST_VIEWS : GET_VIEWS).has(view)) { res.statusCode = 400; return res.end(JSON.stringify({ error: "unknown view" })); }
  try {
    // Missing SEED_API_BASE/SEED_API_KEY -> 500 naming the var, not a fake 200.
    const { base, key, org } = seedEnv(env);
    const qs = new URLSearchParams({ org, view });
    for (const k of ["from", "to", "period"]) { const v = url.searchParams.get(k); if (v) qs.set(k, v); }
    const body = isPost ? JSON.stringify(await readJson(req)) : undefined;
    let r;
    try {
      r = await fetch(`${base}/api/owner?${qs}`, { method: isPost ? "POST" : "GET", headers: { Authorization: `Bearer ${key}`, ...(isPost ? { "content-type": "application/json" } : {}) }, body, cache: "no-store" });
    } catch (e) {
      throw Object.assign(new Error(`seed ${view}: unreachable (${e instanceof Error ? e.message : String(e)})`), { httpStatus: 502 });
    }
    const raw = await r.text();
    if (r.ok) {
      // Reads only: a blank body is an unknown, not an empty list -- don't hand
      // it over as one. Writes pass through untouched, blank body and all: the
      // seed's POST routes are not in this checkout, so we do not know that
      // mr-delete/log-delete answer with JSON, and a 200/204-with-no-body from a
      // delete that really happened must not be reported as a failure (the
      // stores restore the row and print the error under it).
      if (!isPost && raw.trim() === "") { res.statusCode = 502; return res.end(JSON.stringify({ view, error: `seed ${view}: empty reply` })); }
      res.statusCode = r.status;
      return res.end(raw);
    }
    // The seed rejecting OUR key, or falling over, is a server misconfiguration
    // or outage -- never "sign in again". A 4xx about the request keeps its own
    // status. Either way the body is JSON with something the screen can say.
    res.statusCode = r.status === 401 || r.status === 403 || r.status >= 500 ? 502 : r.status;
    res.end(JSON.stringify({ view, error: seedError(view, r.status, raw) }));
  } catch (e) {
    res.statusCode = e?.httpStatus ?? 500;
    res.end(JSON.stringify({ view, error: e instanceof Error ? e.message : String(e) }));
  }
}

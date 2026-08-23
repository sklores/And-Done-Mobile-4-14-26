// /api/seed?view=<view>[&period=][&from=&to=] -- pass-through to the seed
// for everything that is not a tile. GET views read; POST views write
// (JSON body forwarded as-is). The API key never leaves this function.
import { requireSession, readJson } from "./_auth.mjs";
const GET_VIEWS = new Set(["invoices", "reviews", "schedule", "fixed-costs", "aging", "mr", "log"]);
const POST_VIEWS = new Set(["mr-add", "mr-delete", "log-add", "log-delete", "gizmo", "invoice-scan", "invoice-add", "ocr"]);

export default async function handler(req, res, env = process.env) {
  if (!requireSession(req, res, env)) return;
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  const url = new URL(req.url, "http://x");
  const view = url.searchParams.get("view");
  const isPost = req.method === "POST";
  if (!(isPost ? POST_VIEWS : GET_VIEWS).has(view)) { res.statusCode = 400; return res.end(JSON.stringify({ error: "unknown view" })); }
  try {
    const base = env.SEED_API_BASE, key = env.SEED_API_KEY, org = env.SEED_ORG_SLUG ?? "gcdc";
    const qs = new URLSearchParams({ org, view });
    for (const k of ["from", "to", "period"]) { const v = url.searchParams.get(k); if (v) qs.set(k, v); }
    const body = isPost ? JSON.stringify(await readJson(req)) : undefined;
    const r = await fetch(`${base}/api/owner?${qs}`, { method: isPost ? "POST" : "GET", headers: { Authorization: `Bearer ${key}`, ...(isPost ? { "content-type": "application/json" } : {}) }, body, cache: "no-store" });
    res.statusCode = r.status;
    res.end(await r.text());
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
  }
}

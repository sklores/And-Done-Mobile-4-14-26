// The owner app reads from the And Done seed (D15) -- one heartbeat, one
// truth. These server functions hold the API key; the browser never sees it.
// The app's own Toast client (_toast.mjs) is no longer used for the tiles.

export async function fromSeed(view, env = process.env, extra = {}) {
  const base = env.SEED_API_BASE;                  // https://manager.gcdc.anddone.ai
  const key = env.SEED_API_KEY;
  const org = env.SEED_ORG_SLUG ?? "gcdc";
  if (!base || !key) throw new Error("SEED_API_BASE / SEED_API_KEY not set");
  const qs = new URLSearchParams({ org, view, ...extra });
  const r = await fetch(`${base}/api/owner?${qs}`, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" });
  if (!r.ok) throw new Error(`seed ${view}: ${r.status}`);
  return r.json();
}

export function proxy(view) {
  return async function handler(req, res) {
    res.setHeader("content-type", "application/json");
    res.setHeader("cache-control", "no-store");
    try {
      res.statusCode = 200;
      res.end(JSON.stringify(await fromSeed(view, process.env, passThrough(req))));
    } catch (e) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
    }
  };
}

/** The only query param the browser may forward: which period the tiles sum. */
export function passThrough(req) {
  const period = new URL(req.url ?? "", "http://x").searchParams.get("period");
  return period === "wtd" || period === "mtd" ? { period } : {};
}

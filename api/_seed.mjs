import { requireSession } from "./_auth.mjs";
// The owner app reads from the And Done seed (D15) -- one heartbeat, one
// truth. These server functions hold the API key; the browser never sees it.
// The app's own Toast client (_toast.mjs) is no longer used for the tiles.
//
// A read that failed is never dressed up as a read that succeeded: this lane
// answers 500 when THIS deployment is misconfigured (the message names the env
// var) and 502 when the seed did not answer -- never a 200 carrying zeros.

/** An error that knows which HTTP status tells the truth about it. */
const fail = (httpStatus, message) => Object.assign(new Error(message), { httpStatus });

/** The env this lane needs. Base and key are required -- a missing one is a 500
 *  that names it, never a 200 carrying zeros.
 *
 *  The org slug keeps the "gcdc" default that api/login.mjs also uses. Making it
 *  required belongs to a later pass, not this one: login.mjs is outside this
 *  change, and requiring the var in only one of the two call sites gives the
 *  worst failure of the three -- the PIN succeeds against GCDC and then every
 *  screen behind it reads "SEED_ORG_SLUG not set". Land it once the var is
 *  confirmed set in BOTH projects' env (this app and gcdc.anddone.ai) and
 *  login.mjs can move onto seedEnv() in the same commit. */
export function seedEnv(env = process.env) {
  const missing = ["SEED_API_BASE", "SEED_API_KEY"].filter((k) => !env[k]);
  if (missing.length) throw fail(500, `${missing.join(", ")} not set`);
  return { base: env.SEED_API_BASE, key: env.SEED_API_KEY, org: env.SEED_ORG_SLUG ?? "gcdc" };
}

export async function fromSeed(view, env = process.env, extra = {}) {
  const { base, key, org } = seedEnv(env);        // https://manager.gcdc.anddone.ai
  const qs = new URLSearchParams({ org, view, ...extra });
  let r;
  try {
    r = await fetch(`${base}/api/owner?${qs}`, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" });
  } catch (e) {
    throw fail(502, `seed ${view}: unreachable (${e instanceof Error ? e.message : String(e)})`);
  }
  if (!r.ok) throw fail(502, r.status === 401 || r.status === 403 ? `seed rejected the API key (${r.status})` : `seed ${view}: ${r.status}`);
  // A body we cannot parse is an unknown, not an empty tick.
  try { return await r.json(); } catch { throw fail(502, `seed ${view}: reply was not JSON`); }
}

export function proxy(view) {
  return async function handler(req, res, env = process.env) {
    if (!requireSession(req, res, env)) return;
    res.setHeader("content-type", "application/json");
    res.setHeader("cache-control", "no-store");
    try {
      const data = await fromSeed(view, env, passThrough(req));
      res.statusCode = 200;
      res.end(JSON.stringify(data));
    } catch (e) {
      // 502 = the seed failed us; 500 = we are misconfigured. Both carry a
      // message, so the screen can say what is unavailable instead of showing 0.
      res.statusCode = e?.httpStatus ?? 500;
      res.end(JSON.stringify({ view, error: e instanceof Error ? e.message : String(e) }));
    }
  };
}

/** The only query param the browser may forward: which period the tiles sum. */
export function passThrough(req) {
  const period = new URL(req.url ?? "", "http://x").searchParams.get("period");
  return period === "wtd" || period === "mtd" ? { period } : {};
}

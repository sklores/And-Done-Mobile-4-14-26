// POST { pin } -> the seed checks it (rate-limited there); on success we set
// the session cookie. The API key never leaves this function.
//
// A login that never reached the seed is never reported as a wrong PIN: a
// missing env var is a 500 naming it, an unreachable seed is a 502 saying so,
// and only the seed's own 401/403 means "that's not it". The front door
// (PinGate) prints the message for every other status.
import { readJson, sessionCookie } from "./_auth.mjs";
import { seedEnv } from "./_seed.mjs";
export default async function handler(req, res, env = process.env) {
  res.setHeader("content-type", "application/json");
  if (req.method !== "POST") { res.statusCode = 405; return res.end(JSON.stringify({ error: "POST" })); }
  const { pin } = await readJson(req);
  const ip = (req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
  try {
    // Missing SEED_API_BASE/SEED_API_KEY -> 500 naming the var, never a fetch
    // of "undefined/api/owner/login" that lands as a denial. seedEnv keeps the
    // same "gcdc" default for the org slug this handler already used.
    const { base, key, org } = seedEnv(env);
    let r;
    try {
      r = await fetch(`${base}/api/owner/login`, {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ org, pin: String(pin ?? ""), ip }),
      });
    } catch (e) {
      throw Object.assign(new Error(`seed login: unreachable (${e instanceof Error ? e.message : String(e)})`), { httpStatus: 502 });
    }
    if (r.ok) res.setHeader("set-cookie", sessionCookie(env));
    res.statusCode = r.status;
    res.end(await r.text());
  } catch (e) {
    // 500 = we are misconfigured; 502 = the seed did not answer. Both carry a
    // message the door can print instead of calling the PIN wrong.
    res.statusCode = e?.httpStatus ?? 502;
    res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
  }
}

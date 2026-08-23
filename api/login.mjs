// POST { pin } -> the seed checks it (rate-limited there); on success we set
// the session cookie. The API key never leaves this function.
import { readJson, sessionCookie } from "./_auth.mjs";
export default async function handler(req, res, env = process.env) {
  res.setHeader("content-type", "application/json");
  if (req.method !== "POST") { res.statusCode = 405; return res.end(JSON.stringify({ error: "POST" })); }
  const { pin } = await readJson(req);
  const ip = (req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
  try {
    const r = await fetch(`${env.SEED_API_BASE}/api/owner/login`, {
      method: "POST", headers: { Authorization: `Bearer ${env.SEED_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ org: env.SEED_ORG_SLUG ?? "gcdc", pin: String(pin ?? ""), ip }),
    });
    if (r.ok) res.setHeader("set-cookie", sessionCookie(env));
    res.statusCode = r.status;
    res.end(await r.text());
  } catch (e) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
  }
}

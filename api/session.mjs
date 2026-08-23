import { hasSession } from "./_auth.mjs";
export default async function handler(req, res, env = process.env) {
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  res.statusCode = hasSession(req, env) ? 200 : 401;
  res.end(JSON.stringify({ ok: res.statusCode === 200 }));
}

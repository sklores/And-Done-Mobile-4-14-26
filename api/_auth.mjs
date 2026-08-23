// The owner app's session (D18). The PIN is checked by the seed (it owns the
// hash and the rate limit); this function mints and verifies the cookie.
// Cookie = "<expiry>.<hmac(expiry)>", 30 days, HttpOnly. Nothing in the
// browser can read or forge it; every data handler calls requireSession.
import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "owner_session";
const DAYS = 30;

function secret(env = process.env) {
  const s = env.OWNER_SESSION_SECRET;
  if (!s) throw new Error("OWNER_SESSION_SECRET not set");
  return s;
}
const sign = (exp, env) => createHmac("sha256", secret(env)).update(`owner:${exp}`).digest("hex");

// Secure everywhere except the plain-http dev server.
const flags = (env) => `Path=/; HttpOnly; SameSite=Lax${env.VERCEL ? "; Secure" : ""}`;
export function sessionCookie(env = process.env) {
  const exp = Date.now() + DAYS * 86400_000;
  return `${COOKIE}=${exp}.${sign(exp, env)}; Max-Age=${DAYS * 86400}; ${flags(env)}`;
}
export const clearCookie = (env = process.env) => `${COOKIE}=; Max-Age=0; ${flags(env)}`;

export function hasSession(req, env = process.env) {
  const raw = (req.headers?.cookie ?? "").split(";").map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE}=`));
  if (!raw) return false;
  const [exp, mac] = raw.slice(COOKIE.length + 1).split(".");
  if (!exp || !mac || Number(exp) < Date.now()) return false;
  const want = sign(exp, env);
  return want.length === mac.length && timingSafeEqual(Buffer.from(want), Buffer.from(mac));
}

/** 401 and false when there is no session. */
export function requireSession(req, res, env = process.env) {
  if (hasSession(req, env)) return true;
  res.statusCode = 401;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ error: "sign in" }));
  return false;
}

/** Read a JSON body from a node request (Vercel parses it; the dev server does not). */
export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}

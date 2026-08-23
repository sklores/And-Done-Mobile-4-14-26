import { clearCookie } from "./_auth.mjs";
export default async function handler(_req, res, env = process.env) {
  res.setHeader("set-cookie", clearCookie(env));
  res.statusCode = 204;
  res.end();
}

// Vercel serverless function: GET /api/toast-labor
// Returns today's labor cost, hours, and employee count from Toast.

import { credsFromEnv, getTodayLabor } from "./_toast.mjs";

export default async function handler(_req, res) {
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  try {
    const creds = credsFromEnv(process.env);
    const data = await getTodayLabor(creds);
    res.statusCode = 200;
    res.end(JSON.stringify(data));
  } catch (e) {
    res.statusCode = 500;
    res.end(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
    );
  }
}

// GET /api/toast-cogs-detail
// Returns COGS breakdown by sales category, paper cost by channel,
// 3rd party commissions, comps, and voids.
import { credsFromEnv, getTodayCOGSDetail } from "./_toast.mjs";

export default async function handler(_req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  try {
    const result = await getTodayCOGSDetail(credsFromEnv(process.env));
    res.statusCode = 200;
    res.end(JSON.stringify(result));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e.message }));
  }
}

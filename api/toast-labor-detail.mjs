// GET /api/toast-labor-detail
// Returns hourly/salary split, FOH/BOH breakdown, OT flag, EOD projection.
import { credsFromEnv, getTodayLaborDetail } from "./_toast.mjs";

export default async function handler(_req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  try {
    const creds = credsFromEnv(process.env);
    const result = await getTodayLaborDetail(creds);
    res.statusCode = 200;
    res.end(JSON.stringify(result));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e.message }));
  }
}

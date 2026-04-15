// GET /api/toast-sales-detail
// Returns product mix (pmix) and sales by channel for today.
import { credsFromEnv, getTodaySalesDetail } from "./_toast.mjs";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  try {
    const creds = credsFromEnv(process.env);
    const result = await getTodaySalesDetail(creds);
    res.statusCode = 200;
    res.end(JSON.stringify(result));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e.message }));
  }
}

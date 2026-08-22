// GET /api/snapshot -- the latest KPI tick, in the kpi_snapshots shape the
// store applies. Polled by the app; replaces the Supabase realtime channel
// (which needed a public anon key with read access to the whole table).
import { proxy } from "./_seed.mjs";
export default proxy("snapshot");

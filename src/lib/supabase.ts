import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Fall back to placeholder so createClient never throws —
// subscribeToSnapshots will silently no-op if creds are missing.
export const supabase = createClient(
  url ?? "https://placeholder.supabase.co",
  key ?? "placeholder-key",
);

export const supabaseReady = !!(url && key);

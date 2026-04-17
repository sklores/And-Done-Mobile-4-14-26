-- ============================================================
-- And Done — Phase 3: Cron Schedule for sync-toast-kpis
-- ============================================================

-- Enable pg_cron extension
create extension if not exists pg_cron;

-- Schedule sync-toast-kpis every 5 minutes
select cron.schedule(
  'sync-toast-kpis',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://dqcwgbowfssyjldxoakl.supabase.co/functions/v1/sync-toast-kpis',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_Rt9pa0Y8hoY8X5wnmaNOYw_T3arsw51"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

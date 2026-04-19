-- Enable pg_net so cron jobs can invoke Edge Functions via net.http_post.
-- Without this, every scheduled job fails with "schema 'net' does not exist"
-- and no nightly reports or KPI syncs ever run.
create extension if not exists pg_net with schema extensions;

-- Re-point the cron jobs at the extensions schema so they find net.http_post
-- regardless of search_path.
select cron.unschedule('sync-toast-kpis');
select cron.unschedule('send-daily-report');

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

select cron.schedule(
  'send-daily-report',
  '0 0 * * *',
  $$
  select net.http_post(
    url := 'https://dqcwgbowfssyjldxoakl.supabase.co/functions/v1/send-daily-report',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_Rt9pa0Y8hoY8X5wnmaNOYw_T3arsw51"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Nightly report at 8 PM ET (midnight UTC = 8 PM EDT, close enough for EST too)
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

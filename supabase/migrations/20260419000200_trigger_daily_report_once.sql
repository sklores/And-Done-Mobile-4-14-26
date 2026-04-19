-- One-shot: fire send-daily-report right now via the exact same path
-- the nightly cron uses (pg_net → edge function). If this succeeds, the
-- nightly firing will also succeed. We purposely don't wait on the
-- response here — net.http_post is fire-and-forget.
select net.http_post(
  url := 'https://dqcwgbowfssyjldxoakl.supabase.co/functions/v1/send-daily-report',
  headers := '{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_Rt9pa0Y8hoY8X5wnmaNOYw_T3arsw51"}'::jsonb,
  body := '{}'::jsonb
);

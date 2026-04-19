-- Ops view: expose pg_cron run history via PostgREST for monitoring.
-- Use this to verify scheduled jobs are firing and to see failure messages.
create or replace view public.cron_runs as
select j.jobname, r.status, r.return_message, r.start_time, r.end_time
from cron.job_run_details r
join cron.job j on j.jobid = r.jobid
order by r.start_time desc;

grant select on public.cron_runs to anon, authenticated, service_role;

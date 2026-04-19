-- Ops view: expose pg_net HTTP response history for monitoring.
create or replace view public.http_responses as
select id, status_code, content::text as body, created
from net._http_response
order by created desc;

grant select on public.http_responses to anon, authenticated, service_role;

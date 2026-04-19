-- Real activity_log table. Replaces the localStorage-only Zustand log.
-- Both Gizmo (via add_log_note tool) and humans (via the Log tab input)
-- insert here. Auto events from other edge functions can insert here too.

create table activity_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  created_at timestamptz default now(),
  text text not null,
  type text not null default 'manual',  -- 'manual' | 'gizmo' | 'auto'
  source text,                          -- free-form, e.g. 'gizmo', 'user', 'toast-sync'
  related_invoice_id uuid references invoices(id) on delete set null
);

create index activity_log_org_time on activity_log(org_id, created_at desc);

alter table activity_log enable row level security;

-- Dev-mode beta: wide open to anon (same pattern as invoices).
-- Tighten when we do the multi-tenant + auth pass.
create policy "Anon read activity_log (dev)"
  on activity_log for select
  to anon
  using (true);

create policy "Anon insert activity_log (dev)"
  on activity_log for insert
  to anon
  with check (true);

create policy "Anon delete activity_log (dev)"
  on activity_log for delete
  to anon
  using (true);

-- Service role can do everything (for edge functions)
create policy "Service role manages activity_log"
  on activity_log for all
  using (true)
  with check (true);

-- Full P&L snapshot: extend kpi_snapshots so the row alone is enough to
-- reproduce every tile the mobile app shows. Pulls salary + fixed costs
-- + M&R into the snapshot itself so the nightly email and mobile see the
-- same numbers.
--
-- Before: sync-toast-kpis wrote labor_total/labor_pct/cogs_*/net_profit
-- but missed (a) schedule-driven salary, (b) fixed costs (rent + amortized
-- + M&R), (c) the breakouts the email needed. The email therefore showed
-- net profit too high (no fixed costs subtracted) and labor too low (old
-- $200/day proration vs schedule-driven).
--
-- After this migration + sync rewrite, the snapshot is the single source
-- of truth and applySnapshot just reads.

-- ── kpi_snapshots: new columns ────────────────────────────────────────
alter table kpi_snapshots
  add column if not exists labor_hourly      numeric,  -- Toast clock-in cost only
  add column if not exists salary_total      numeric,  -- schedule-driven, accrued today
  add column if not exists payroll_tax       numeric,  -- (hourly + salary) * 0.11
  add column if not exists rent_dollars      numeric,  -- RENT_PCT * sales_total
  add column if not exists amortized_dollars numeric,  -- monthly fixed amortized into 10am-4pm window
  add column if not exists mr_dollars        numeric,  -- maintenance & repairs entered today
  add column if not exists fixed_total       numeric,  -- rent + amortized + mr
  add column if not exists fixed_pct         numeric;  -- fixed_total / sales_total * 100

comment on column kpi_snapshots.labor_hourly      is 'Toast clock-in wages only (no salary, no payroll tax). Sum component of labor_total.';
comment on column kpi_snapshots.salary_total      is 'Schedule-driven salary accrued today. Computed from shift_settings.weekly_salary / week_window_hours * elapsed_today.';
comment on column kpi_snapshots.payroll_tax       is 'Estimated employer payroll tax (FICA + FUTA + DC SUTA = 11%) on (labor_hourly + salary_total).';
comment on column kpi_snapshots.rent_dollars      is 'RENT_PCT (10%) * sales_total. Variable rent component.';
comment on column kpi_snapshots.amortized_dollars is 'Monthly fixed line items (pest, dishwasher, insurance, utilities, bookkeeper, loan) amortized daily and dripped 10am-4pm ET.';
comment on column kpi_snapshots.mr_dollars        is 'Sum of maintenance_entries for today (ET).';
comment on column kpi_snapshots.fixed_total       is 'rent_dollars + amortized_dollars + mr_dollars.';
comment on column kpi_snapshots.fixed_pct         is 'fixed_total / sales_total * 100.';

-- ── maintenance_entries table ─────────────────────────────────────────
-- Mobile writes M&R log entries here so the server can include them in
-- the nightly snapshot + email. Replaces the localStorage-only store.
create table if not exists maintenance_entries (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references organizations(id) on delete cascade,
  entry_date  date not null default current_date,
  amount      numeric not null,
  description text,
  created_at  timestamptz default now(),
  created_by  text  -- author display name; may be null pre-auth
);

create index if not exists maintenance_entries_org_date_idx
  on maintenance_entries (org_id, entry_date desc);

alter table maintenance_entries enable row level security;

-- Single-tenant beta: anon can read/insert/delete. Replace once auth lands.
-- Matches the dev pattern used on invoices and reviews.
create policy "Anon read maintenance_entries (dev)"
  on maintenance_entries for select to anon using (true);

create policy "Anon insert maintenance_entries (dev)"
  on maintenance_entries for insert to anon with check (true);

create policy "Anon delete maintenance_entries (dev)"
  on maintenance_entries for delete to anon using (true);

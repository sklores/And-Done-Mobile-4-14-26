-- ============================================================
-- And Done — Phase 1: Initial Schema
-- Tables, RLS, Policies
-- ============================================================

-- ── organizations ────────────────────────────────────────────
create table organizations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  name text not null,
  slug text unique not null,
  business_type text,
  address text,
  city text,
  state text,
  zip_code text,
  phone text,
  website text,
  logo_url text,
  stripe_customer_id text,
  subscription_tier text default 'core',
  is_active boolean default true
);

-- ── users ────────────────────────────────────────────────────
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  org_id uuid references organizations(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'general_manager',
  is_active boolean default true,
  last_seen_at timestamptz
);

-- ── org_settings ─────────────────────────────────────────────
create table org_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid unique references organizations(id) on delete cascade,
  updated_at timestamptz default now(),
  sales_tax_pct numeric default 8.0,
  tip_pct numeric default 18.0,
  payroll_burden_pct numeric default 12.0,
  default_labor_pct numeric default 30.0,
  default_delivery_days text,
  delivery_minimum numeric default 0,
  cash_deposit_days text,
  tax_handling_enabled boolean default false,
  timezone text default 'America/New_York',
  date_format text default 'MM/DD/YYYY',
  currency text default 'USD',
  active_skin text default 'coastal'
);

-- ── kpi_benchmarks ───────────────────────────────────────────
create table kpi_benchmarks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  kpi_key text not null,
  excellent_threshold numeric,
  good_threshold numeric,
  watch_threshold numeric,
  caution_threshold numeric,
  alert_threshold numeric,
  bad_threshold numeric,
  critical_threshold numeric,
  flash_threshold numeric,
  is_lower_better boolean default true,
  unique(org_id, kpi_key)
);

-- ── kpi_snapshots ────────────────────────────────────────────
create table kpi_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  captured_at timestamptz default now(),
  sales_total numeric,
  sales_instore numeric,
  sales_takeout numeric,
  sales_delivery numeric,
  sales_third_party numeric,
  sales_tips numeric,
  check_average numeric,
  covers integer,
  labor_total numeric,
  labor_pct numeric,
  labor_foh numeric,
  labor_boh numeric,
  labor_management numeric,
  scheduled_hours numeric,
  worked_hours numeric,
  cogs_total numeric,
  cogs_pct numeric,
  cogs_food numeric,
  cogs_beverage numeric,
  cogs_alcohol numeric,
  prime_cost_pct numeric,
  expenses_total numeric,
  expenses_pct numeric,
  net_profit numeric,
  net_profit_pct numeric,
  data_source text default 'toast'
);

create index kpi_snapshots_org_time on kpi_snapshots(org_id, captured_at desc);

-- ── invoices ─────────────────────────────────────────────────
create table invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  vendor_name text not null,
  invoice_number text,
  invoice_date date,
  due_date date,
  category text,
  amount numeric not null,
  tax_amount numeric default 0,
  total_amount numeric not null,
  status text default 'pending',
  paid_at timestamptz,
  source text default 'manual',
  raw_image_url text,
  raw_ocr_text text,
  line_items jsonb default '[]'
);

create index invoices_org_date on invoices(org_id, invoice_date desc);
create index invoices_org_status on invoices(org_id, status);

-- ── vendors ──────────────────────────────────────────────────
create table vendors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  created_at timestamptz default now(),
  name text not null,
  category text,
  email text,
  phone text,
  address text,
  payment_terms text,
  account_number_last4 text,
  delivery_days text,
  delivery_minimum numeric,
  notes text,
  unique(org_id, name)
);

-- ── reviews ──────────────────────────────────────────────────
create table reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  fetched_at timestamptz default now(),
  platform text not null,
  external_id text,
  reviewer_name text,
  rating numeric,
  review_text text,
  review_date date,
  responded boolean default false,
  unique(platform, external_id)
);

create index reviews_org_platform on reviews(org_id, platform, review_date desc);

-- ── traffic_metrics ──────────────────────────────────────────
create table traffic_metrics (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  recorded_at timestamptz default now(),
  period text not null,
  platform text not null,
  views integer,
  wow_change_pct numeric
);

-- ── alert_preferences ────────────────────────────────────────
create table alert_preferences (
  id uuid primary key default gen_random_uuid(),
  org_id uuid unique references organizations(id) on delete cascade,
  sales_low_enabled boolean default true,
  sales_low_sensitivity text default 'medium',
  expenses_spike_enabled boolean default true,
  expenses_spike_sensitivity text default 'high',
  negative_review_enabled boolean default true,
  negative_review_sensitivity text default 'low',
  no_social_posts_enabled boolean default false,
  no_social_posts_sensitivity text default 'medium',
  negative_cashflow_enabled boolean default false,
  negative_cashflow_sensitivity text default 'medium'
);

-- ── email_report_preferences ─────────────────────────────────
create table email_report_preferences (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  report_type text not null,
  enabled boolean default false,
  frequency text,
  recipient_role text,
  custom_email text,
  unique(org_id, report_type)
);

-- ── documents ────────────────────────────────────────────────
create table documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  title text not null,
  category text,
  content text,
  file_url text,
  applicable_roles text[] default '{}',
  is_active boolean default true
);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table organizations enable row level security;
alter table users enable row level security;
alter table org_settings enable row level security;
alter table kpi_benchmarks enable row level security;
alter table kpi_snapshots enable row level security;
alter table invoices enable row level security;
alter table vendors enable row level security;
alter table reviews enable row level security;
alter table traffic_metrics enable row level security;
alter table alert_preferences enable row level security;
alter table email_report_preferences enable row level security;
alter table documents enable row level security;

-- ── Helper: current user's org_id (avoids recursive RLS) ─────
create or replace function my_org_id()
returns uuid language sql stable security definer as $$
  select org_id from users where id = auth.uid()
$$;

-- ── Helper: current user's role ──────────────────────────────
create or replace function my_role()
returns text language sql stable security definer as $$
  select role from users where id = auth.uid()
$$;

-- ── organizations ────────────────────────────────────────────
create policy "Users see own org"
  on organizations for select
  using (id = my_org_id());

-- ── users ────────────────────────────────────────────────────
create policy "Users see org members"
  on users for select
  using (org_id = my_org_id());

create policy "Owners manage users"
  on users for all
  using (org_id = my_org_id() and my_role() = 'owner');

-- ── org_settings ─────────────────────────────────────────────
create policy "All users read settings"
  on org_settings for select
  using (org_id = my_org_id());

create policy "Owners manage settings"
  on org_settings for all
  using (org_id = my_org_id() and my_role() = 'owner');

-- ── kpi_benchmarks ───────────────────────────────────────────
create policy "All users read benchmarks"
  on kpi_benchmarks for select
  using (org_id = my_org_id());

create policy "Owners manage benchmarks"
  on kpi_benchmarks for all
  using (org_id = my_org_id() and my_role() = 'owner');

-- ── kpi_snapshots ────────────────────────────────────────────
create policy "Users see own org snapshots"
  on kpi_snapshots for select
  using (org_id = my_org_id());

create policy "Service role inserts snapshots"
  on kpi_snapshots for insert
  with check (true);

-- ── invoices ─────────────────────────────────────────────────
create policy "Users see own org invoices"
  on invoices for select
  using (org_id = my_org_id());

create policy "Finance roles manage invoices"
  on invoices for all
  using (
    org_id = my_org_id()
    and my_role() in ('owner', 'bookkeeper', 'regional_manager')
  );

-- ── vendors ──────────────────────────────────────────────────
create policy "Users see own org vendors"
  on vendors for select
  using (org_id = my_org_id());

create policy "Finance roles manage vendors"
  on vendors for all
  using (
    org_id = my_org_id()
    and my_role() in ('owner', 'bookkeeper', 'regional_manager')
  );

-- ── reviews ──────────────────────────────────────────────────
create policy "Users see own org reviews"
  on reviews for select
  using (org_id = my_org_id());

-- ── traffic_metrics ──────────────────────────────────────────
create policy "Users see own org traffic"
  on traffic_metrics for select
  using (org_id = my_org_id());

-- ── alert_preferences ────────────────────────────────────────
create policy "All users read alert prefs"
  on alert_preferences for select
  using (org_id = my_org_id());

create policy "Owners manage alert prefs"
  on alert_preferences for all
  using (org_id = my_org_id() and my_role() = 'owner');

-- ── email_report_preferences ─────────────────────────────────
create policy "All users read report prefs"
  on email_report_preferences for select
  using (org_id = my_org_id());

create policy "Owners manage report prefs"
  on email_report_preferences for all
  using (org_id = my_org_id() and my_role() = 'owner');

-- ── documents ────────────────────────────────────────────────
create policy "Users see own org documents"
  on documents for select
  using (org_id = my_org_id());

create policy "Owners manage documents"
  on documents for all
  using (org_id = my_org_id() and my_role() = 'owner');

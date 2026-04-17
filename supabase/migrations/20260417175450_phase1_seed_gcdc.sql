-- ============================================================
-- And Done — GCDC Seed Data
-- ============================================================

-- ── Insert GCDC organization ─────────────────────────────────
insert into organizations (name, slug, business_type, address, city, state, zip_code, phone)
values (
  'GCDC Grilled Cheese Bar',
  'gcdc',
  'restaurant',
  '1730 Pennsylvania Ave NW',
  'Washington',
  'DC',
  '20006',
  '202-393-4232'
);

-- ── Default org settings ─────────────────────────────────────
insert into org_settings (org_id, timezone, payroll_burden_pct)
select id, 'America/New_York', 11.0
from organizations where slug = 'gcdc';

-- ── KPI benchmarks ───────────────────────────────────────────
insert into kpi_benchmarks (org_id, kpi_key, excellent_threshold, good_threshold, watch_threshold, caution_threshold, alert_threshold, bad_threshold, critical_threshold, is_lower_better)
select
  o.id,
  b.kpi_key,
  b.excellent_threshold,
  b.good_threshold,
  b.watch_threshold,
  b.caution_threshold,
  b.alert_threshold,
  b.bad_threshold,
  b.critical_threshold,
  b.is_lower_better
from organizations o
cross join (values
  ('cogs',       28, 30, 32, 35, 38, 42, 45, true),
  ('labor',      28, 30, 33, 36, 40, 45, 50, true),
  ('prime_cost', 55, 60, 65, 68, 72, 78, 85, true),
  ('expenses',   30, 35, 38, 42, 46, 50, 55, true),
  ('net',        15, 10,  7,  4,  1, -5,-10, false),
  ('reviews',   4.7,4.4,4.0, 3.7,3.4,3.0, 2.5, false),
  ('sales',    2500,2000,1500,1000,700,400,200, false)
) as b(kpi_key, excellent_threshold, good_threshold, watch_threshold, caution_threshold, alert_threshold, bad_threshold, critical_threshold, is_lower_better)
where o.slug = 'gcdc';

-- ── Default alert preferences ─────────────────────────────────
insert into alert_preferences (org_id)
select id from organizations where slug = 'gcdc';

-- ── Vendors ──────────────────────────────────────────────────
insert into vendors (org_id, name, category, payment_terms, delivery_days)
select
  o.id,
  v.name,
  v.category,
  v.payment_terms,
  v.delivery_days
from organizations o
cross join (values
  ('Sysco',                  'Food',     'Net 30', 'Tue / Fri'),
  ('Republic National',      'Alcohol',  'Net 30', 'Mon / Thu'),
  ('DC Central Kitchen',     'Food',     'Net 15', 'Mon / Wed / Fri'),
  ('Ecolab',                 'Supplies', 'Net 30', 'Mon'),
  ('Coastal Sunbelt Produce','Food',     'Net 30', 'Mon / Thu'),
  ('US Foods',               'Food',     'Net 30', 'Wed / Fri')
) as v(name, category, payment_terms, delivery_days)
where o.slug = 'gcdc';

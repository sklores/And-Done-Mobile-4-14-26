-- Single-tenant dev mode: let the mobile app read invoices without auth.
-- Safe because there's only one org on this project today. Remove once
-- we wire up real auth + org selection.

create policy "Anon read invoices (dev)"
  on invoices for select
  to anon
  using (true);

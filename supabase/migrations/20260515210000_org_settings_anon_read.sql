-- Single-tenant dev mode: let the mobile app read org_settings without
-- auth. Same dev pattern as invoices / reviews / maintenance_entries.
-- Remove when real auth + org selection lands.
--
-- Needed for the Sales drill-down Tracked Items watchlist on mobile,
-- which reads tracked_items_json from this table (desktop writes it).

create policy "Anon read org_settings (dev)"
  on org_settings for select
  to anon
  using (true);

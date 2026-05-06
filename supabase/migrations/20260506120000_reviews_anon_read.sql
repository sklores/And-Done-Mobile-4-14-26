-- Single-tenant dev mode: let the mobile app read reviews without auth.
-- Safe because there's only one org on this project today. Remove once
-- we wire up real auth + org selection.
--
-- Reviews are populated by the daily sync-reviews Edge Function which
-- pulls from Apify actors for Yelp, TripAdvisor, and UberEats.
-- (Google not yet wired as of 2026-05-05.)

create policy "Anon read reviews (dev)"
  on reviews for select
  to anon
  using (true);

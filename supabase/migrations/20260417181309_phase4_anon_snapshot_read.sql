-- Allow unauthenticated reads on kpi_snapshots.
-- Temporary until auth is wired up (Phase 5).
-- The anon key is already scoped to this Supabase project,
-- so this doesn't expose data to the public internet at large.
create policy "Anon can read snapshots"
  on kpi_snapshots for select
  to anon
  using (true);

-- Let the And Done mobile app (anon role) read shift_settings so it can
-- pull the weekly_salary pool for the Labor drilldown. Writes remain
-- restricted to authenticated / service_role.

DROP POLICY IF EXISTS "shift_settings anon read" ON public.shift_settings;
CREATE POLICY "shift_settings anon read"
  ON public.shift_settings
  FOR SELECT
  TO anon
  USING (true);

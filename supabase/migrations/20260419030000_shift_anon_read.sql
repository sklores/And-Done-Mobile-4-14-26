-- Let the And Done mobile app (anon role) read the schedule tables.
-- The schedule app's original policies were `TO authenticated USING (true)`;
-- And Done reads via the anon key, so it was getting empty result sets
-- silently. Single-tenant single-restaurant → no privacy concern in adding
-- anon read. Writes remain restricted to service_role / authenticated.

-- shift_employees
DROP POLICY IF EXISTS "shift_employees anon read" ON public.shift_employees;
CREATE POLICY "shift_employees anon read"
  ON public.shift_employees
  FOR SELECT
  TO anon
  USING (true);

-- shift_shifts
DROP POLICY IF EXISTS "shift_shifts anon read" ON public.shift_shifts;
CREATE POLICY "shift_shifts anon read"
  ON public.shift_shifts
  FOR SELECT
  TO anon
  USING (true);

-- shift_availability_blocks
DROP POLICY IF EXISTS "shift_availability_blocks anon read" ON public.shift_availability_blocks;
CREATE POLICY "shift_availability_blocks anon read"
  ON public.shift_availability_blocks
  FOR SELECT
  TO anon
  USING (true);

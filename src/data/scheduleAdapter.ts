// Reads scheduled-labor data from the shift scheduling tables
// (shift_shifts + shift_employees), which live on the same Supabase
// project as And Done. Read-only — never writes back to shift_* tables.

import { supabase, supabaseReady } from "../lib/supabase";

export type ScheduledLaborResult = {
  hours: number;            // total scheduled hours for the date
  cost: number;             // total scheduled cost ($) = Σ (hours × hourly_rate)
  employeeCount: number;    // distinct active employees scheduled
  fetchedAt: string;
};

/** "14:30:00" or "14:30" → 14.5 */
function timeToHours(t: string): number {
  const [h, m = "0", s = "0"] = t.split(":");
  return Number(h) + Number(m) / 60 + Number(s) / 3600;
}

/** Today's ET calendar date in YYYY-MM-DD — matches shift_date's storage. */
function todayET(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

export async function fetchTodayScheduled(): Promise<ScheduledLaborResult | null> {
  if (!supabaseReady) return null;

  const today = todayET();

  // Pull today's shifts with the joined employee info in a single query.
  // PostgREST syntax: foreign-table select via the FK relationship.
  const { data, error } = await supabase
    .from("shift_shifts")
    .select(`
      employee_id,
      start_time,
      end_time,
      shift_employees!inner ( id, is_active, hourly_rate )
    `)
    .eq("shift_date", today);

  if (error) {
    console.warn("[scheduleAdapter] fetchTodayScheduled error:", error.message);
    return null;
  }

  let hours = 0;
  let cost = 0;
  const seen = new Set<string>();

  for (const row of data ?? []) {
    // The embedded employee can come back as an array or single object
    // depending on PostgREST's relationship inference. Normalize.
    const empRaw = (row as { shift_employees: unknown }).shift_employees;
    const emp = Array.isArray(empRaw) ? empRaw[0] : empRaw;
    if (!emp) continue;

    const e = emp as { id: string; is_active: boolean; hourly_rate: number | string };
    if (!e.is_active) continue; // skip terminated employees

    const start = timeToHours(String(row.start_time));
    const end = timeToHours(String(row.end_time));
    const h = Math.max(0, end - start);
    const rate = Number(e.hourly_rate) || 0;

    hours += h;
    cost += h * rate;
    seen.add(e.id);
  }

  return {
    hours: Math.round(hours * 100) / 100,
    cost: Math.round(cost * 100) / 100,
    employeeCount: seen.size,
    fetchedAt: new Date().toISOString(),
  };
}

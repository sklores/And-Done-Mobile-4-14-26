// Reads scheduled-labor data from the shift scheduling tables
// (shift_shifts + shift_employees + shift_settings), which live on the
// same Supabase project as And Done. Read-only — never writes back.

import { supabase, supabaseReady } from "../lib/supabase";

export type ScheduledLaborResult = {
  // Today's schedule
  hours: number;                     // total scheduled hours today
  cost: number;                      // total scheduled hourly cost today
  employeeCount: number;

  // Today's operating window (earliest start → latest end)
  todayWindowStart: string | null;   // "HH:MM:SS" or null if no shifts today
  todayWindowEnd: string | null;
  todayWindowHours: number;

  // Weekly salary amortization
  weeklySalary: number;              // from shift_settings, 0 if unset
  weekWindowHours: number;           // Σ (max end − min start) across Mon–Sun
  salaryHourlyRate: number;          // weeklySalary / weekWindowHours
  salaryAccruedToday: number;        // live accrued salary right now
  salaryTodayCap: number;            // today's share of weekly salary (full window elapsed)

  fetchedAt: string;
};

/** "14:30:00" or "14:30" → 14.5 */
function timeToHours(t: string): number {
  const [h, m = "0", s = "0"] = t.split(":");
  return Number(h) + Number(m) / 60 + Number(s) / 3600;
}

/** Today's ET calendar date in YYYY-MM-DD. */
function todayET(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/** Current ET wall-clock hour as a decimal (e.g. 14.5 = 2:30pm ET). */
function nowETHours(): number {
  // "sv-SE" gives YYYY-MM-DD HH:MM:SS in 24h — perfect for parsing.
  const s = new Date().toLocaleString("sv-SE", { timeZone: "America/New_York" });
  const timePart = s.split(" ")[1] ?? "00:00:00";
  return timeToHours(timePart);
}

/** Add `days` to a YYYY-MM-DD string (date-only, no TZ math). */
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Monday (Mon–Sun week) containing `iso`. */
function mondayOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun
  const offsetToMon = (dow + 6) % 7;                       // Mon=0, Sun=6
  return addDays(iso, -offsetToMon);
}

export async function fetchTodayScheduled(): Promise<ScheduledLaborResult | null> {
  if (!supabaseReady) return null;

  const today = todayET();
  const monday = mondayOf(today);
  const sunday = addDays(monday, 6);

  // Pull the whole current week's shifts (need it for weekly window sum)
  // plus the joined employee for hourly-cost / active filter.
  const [{ data: shiftRows, error: shiftErr }, { data: settingRows, error: settingErr }] = await Promise.all([
    supabase
      .from("shift_shifts")
      .select(`
        shift_date,
        start_time,
        end_time,
        employee_id,
        shift_employees!inner ( id, is_active, hourly_rate )
      `)
      .gte("shift_date", monday)
      .lte("shift_date", sunday),
    supabase
      .from("shift_settings")
      .select("value")
      .eq("key", "weekly_salary")
      .maybeSingle(),
  ]);

  if (shiftErr) {
    console.warn("[scheduleAdapter] shifts query error:", shiftErr.message);
    return null;
  }
  if (settingErr) {
    // Not fatal — fall through with weeklySalary=0
    console.warn("[scheduleAdapter] settings query error:", settingErr.message);
  }

  const weeklySalary = Number(settingRows?.value ?? 0) || 0;

  // ── Today's scheduled totals + daily window map ──────────────────────
  let todayHours = 0;
  let todayCost = 0;
  const todayEmps = new Set<string>();

  // windows[date] = { start, end } — min start, max end across ALL shifts that day
  const windows = new Map<string, { start: number; end: number }>();

  for (const row of shiftRows ?? []) {
    const empRaw = (row as { shift_employees: unknown }).shift_employees;
    const emp = Array.isArray(empRaw) ? empRaw[0] : empRaw;
    if (!emp) continue;

    const e = emp as { id: string; is_active: boolean; hourly_rate: number | string };
    if (!e.is_active) continue;

    const startH = timeToHours(String(row.start_time));
    const endH   = timeToHours(String(row.end_time));
    const date   = String(row.shift_date);

    // Track day window (earliest start, latest end) for EVERY day of the week
    const w = windows.get(date);
    if (!w) windows.set(date, { start: startH, end: endH });
    else {
      if (startH < w.start) w.start = startH;
      if (endH   > w.end  ) w.end   = endH;
    }

    // Today-only scheduled totals
    if (date === today) {
      const dur = Math.max(0, endH - startH);
      const rate = Number(e.hourly_rate) || 0;
      todayHours += dur;
      todayCost  += dur * rate;
      todayEmps.add(e.id);
    }
  }

  // Sum window hours across Mon–Sun (divisor for salary amortization)
  let weekWindowHours = 0;
  for (const w of windows.values()) weekWindowHours += Math.max(0, w.end - w.start);

  // Today's operating window (may not exist if nothing scheduled today)
  const todayWin = windows.get(today) ?? null;
  const todayWindowStart = todayWin ? hoursToHMS(todayWin.start) : null;
  const todayWindowEnd   = todayWin ? hoursToHMS(todayWin.end)   : null;
  const todayWindowHours = todayWin ? Math.max(0, todayWin.end - todayWin.start) : 0;

  // Salary amortization
  const salaryHourlyRate = (weeklySalary > 0 && weekWindowHours > 0)
    ? weeklySalary / weekWindowHours
    : 0;

  let salaryAccruedToday = 0;
  if (salaryHourlyRate > 0 && todayWin) {
    const now = nowETHours();
    let elapsed: number;
    if      (now <= todayWin.start) elapsed = 0;
    else if (now >= todayWin.end)   elapsed = todayWindowHours;
    else                             elapsed = now - todayWin.start;
    salaryAccruedToday = elapsed * salaryHourlyRate;
  }

  const salaryTodayCap = todayWindowHours * salaryHourlyRate;

  return {
    hours:              round2(todayHours),
    cost:               round2(todayCost),
    employeeCount:      todayEmps.size,
    todayWindowStart,
    todayWindowEnd,
    todayWindowHours:   round2(todayWindowHours),
    weeklySalary:       round2(weeklySalary),
    weekWindowHours:    round2(weekWindowHours),
    salaryHourlyRate:   round2(salaryHourlyRate),
    salaryAccruedToday: round2(salaryAccruedToday),
    salaryTodayCap:     round2(salaryTodayCap),
    fetchedAt:          new Date().toISOString(),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function hoursToHMS(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  const ss = Math.round(((h - hh) * 60 - mm) * 60);
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}
function pad(n: number): string { return n < 10 ? `0${n}` : String(n); }

// Temporary debug endpoint — shows raw Toast labor data so we can diagnose
// why labor cost is wrong. DELETE after debugging.

import { credsFromEnv } from "./_toast.mjs";

const BASE = "https://ws-api.toasttab.com";
const AUTH_URL = "https://ws-api.toasttab.com/authentication/v1/authentication/login";

async function getToken(creds) {
  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      userAccessType: "TOAST_MACHINE_CLIENT",
    }),
  });
  if (!res.ok) throw new Error(`auth ${res.status}`);
  const data = await res.json();
  return data.token?.accessToken ?? data.accessToken;
}

export default async function handler(_req, res) {
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  try {
    const creds = credsFromEnv(process.env);
    const token = await getToken(creds);
    const authHeaders = {
      Authorization: `Bearer ${token}`,
      "Toast-Restaurant-External-ID": creds.guid,
    };

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

    // Fetch time entries + employees in parallel
    const [entriesRes, empRes] = await Promise.all([
      fetch(
        `${BASE}/labor/v1/timeEntries?startDate=${encodeURIComponent(startOfDay.toISOString())}&endDate=${encodeURIComponent(now.toISOString())}`,
        { headers: authHeaders }
      ),
      fetch(`${BASE}/labor/v1/employees`, { headers: authHeaders }),
    ]);

    const entries = entriesRes.ok ? await entriesRes.json() : `HTTP ${entriesRes.status}`;
    const employees = empRes.ok ? await empRes.json() : `HTTP ${empRes.status}`;

    // Summarise each time entry so it's readable
    const nowMs = Date.now();
    const entrySummary = Array.isArray(entries)
      ? entries.map((e) => ({
          employee: e.employeeReference?.guid,
          inDate: e.inDate,
          outDate: e.outDate ?? null,
          hourlyWage: e.hourlyWage ?? "MISSING",
          regularHours: e.regularHours ?? null,
          regularPay: e.regularPay ?? null,
          overtimePay: e.overtimePay ?? null,
          // derived
          isOpen: !e.outDate,
          openHoursSoFar: !e.outDate && e.inDate
            ? +((nowMs - new Date(e.inDate).getTime()) / 3_600_000).toFixed(2)
            : null,
        }))
      : entries;

    // Summarise employee wages
    const empWageSummary = Array.isArray(employees)
      ? employees.map((emp) => ({
          guid: emp.guid,
          firstName: emp.firstName,
          lastName: emp.lastName,
          hourlyWage: emp.hourlyWage ?? "MISSING",
          wageOverrides: emp.wageOverrides ?? "MISSING",
        }))
      : employees;

    res.statusCode = 200;
    res.end(
      JSON.stringify(
        {
          serverTime: now.toISOString(),
          startOfDay: startOfDay.toISOString(),
          entryCount: Array.isArray(entries) ? entries.length : "error",
          employeeCount: Array.isArray(employees) ? employees.length : "error",
          entries: entrySummary,
          employees: empWageSummary,
        },
        null,
        2
      )
    );
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
  }
}

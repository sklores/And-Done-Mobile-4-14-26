import { useKpiStore } from "../stores/useKpiStore";
import { DrillDownModal, DrillRow, DrillLoad } from "./DrillDownModal";
import { useSkin } from "../theme/skins";
import { money, money2 } from "../lib/money";

type Props = { open: boolean; onClose: () => void };

/** "18:00:00" → "6pm", "07:30:00" → "7:30am" */
function fmtTime(hms: string): string {
  const [hStr, mStr = "0"] = hms.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  const period = h >= 12 ? "pm" : "am";
  const h12 = ((h + 11) % 12) + 1;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, "0")}${period}`;
}

function SectionHeader({ title }: { title: string }) {
  const skin = useSkin();
  return (
    <div style={{
      padding: "10px 18px 4px", fontSize: 9, fontWeight: 700,
      letterSpacing: ".1em", textTransform: "uppercase",
      color: "#8A9C9C", fontFamily: skin.fonts.body,
      background: "#F2F7F6",
      borderTop: "1px solid rgba(0,0,0,0.05)",
      borderBottom: "1px solid rgba(0,0,0,0.05)",
    }}>
      {title}
    </div>
  );
}

export function LaborDrillDown({ open, onClose }: Props) {
  const laborTile  = useKpiStore((s) => s.tiles.find((t) => t.key === "labor"));
  const detail     = useKpiStore((s) => s.laborDetail);
  const schedule   = useKpiStore((s) => s.scheduleDetail);
  const period     = useKpiStore((s) => s.period);
  const meta       = useKpiStore((s) => s.meta);
  const snapStatus = useKpiStore((s) => s.status);
  const asOf       = useKpiStore((s) => s.asOf);
  const refresh    = useKpiStore((s) => s.refresh);
  const detailStatus = useKpiStore((s) => s.detailStatus);
  const word       = period === "day" ? "today" : period === "wtd" ? "this week" : "this month";

  if (!laborTile) return null;

  // The tax line's rate, from the numbers themselves -- not a "~11%" the app
  // asserts about a calculation the seed owns.
  const wages = detail ? detail.hourlyCost + detail.salaryCost : 0;
  const taxSub = detail && wages > 0
    ? `${((detail.payrollTax / wages) * 100).toFixed(1)}% of wages · employer FICA + FUTA + SUTA`
    : "employer FICA + FUTA + SUTA";

  return (
    <DrillDownModal
      open={open}
      onClose={onClose}
      score={laborTile.score}
      label="Labor"
      value={laborTile.value}
      status={laborTile.status}
      feed={{ status: snapStatus, asOf, daysExpected: meta?.daysExpected, daysMissing: meta?.daysMissing }}
    >
      {/* ── Efficiency ─────────────────────────────── */}
      <SectionHeader title="Efficiency" />
      <DrillRow
        label="Sales / Man Hour"
        value={detail?.salesPerManHour != null ? money2(detail.salesPerManHour) : "--"}
        sub="net sales ÷ hours worked"
      />
      <DrillRow
        label="Hours Worked"
        value={detail ? `${detail.hoursWorked.toFixed(1)} hrs` : "--"}
        sub={detail ? (period === "day" ? `${detail.openCount} on the clock now` : `${word} · ${detail.openCount} open shift${detail.openCount === 1 ? "" : "s"} estimated`) : undefined}
      />
      <DrillRow
        label="Tips"
        value={detail ? money2(detail.totalTips) : "--"}
        sub={detail?.tipPct != null ? `${detail.tipPct.toFixed(1)}% of net sales` : undefined}
      />

      {/* ── Cost breakdown ─────────────────────────── */}
      <SectionHeader title="Cost Breakdown" />
      <DrillRow
        label="Hourly Wages"
        value={detail ? money(detail.hourlyCost) : "--"}
        sub={detail?.openCount ? "accruing (open shifts)" : "clock-in wages · Toast"}
      />
      <DrillRow
        label="Salary"
        value={detail ? money(detail.salaryCost) : "--"}
        sub={schedule && schedule.weeklySalary > 0 && schedule.todayWindowStart && schedule.todayWindowEnd
          ? `of ${money(schedule.salaryTodayCap)} today · amortized ${fmtTime(schedule.todayWindowStart)}–${fmtTime(schedule.todayWindowEnd)}`
          : schedule && schedule.weeklySalary === 0
            ? "no weekly salary set in scheduler"
            : period === "day"
              ? "today's schedule isn't loaded"
              : "schedule is a Day-only reading"}
      />
      <DrillRow
        label="Est. Payroll Taxes"
        value={detail ? money(detail.payrollTax) : "--"}
        sub={taxSub}
      />

      {/* ── Scheduled (from the Shift app) -- Day only ── */}
      {period !== "day" && (
        <>
          <SectionHeader title="Scheduled" />
          <DrillRow label="Scheduled vs worked" value="Day only" sub={`switch to Day to compare ${word === "today" ? "" : "a day's "}schedule against the clock`} dimmed />
        </>
      )}
      {period === "day" && <>
      <SectionHeader title="Scheduled (Today)" />
      <DrillRow
        label="Scheduled Hours"
        value={schedule ? `${schedule.hours.toFixed(1)} hrs` : "--"}
        sub={schedule
          ? `${schedule.employeeCount} ${schedule.employeeCount === 1 ? "employee" : "employees"} on the schedule`
          : "today's schedule isn't loaded"}
      />
      <DrillRow
        label="Scheduled Labor Cost"
        value={schedule ? money(schedule.cost) : "--"}
        sub="hours × hourly rate · pre-tax"
      />
      {schedule && detail && schedule.hours > 0 && (() => {
        // Pace-based: compare hours worked against scheduled hours that
        // should have elapsed by NOW, not against the full day. Prevents
        // a 1-hour-into-the-day shift from looking like 5% of schedule.
        const expected = schedule.hoursScheduledSoFar;

        // Before the first shift has started — nothing to compare yet.
        if (expected <= 0.05) {
          return (
            <DrillRow
              label="Schedule Accuracy"
              value="--"
              sub={detail.hoursWorked > 0
                ? `${detail.hoursWorked.toFixed(1)} hrs worked · no shifts started yet`
                : "no shifts started yet"}
            />
          );
        }

        const pct      = (detail.hoursWorked / expected) * 100; // 100 = on pace, >100 = over, <100 = under
        const variance = detail.hoursWorked - expected;
        const direction = Math.abs(variance) < 0.1
          ? "on pace"
          : variance > 0
            ? `+${variance.toFixed(1)} hrs over pace`
            : `${variance.toFixed(1)} hrs under pace`;
        return (
          <DrillRow
            label="Schedule Accuracy"
            value={`${pct.toFixed(0)}%`}
            sub={`${detail.hoursWorked.toFixed(1)} worked / ${expected.toFixed(1)} expected so far · ${direction}`}
          />
        );
      })()}

      {/* ── Total ──────────────────────────────────── */}
      <SectionHeader title="Total" />
      <DrillRow
        label="Total Labor Cost"
        value={detail ? money(detail.laborCost) : "--"}
        sub={detail && detail.totalSales > 0
          ? `${((detail.laborCost / detail.totalSales) * 100).toFixed(1)}% of net sales`
          : detail ? "no net sales to divide by" : undefined}
      />
      <DrillRow
        label="Net Sales"
        value={detail ? money(detail.totalSales) : "--"}
        sub="pre-tax, pre-tip"
        dimmed
      />
      </>}

      <DrillLoad open={open} present={!!detail} status={detailStatus} subject="the labor breakdown" load={refresh} />
    </DrillDownModal>
  );
}

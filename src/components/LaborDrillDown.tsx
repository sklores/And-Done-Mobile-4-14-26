import { useKpiStore } from "../stores/useKpiStore";
import { DrillDownModal, DrillRow } from "./DrillDownModal";
import { coastal } from "../theme/skins";

type Props = { open: boolean; onClose: () => void };

function fmt$(n: number) { return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`; }
function fmtDec$(n: number) { return `$${n.toFixed(2)}`; }
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
  return (
    <div style={{
      padding: "10px 18px 4px", fontSize: 9, fontWeight: 700,
      letterSpacing: ".1em", textTransform: "uppercase",
      color: "#8A9C9C", fontFamily: coastal.fonts.manrope,
      background: "#F2F7F6",
      borderTop: "1px solid rgba(0,0,0,0.05)",
      borderBottom: "1px solid rgba(0,0,0,0.05)",
    }}>
      {title}
    </div>
  );
}

export function LaborDrillDown({ open, onClose }: Props) {
  const laborTile = useKpiStore((s) => s.tiles.find((t) => t.key === "labor"));
  const detail    = useKpiStore((s) => s.laborDetail);
  const schedule  = useKpiStore((s) => s.scheduleDetail);

  if (!laborTile) return null;

  return (
    <DrillDownModal
      open={open}
      onClose={onClose}
      score={laborTile.score}
      label="Labor"
      value={laborTile.value}
      status={laborTile.status}
    >
      {/* ── Efficiency ─────────────────────────────── */}
      <SectionHeader title="Efficiency" />
      <DrillRow
        label="Sales / Man Hour"
        value={detail?.salesPerManHour != null ? fmtDec$(detail.salesPerManHour) : "--"}
        sub="net sales ÷ hours worked"
      />
      <DrillRow
        label="Hours Worked"
        value={detail ? `${detail.hoursWorked.toFixed(1)} hrs` : "--"}
        sub={detail ? `${detail.openCount} active · ${detail.employeeCount} clocked in` : undefined}
      />
      <DrillRow
        label="Tips"
        value={detail ? fmtDec$(detail.totalTips) : "--"}
        sub={detail?.tipPct != null ? `${detail.tipPct.toFixed(1)}% of net sales` : undefined}
      />

      {/* ── Cost breakdown ─────────────────────────── */}
      <SectionHeader title="Cost Breakdown" />
      <DrillRow
        label="Hourly Wages"
        value={detail ? fmt$(detail.hourlyCost) : "--"}
        sub={detail?.openCount ? "accruing (open shifts)" : "clock-in wages · Toast"}
      />
      <DrillRow
        label="Salary"
        value={detail ? fmt$(detail.salaryCost) : "--"}
        sub={schedule && schedule.weeklySalary > 0 && schedule.todayWindowStart && schedule.todayWindowEnd
          ? `of ${fmt$(schedule.salaryTodayCap)} today · amortized ${fmtTime(schedule.todayWindowStart)}–${fmtTime(schedule.todayWindowEnd)}`
          : schedule && schedule.weeklySalary === 0
            ? "no weekly salary set in scheduler"
            : "no schedule today"}
      />
      <DrillRow
        label="Est. Payroll Taxes"
        value={detail ? fmt$(detail.payrollTax) : "--"}
        sub="employer FICA + FUTA + DC SUTA · ~11%"
      />

      {/* ── Scheduled (from shift scheduling app) ──── */}
      <SectionHeader title="Scheduled (Today)" />
      <DrillRow
        label="Scheduled Hours"
        value={schedule ? `${schedule.hours.toFixed(1)} hrs` : "--"}
        sub={schedule
          ? `${schedule.employeeCount} ${schedule.employeeCount === 1 ? "employee" : "employees"} on the schedule`
          : "no schedule data"}
      />
      <DrillRow
        label="Scheduled Labor Cost"
        value={schedule ? fmt$(schedule.cost) : "--"}
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
        value={detail ? fmt$(detail.laborCost) : "--"}
        sub={detail && detail.totalSales > 0
          ? `${((detail.laborCost / detail.totalSales) * 100).toFixed(1)}% of net sales`
          : undefined}
      />
      <DrillRow
        label="Net Sales"
        value={detail ? fmt$(detail.totalSales) : "--"}
        sub="pre-tax, pre-tip"
        dimmed
      />
    </DrillDownModal>
  );
}

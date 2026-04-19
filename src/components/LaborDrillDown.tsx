import { useKpiStore } from "../stores/useKpiStore";
import { DrillDownModal, DrillRow } from "./DrillDownModal";
import { coastal } from "../theme/skins";

type Props = { open: boolean; onClose: () => void };

function fmt$(n: number) { return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`; }
function fmtDec$(n: number) { return `$${n.toFixed(2)}`; }

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
        label="Elsie Zavala"
        value={detail ? fmt$(detail.salaryCost) : "$222"}
        sub="salary · $200/day prorated"
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
        const pct      = (detail.hoursWorked / schedule.hours) * 100; // 100 = exact, >100 = over, <100 = under
        const variance = detail.hoursWorked - schedule.hours;
        const direction = Math.abs(variance) < 0.1
          ? "on schedule"
          : variance > 0
            ? `+${variance.toFixed(1)} hrs over schedule`
            : `${variance.toFixed(1)} hrs under schedule`;
        return (
          <DrillRow
            label="Schedule Accuracy"
            value={`${pct.toFixed(0)}%`}
            sub={`${detail.hoursWorked.toFixed(1)} worked / ${schedule.hours.toFixed(1)} scheduled · ${direction}`}
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

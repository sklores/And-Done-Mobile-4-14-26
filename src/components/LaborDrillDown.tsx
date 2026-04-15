import { useKpiStore } from "../stores/useKpiStore";
import { DrillDownModal, DrillRow } from "./DrillDownModal";

type Props = { open: boolean; onClose: () => void };

function fmt$(n: number) { return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`; }
function fmtDec$(n: number) { return `$${n.toFixed(2)}`; }

export function LaborDrillDown({ open, onClose }: Props) {
  const laborTile = useKpiStore((s) => s.tiles.find((t) => t.key === "labor"));
  const detail    = useKpiStore((s) => s.laborDetail);

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
        label="Labor Cost"
        value={detail ? fmt$(detail.laborCost) : "--"}
        sub={detail?.openCount ? "accruing (open shifts)" : undefined}
      />
      <DrillRow
        label="Tips"
        value={detail ? fmtDec$(detail.totalTips) : "--"}
        sub={detail?.tipPct != null ? `${detail.tipPct.toFixed(1)}% of net sales` : undefined}
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

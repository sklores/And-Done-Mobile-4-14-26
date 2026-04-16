import { DrillDownModal, DrillRow } from "./DrillDownModal";
import { coastal, tileForScore } from "../theme/skins";
import { FEED_SCORES } from "../data/feedScores";

type Props = { open: boolean; onClose: () => void };

type Transaction = {
  merchant: string;
  category: string;
  amount: number;      // negative = debit, positive = credit
  score: number;       // 1–8 via tileForScore
  time: string;
  flag?: string;       // optional warning label
};

const TRANSACTIONS: Transaction[] = [
  { merchant: "Toast POS Deposit",    category: "Sales",     amount:  1295,  score: 8, time: "Today 2:14 PM" },
  { merchant: "US Foods Delivery",    category: "COGS",      amount:  -487,  score: 6, time: "Today 9:30 AM" },
  { merchant: "Toast Payroll",        category: "Labor",     amount:  -847,  score: 5, time: "Today 8:00 AM" },
  { merchant: "Pepco Electric",       category: "Utilities", amount:  -312,  score: 4, time: "Yesterday" },
  { merchant: "Unknown ACH Debit",    category: "Unknown",   amount:  -890,  score: 2, time: "Yesterday", flag: "Unrecognized" },
  { merchant: "DC Rental Payment",    category: "Rent",      amount: -3200,  score: 3, time: "Apr 1", flag: "Large" },
  { merchant: "Toast POS Deposit",    category: "Sales",     amount:  1842,  score: 8, time: "Apr 14" },
  { merchant: "Gordon Food Service",  category: "COGS",      amount:  -634,  score: 6, time: "Apr 13" },
];

const BALANCE = 14_280;

function SectionHeader({ title, right }: { title: string; right?: string }) {
  return (
    <div style={{
      padding: "10px 18px 4px", fontSize: 9, fontWeight: 700,
      letterSpacing: ".1em", textTransform: "uppercase",
      color: "#8A9C9C", fontFamily: coastal.fonts.manrope,
      background: "#F2F7F6",
      borderTop: "1px solid rgba(0,0,0,0.05)",
      borderBottom: "1px solid rgba(0,0,0,0.05)",
      display: "flex", justifyContent: "space-between", alignItems: "center",
    }}>
      <span>{title}</span>
      {right && <span style={{ opacity: 0.65 }}>{right}</span>}
    </div>
  );
}

export function BankDrillDown({ open, onClose }: Props) {
  return (
    <DrillDownModal
      open={open}
      onClose={onClose}
      score={FEED_SCORES.bank}
      label="Bank"
      value={`$${BALANCE.toLocaleString()}`}
      status="current balance · Chase Business"
    >
      <SectionHeader title="Recent Transactions" right="mock · connect Plaid" />
      {TRANSACTIONS.map((t, i) => {
        const palette = tileForScore(t.score);
        const isCredit = t.amount > 0;
        return (
          <div key={i} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "11px 18px",
            borderBottom: "1px solid rgba(0,0,0,0.06)",
          }}>
            {/* Score dot + details */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: palette.bg, flexShrink: 0,
                boxShadow: `0 0 0 2px ${palette.label}22`,
              }} />
              <div>
                <div style={{
                  fontFamily: coastal.fonts.manrope, fontSize: 12,
                  fontWeight: 600, color: "#1A2E28",
                }}>
                  {t.merchant}
                  {t.flag && (
                    <span style={{
                      marginLeft: 6, fontSize: 8, fontWeight: 700,
                      letterSpacing: ".06em", textTransform: "uppercase",
                      color: tileForScore(2).label,
                      background: tileForScore(2).bg,
                      padding: "1px 5px", borderRadius: 4,
                    }}>
                      {t.flag}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: "#8A9C9C", marginTop: 1, fontFamily: coastal.fonts.manrope }}>
                  {t.category} · {t.time}
                </div>
              </div>
            </div>
            {/* Amount */}
            <div style={{
              fontFamily: coastal.fonts.condensed, fontSize: 17, fontWeight: 700,
              color: isCredit ? tileForScore(8).value : "#1A2E28",
              whiteSpace: "nowrap",
            }}>
              {isCredit ? "+" : ""}${Math.abs(t.amount).toLocaleString()}
            </div>
          </div>
        );
      })}

      <DrillRow label="Connect real bank data" value="→" sub="Plaid integration · coming soon" dimmed />
    </DrillDownModal>
  );
}

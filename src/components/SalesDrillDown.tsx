import { useEffect, useState } from "react";
import { useKpiStore } from "../stores/useKpiStore";
import { DrillDownModal, DrillRow, DrillLoad } from "./DrillDownModal";
import { useSkin } from "../theme/skins";
import { scoreAgainstExpected } from "../config/salesTargetConfig";
import { fetchTrackedItems, TRACKED_ITEMS_AVAILABLE } from "../data/trackedItemsAdapter";
import { money, money2 } from "../lib/money";
import type { PmixItem, HourlySales } from "../data/toastAdapter";

type Props = { open: boolean; onClose: () => void };

/** Wall-clock for an ISO stamp, or null when there isn't one. */
function clock(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function SectionHeader({ title, right }: { title: string; right?: string }) {
  const skin = useSkin();
  return (
    <div
      style={{
        padding: "10px 18px 4px",
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: ".1em",
        textTransform: "uppercase",
        color: "#8A9C9C",
        fontFamily: skin.fonts.body,
        background: "#F2F7F6",
        borderTop: "1px solid rgba(0,0,0,0.05)",
        borderBottom: "1px solid rgba(0,0,0,0.05)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <span>{title}</span>
      {right && <span style={{ fontSize: 9, opacity: 0.65 }}>{right}</span>}
    </div>
  );
}

// ── Sales by Hour ───────────────────────────────────────────────────────────
function formatHour(h: number): string {
  const ampm = h < 12 ? "a" : "p";
  const hr12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hr12}${ampm}`;
}

function DayBarRow({ date, sales, peak, live, partial }: { date: string; sales: number; peak: number; live: boolean; partial: boolean }) {
  const skin = useSkin();
  const width = sales > 0 ? Math.max((sales / Math.max(peak, 1)) * 100, 4) : 0;
  const d = new Date(date + "T12:00:00Z");
  const label = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }) + " " + d.getUTCDate();
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "8px 18px", gap: 10, borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
      <div style={{ width: 44, fontFamily: skin.fonts.body, fontSize: 11, fontWeight: 700, color: "#8A9C9C", flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, height: 10, borderRadius: 5, background: "rgba(0,0,0,0.06)", overflow: "hidden" }}>
        <div style={{ width: `${width}%`, height: "100%", borderRadius: 5, background: live ? "#2F6B58" : partial ? "#C9A227" : "#4A7C6F", opacity: live ? 0.7 : 1 }} />
      </div>
      <div style={{ width: 64, textAlign: "right", fontFamily: skin.fonts.display, fontSize: 13, fontWeight: 700, color: "#2A3C48", flexShrink: 0 }}>
        {money(sales)}<span style={{ fontSize: 9, color: "#8A9C9C", marginLeft: 3 }}>{live ? "live" : partial ? "partial" : ""}</span>
      </div>
    </div>
  );
}

function HourBarRow({
  entry,
  peakSales,
  highlight,
}: {
  entry: HourlySales;
  peakSales: number;
  highlight: boolean;
}) {
  const skin = useSkin();
  // Bar width as a % of the peak hour; clamp to >=2% so zero-sales hours still
  // render a visible stub on the track.
  const pctOfPeak = peakSales > 0 ? (entry.sales / peakSales) * 100 : 0;
  const barWidth  = entry.sales > 0 ? Math.max(pctOfPeak, 4) : 0;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "8px 18px",
        gap: 10,
        borderBottom: "1px solid rgba(0,0,0,0.04)",
      }}
    >
      <div
        style={{
          width: 36,
          fontFamily: skin.fonts.body,
          fontSize: 11,
          fontWeight: 700,
          color: "#8A9C9C",
          letterSpacing: ".02em",
          flexShrink: 0,
        }}
      >
        {formatHour(entry.hour)}
      </div>
      <div
        style={{
          flex: 1,
          height: 18,
          background: "rgba(47,107,88,0.08)",
          borderRadius: 4,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${barWidth}%`,
            height: "100%",
            background: highlight ? "#2F6B58" : "rgba(47,107,88,0.55)",
            borderRadius: 4,
            transition: "width 0.4s ease",
          }}
        />
      </div>
      <div
        style={{
          width: 64,
          textAlign: "right",
          fontFamily: skin.fonts.display,
          fontSize: 13,
          fontWeight: 700,
          color: "#1A2E28",
          flexShrink: 0,
        }}
      >
        {entry.sales > 0 ? money(entry.sales) : "—"}
      </div>
    </div>
  );
}

function PmixRow({ item, rank, accent }: { item: PmixItem; rank: number; accent?: string }) {
  const skin = useSkin();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "11px 18px",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
        gap: 10,
      }}
    >
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: accent ?? "#D4E8E0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          fontWeight: 800,
          color: accent ? "#fff" : "#4A7C6F",
          fontFamily: skin.fonts.body,
          flexShrink: 0,
        }}
      >
        {rank}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: skin.fonts.body,
            fontSize: 12,
            fontWeight: 600,
            color: "#1A2E28",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {item.name}
        </div>
        <div style={{ fontSize: 10, color: "#8A9C9C", marginTop: 1 }}>
          {item.qty} sold
        </div>
      </div>
      <div
        style={{
          fontFamily: skin.fonts.display,
          fontSize: 16,
          fontWeight: 700,
          color: "#1A2E28",
          flexShrink: 0,
        }}
      >
        {money2(item.revenue)}
      </div>
    </div>
  );
}

export function SalesDrillDown({ open, onClose }: Props) {
  const skin = useSkin();
  const sales           = useKpiStore((s) => s.sales);
  const detail          = useKpiStore((s) => s.salesDetail);

  const meta            = useKpiStore((s) => s.meta);
  const snapStatus      = useKpiStore((s) => s.status);
  const asOf            = useKpiStore((s) => s.asOf);
  const refresh         = useKpiStore((s) => s.refresh);
  const detailStatus    = useKpiStore((s) => s.detailStatus);
  const period          = useKpiStore((s) => s.period);
  const word            = period === "day" ? "today" : period === "wtd" ? "this week" : "this month";
  const mixLabel        = detail?.pmixRange ? `${detail.pmixRange.days} closed day${detail.pmixRange.days === 1 ? "" : "s"}` : detail?.pmixDate ? `latest full day · ${detail.pmixDate.slice(5).replace("-", "/")}` : "";
  const salesScore = scoreAgainstExpected(sales.value, meta?.expectedToDate ?? null, snapStatus);

  // A headline of "$0" is a claim. Only print the number once a snapshot has
  // actually landed (a failed refresh keeps the last one, and the header's
  // own line says so).
  const haveNumbers = snapStatus === "ready" || (snapStatus === "error" && asOf != null);
  const salesDisplay = haveNumbers ? money(sales.value) : "--";

  // Tracked items watchlist — read from org_settings.tracked_items_json
  // (the same column desktop reads/writes from). v1 shows today's qty/rev
  // for each name by joining against today's pmix; WoW comparison would
  // need a new Toast analytics call (follow-up).
  const [tracked, setTracked] = useState<string[]>([]);
  const [trackedFailed, setTrackedFailed] = useState(false);
  const [trackedExpanded, setTrackedExpanded] = useState(false);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // A read that throws leaves `tracked` at [] -- which is why it has to be
    // caught and named: an empty watchlist and an unread one are not the same.
    fetchTrackedItems()
      .then((names) => { if (!cancelled) { setTracked(names); setTrackedFailed(false); } })
      .catch(() => { if (!cancelled) setTrackedFailed(true); });
    return () => { cancelled = true; };
  }, [open]);

  // Build a case-insensitive lookup from today's FULL pmix (every item,
  // not just top 5 + bottom 3) so middle-revenue tracked items can match.
  const pmixByName = new Map<string, PmixItem>();
  if (detail) {
    for (const item of detail.pmixAll ?? []) pmixByName.set(item.name.toLowerCase(), item);
    // Fallback for cases where pmixAll isn't present (older API responses)
    for (const item of detail.pmixTop ?? []) pmixByName.set(item.name.toLowerCase(), item);
    for (const item of detail.pmixBottom ?? []) pmixByName.set(item.name.toLowerCase(), item);
  }
  const trackedMatches = tracked.map((name) => ({
    name,
    match: pmixByName.get(name.toLowerCase()) ?? null,
  }));
  const soldCount = trackedMatches.filter((t) => t.match !== null).length;
  // Summary footer: combined revenue of the matched tracked items, and that
  // total as a share of headline sales (same denominator the operator sees as
  // "Sales" at the top of this sheet). Unmatched items contribute $0.
  const trackedTotal = trackedMatches.reduce((sum, t) => sum + (t.match?.revenue ?? 0), 0);
  const trackedPctOfSales = haveNumbers && sales.value > 0 ? (trackedTotal / sales.value) * 100 : null;

  // Derive total 3rd party
  const ch = detail?.channels;
  const thirdParty  = ch ? (ch.doordash + ch.ubereats + ch.grubhub + ch.other3p) : null;
  const totalCh     = ch ? (ch.dinein + ch.takeout + ch.doordash + ch.ubereats + ch.grubhub + ch.other3p) : 0;
  const channelsAt  = clock(detail?.fetchedAt);
  // The rows and the headline are two feeds on two timers -- the same tick
  // when they agree, one heartbeat apart when they don't. Percentages below
  // are of the channels' OWN subtotal, which is why the gap has to be said.
  const channelGap  = ch && haveNumbers ? sales.value - totalCh : null;

  /** Share of the channel subtotal (not of the headline). */
  function chPct(val: number) {
    if (!totalCh) return undefined;
    return `${((val / totalCh) * 100).toFixed(0)}% of channel total`;
  }

  return (
    <DrillDownModal
      open={open}
      onClose={onClose}
      score={salesScore}
      label="Sales"
      value={salesDisplay}
      status={detail ? `${detail.pmixAll?.length ?? 0} items · ${mixLabel || word}` : word}
      feed={{ status: snapStatus, asOf, daysExpected: meta?.daysExpected, daysMissing: meta?.daysMissing }}
    >
      {/* ── Channel Breakdown ─────────────────────────── */}
      <SectionHeader title="Sales by Channel" right={channelsAt ? `as of ${channelsAt}` : undefined} />

      <DrillRow
        label="Dine In"
        value={ch ? money(ch.dinein) : "--"}
        sub={ch ? chPct(ch.dinein) : undefined}
      />
      <DrillRow
        label="Takeout"
        value={ch ? money(ch.takeout) : "--"}
        sub={ch ? chPct(ch.takeout) : undefined}
      />
      <DrillRow
        label="3rd Party Total"
        value={thirdParty != null ? money(thirdParty) : "--"}
        sub={thirdParty != null ? chPct(thirdParty) : undefined}
      />
      {ch && ch.doordash > 0 && (
        <DrillRow label="  · DoorDash"  value={money(ch.doordash)} sub={chPct(ch.doordash)} dimmed />
      )}
      {ch && ch.ubereats > 0 && (
        <DrillRow label="  · Uber Eats" value={money(ch.ubereats)} sub={chPct(ch.ubereats)} dimmed />
      )}
      {ch && ch.grubhub > 0 && (
        <DrillRow label="  · Grubhub"   value={money(ch.grubhub)}  sub={chPct(ch.grubhub)} dimmed />
      )}
      {ch && ch.other3p > 0 && (
        <DrillRow label="  · Other"     value={money(ch.other3p)}  dimmed />
      )}
      {channelGap != null && Math.abs(channelGap) >= 1 && (
        <DrillRow
          label="Channel total"
          value={money(totalCh)}
          sub={`headline is ${money(sales.value)} — the two feeds are minutes apart`}
          dimmed
        />
      )}

      {/* ── Sales by Day (week / month) ───────────────── */}
      {detail && period !== "day" && detail.byDay && detail.byDay.length > 0 && (() => {
        const peak = Math.max(...detail.byDay.map((d) => d.sales));
        return (
          <>
            <SectionHeader title={`Sales by Day · ${word}`} />
            {detail.byDay.map((d) => (
              <DayBarRow key={d.date} date={d.date} sales={d.sales} peak={peak} live={d.live} partial={!d.complete && !d.live} />
            ))}
          </>
        );
      })()}

      {/* ── Sales by Hour (today) ─────────────────────── */}
      {detail && period === "day" && detail.byHour && detail.byHour.length > 0 && (() => {
        const peakSales = Math.max(...detail.byHour.map((e) => e.sales));
        return (
          <>
            <SectionHeader title="Sales by Hour (operating hours)" />
            {detail.byHour.map((e) => (
              <HourBarRow
                key={e.hour}
                entry={e}
                peakSales={peakSales}
                highlight={e.sales === peakSales && peakSales > 0}
              />
            ))}
          </>
        );
      })()}

      {/* ── Tracked Items watchlist (curated on desktop, collapsible) ─
          No V2 surface owns the list yet (TRACKED_ITEMS_AVAILABLE), so the
          empty array the adapter returns is "there is nowhere to read this
          from" -- named here, because rendering nothing reads as "the operator
          tracks nothing". A failed read is a third thing again. */}
      {!TRACKED_ITEMS_AVAILABLE ? (
        <SectionHeader title="Tracked Items" right="no watchlist source in V2 yet" />
      ) : trackedFailed ? (
        <SectionHeader title="Tracked Items" right="couldn't load the watchlist" />
      ) : tracked.length > 0 && (
        <>
          <div
            role="button"
            tabIndex={0}
            onClick={() => setTrackedExpanded((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setTrackedExpanded((v) => !v);
              }
            }}
            style={{
              padding: "10px 18px 4px",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: ".1em",
              textTransform: "uppercase",
              color: "#8A9C9C",
              fontFamily: skin.fonts.body,
              background: "#F2F7F6",
              borderTop: "1px solid rgba(0,0,0,0.05)",
              borderBottom: "1px solid rgba(0,0,0,0.05)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <span>Tracked Items · {soldCount}/{tracked.length} sold · {mixLabel || word}</span>
            <span
              aria-hidden
              style={{
                display: "inline-block",
                fontSize: 10,
                transform: trackedExpanded ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.18s ease",
              }}
            >
              ▸
            </span>
          </div>
          {trackedExpanded && trackedMatches.map(({ name, match }) => (
            <DrillRow
              key={name}
              label={name}
              value={match ? money(match.revenue) : "—"}
              sub={match ? `${match.qty} sold` : detail ? "not sold" : "no product mix loaded"}
              dimmed={!match}
            />
          ))}
          {/* Summary footer — combined tracked revenue + % of total sales,
              both on one line. Styled as a total (subtle bg + top rule). */}
          {trackedExpanded && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 18px",
                background: "#F2F7F6",
                borderTop: "1px solid rgba(0,0,0,0.10)",
                borderBottom: "1px solid rgba(0,0,0,0.06)",
              }}
            >
              <span
                style={{
                  fontFamily: skin.fonts.body,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: ".04em",
                  textTransform: "uppercase",
                  color: "#4A5A54",
                }}
              >
                Tracked Total
              </span>
              <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span
                  style={{
                    fontFamily: skin.fonts.body,
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#2F6B58",
                  }}
                >
                  {trackedPctOfSales != null ? `${trackedPctOfSales.toFixed(1)}% of sales` : "no sales to compare"}
                </span>
                <span
                  style={{
                    fontFamily: skin.fonts.display,
                    fontSize: 18,
                    fontWeight: 800,
                    color: "#1A2E28",
                  }}
                >
                  {money(trackedTotal)}
                </span>
              </span>
            </div>
          )}
        </>
      )}

      {/* ── Top Sellers ────────────────────────────────── */}
      {detail && detail.pmixTop.length > 0 && (
        <>
          <SectionHeader title="Top Sellers" />
          {detail.pmixTop.map((item, i) => (
            <PmixRow key={item.name} item={item} rank={i + 1} accent="#2F6B58" />
          ))}
        </>
      )}

      {/* ── Bottom Sellers ─────────────────────────────── */}
      {detail && detail.pmixBottom.length > 0 && (
        <>
          <SectionHeader title="Slow Movers" />
          {detail.pmixBottom.map((item, i) => (
            <PmixRow key={item.name} item={item} rank={i + 1} accent="#B94A4A" />
          ))}
        </>
      )}

      <DrillLoad open={open} present={!!detail} status={detailStatus} subject="the sales detail" load={refresh} />
    </DrillDownModal>
  );
}

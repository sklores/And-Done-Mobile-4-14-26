import { useEffect, useState } from "react";
import { coastal } from "./theme/skins";
import { useAppStore } from "./stores/useAppStore";
import { useKpiStore } from "./stores/useKpiStore";
import type { KpiKey } from "./stores/useKpiStore";
import { KpiBar } from "./components/KpiBar";
import { KpiGrid } from "./components/KpiGrid";
import { CoastalScene, type WeatherCondition } from "./components/CoastalScene";
import { MarqueeFeed, type FeedKey } from "./components/MarqueeFeed";
import { BottomTabs } from "./components/BottomTabs";
import type { TabKey } from "./components/BottomTabs";
import { LaborDrillDown } from "./components/LaborDrillDown";
import { SalesDrillDown } from "./components/SalesDrillDown";
import { PrimeCostDrillDown } from "./components/PrimeCostDrillDown";
import { FixedCostDrillDown } from "./components/FixedCostDrillDown";
import { NetDrillDown } from "./components/NetDrillDown";
import { COGSDrillDown } from "./components/COGSDrillDown";
import { ReviewsDrillDown } from "./components/ReviewsDrillDown";
import { SocialDrillDown } from "./components/SocialDrillDown";
import { BankDrillDown } from "./components/BankDrillDown";
import { EventsDrillDown } from "./components/EventsDrillDown";
import { InvoicesTab } from "./components/tabs/InvoicesTab";
import { LogTab } from "./components/tabs/LogTab";
import { GizmoTab } from "./components/tabs/GizmoTab";

type WeatherData = { condition: WeatherCondition; tempF: number | null };

async function fetchWeather(): Promise<WeatherData> {
  try {
    const res = await fetch("/api/weather", { cache: "no-store" });
    if (!res.ok) return { condition: "clear", tempF: null };
    const data = await res.json();
    return {
      condition: (data.condition as WeatherCondition) ?? "clear",
      tempF: typeof data.tempF === "number" ? Math.round(data.tempF) : null,
    };
  } catch {
    return { condition: "clear", tempF: null };
  }
}

export default function App() {
  const businessName = useAppStore((s) => s.businessName);
  const sales        = useKpiStore((s) => s.sales);
  const net          = useKpiStore((s) => s.net);
  const tiles        = useKpiStore((s) => s.tiles);
  const refresh      = useKpiStore((s) => s.refresh);

  const [openTab, setOpenTab]     = useState<TabKey | null>(null);
  const [weatherData, setWeatherData] = useState<WeatherData>({ condition: "clear", tempF: null });
  const [drillKey, setDrillKey]   = useState<KpiKey | null>(null);
  const [openFeed, setOpenFeed]   = useState<FeedKey | null>(null);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    fetchWeather().then(setWeatherData);
    const id = setInterval(() => fetchWeather().then(setWeatherData), 30 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const salesDisplay = `$${sales.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  // ── Color-grading scores for the headline bars ────────────────────────
  // Sales benchmark: $500 (weak) → $2,500 (excellent)
  // Net profit benchmark: -5% (loss) → +15% (excellent)
  const scoreFromRange = (v: number, min: number, max: number) => {
    if (!Number.isFinite(v)) return 5;
    if (v <= min) return 1;
    if (v >= max) return 8;
    return Math.round(1 + ((v - min) / (max - min)) * 7);
  };
  const salesScore = scoreFromRange(sales.value, 500, 2500);
  const netPctNum  = typeof net.value === "string" ? parseFloat(net.value) : NaN;
  const netScore   = scoreFromRange(netPctNum, -5, 15);

  return (
    <div
      style={{
        height: "100dvh",
        overflow: "hidden",
        background: coastal.phoneBg,
        fontFamily: coastal.fonts.manrope,
      }}
    >
      <div
        className="mobile-app"
        style={{
          width: "100%",
          maxWidth: 480,
          margin: "0 auto",
          height: "100%",
          background: coastal.phoneBg,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Scrollable content — fills all space above the pinned tab bar */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          overscrollBehavior: "none",
          display: "flex",
          flexDirection: "column",
          background: coastal.tabs.bg,
        }}>

        {/* Framed painting with nameplate along the bottom of the frame */}
        <div
          style={{
            margin: "8px 12px 0",
            border: "3px solid #B4B8BC",
            borderRadius: 8,
            boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
            overflow: "hidden",
            background: "#B4B8BC",
            flexShrink: 0,
          }}
        >
          <CoastalScene weather={weatherData.condition} />
          <div
            style={{
              background: "#B4B8BC",
              color: "#1F2124",
              fontSize: 12,
              fontWeight: 700,
              padding: "7px 12px",
              display: "flex",
              justifyContent: "space-between",
              letterSpacing: ".06em",
              borderTop: "1px solid #9EA2A4",
            }}
          >
            <span>{businessName}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ opacity: 0.9 }}>
                {weatherData.condition === "clear"  && "☀️"}
                {weatherData.condition === "cloudy" && "⛅"}
                {weatherData.condition === "rain"   && "🌧️"}
                {weatherData.condition === "snow"   && "❄️"}
                {weatherData.condition === "wind"   && "💨"}
                {weatherData.tempF != null && ` ${weatherData.tempF}°`}
              </span>
              <span>
                {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </span>
          </div>
        </div>
        <KpiBar
          kind="sales"
          label={sales.label}
          value={salesDisplay}
          sub={sales.sub}
          score={salesScore}
          onClick={() => setDrillKey("sales" as KpiKey)}
        />
        <KpiGrid tiles={tiles} onTileClick={setDrillKey} />
        <KpiBar
          kind="net"
          label={net.label}
          value={net.value}
          valueSub={net.dollars !== 0 ? `$${net.dollars.toLocaleString()}` : undefined}
          sub="today"
          score={netScore}
          isLast
          onClick={() => setDrillKey("net" as KpiKey)}
        />
        <MarqueeFeed onLongPress={setOpenFeed} />
        <div style={{ flex: 1, background: coastal.tabs.bg }} />

        </div>{/* end scroll container */}
        <BottomTabs onOpen={setOpenTab} />
      </div>

      {/* ── KPI drill-down modals ───────────────────── */}
      <SalesDrillDown     open={drillKey === "sales"} onClose={() => setDrillKey(null)} />
      <LaborDrillDown     open={drillKey === "labor"} onClose={() => setDrillKey(null)} />
      <PrimeCostDrillDown open={drillKey === "prime"} onClose={() => setDrillKey(null)} />
      <FixedCostDrillDown open={drillKey === "fixed"} onClose={() => setDrillKey(null)} />
      <NetDrillDown       open={drillKey === "net"}   onClose={() => setDrillKey(null)} />
      <COGSDrillDown      open={drillKey === "cogs"}  onClose={() => setDrillKey(null)} />

      {/* ── Feed chip drill-downs (long-press) ──────── */}
      <ReviewsDrillDown open={openFeed === "reviews"} onClose={() => setOpenFeed(null)} />
      <SocialDrillDown  open={openFeed === "social"}  onClose={() => setOpenFeed(null)} />
      <BankDrillDown    open={openFeed === "bank"}    onClose={() => setOpenFeed(null)} />
      <EventsDrillDown  open={openFeed === "events"}  onClose={() => setOpenFeed(null)} />

      {/* ── Bottom tab panels ───────────────────────── */}
      <InvoicesTab open={openTab === "invoices"} onClose={() => setOpenTab(null)} />
      <LogTab      open={openTab === "log"}      onClose={() => setOpenTab(null)} />
      <GizmoTab    open={openTab === "gizmo"}    onClose={() => setOpenTab(null)} />
    </div>
  );
}

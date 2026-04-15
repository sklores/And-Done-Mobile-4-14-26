import { useEffect, useState } from "react";
import { coastal } from "./theme/skins";
import { useAppStore } from "./stores/useAppStore";
import { useKpiStore } from "./stores/useKpiStore";
import type { KpiKey } from "./stores/useKpiStore";
import { KpiBar } from "./components/KpiBar";
import { KpiGrid } from "./components/KpiGrid";
import { CoastalScene, type WeatherCondition } from "./components/CoastalScene";
import { MarqueeFeed } from "./components/MarqueeFeed";
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

  const [openTab, setOpenTab]   = useState<TabKey | null>(null);
  const [weatherData, setWeatherData] = useState<WeatherData>({ condition: "clear", tempF: null });
  const [drillKey, setDrillKey] = useState<KpiKey | null>(null);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 600);

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

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 600);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const salesDisplay = `$${sales.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  return (
    <div
      style={isMobile ? {
        height: "100dvh",
        overflow: "hidden",
        background: coastal.phoneBg,
        fontFamily: coastal.fonts.manrope,
      } : {
        minHeight: "100vh",
        background: coastal.pageBg,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        padding: "20px 0",
        fontFamily: coastal.fonts.manrope,
      }}
    >
      <div
        className={isMobile ? "mobile-app" : undefined}
        style={isMobile ? {
          width: "100%",
          height: "100%",
          background: coastal.phoneBg,
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          overscrollBehavior: "none",
        } : {
          width: 375,
          maxWidth: "100%",
          background: coastal.phoneBg,
          borderRadius: coastal.phoneRadius,
          border: `1.5px solid ${coastal.phoneBorder}`,
          boxShadow: coastal.phoneShadow,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Status bar */}
        <div
          style={{
            background: coastal.statusBarBg,
            color: "#fff",
            fontSize: isMobile ? 13 : 10,
            fontWeight: 700,
            padding: isMobile ? "10px 18px" : "6px 14px",
            display: "flex",
            justifyContent: "space-between",
            letterSpacing: ".06em",
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

        <CoastalScene weather={weatherData.condition} />
        <KpiBar kind="sales" label={sales.label} value={salesDisplay} sub={sales.sub} onClick={() => setDrillKey("sales" as KpiKey)} />
        <KpiGrid tiles={tiles} onTileClick={setDrillKey} />
        <KpiBar
          kind="net"
          label={net.label}
          value={net.value}
          valueSub={net.dollars !== 0 ? `$${net.dollars.toLocaleString()}` : undefined}
          sub="today"
          onClick={() => setDrillKey("net" as KpiKey)}
        />
        <MarqueeFeed />
        <BottomTabs onOpen={setOpenTab} />
      </div>

      {/* ── KPI drill-down modals ───────────────────── */}
      <SalesDrillDown      open={drillKey === "sales"}   onClose={() => setDrillKey(null)} />
      <LaborDrillDown      open={drillKey === "labor"}   onClose={() => setDrillKey(null)} />
      <PrimeCostDrillDown  open={drillKey === "prime"}   onClose={() => setDrillKey(null)} />
      <FixedCostDrillDown  open={drillKey === "fixed"}   onClose={() => setDrillKey(null)} />
      <NetDrillDown        open={drillKey === "net"}     onClose={() => setDrillKey(null)} />
      <COGSDrillDown       open={drillKey === "cogs"}    onClose={() => setDrillKey(null)} />
      <ReviewsDrillDown    open={drillKey === "reviews"} onClose={() => setDrillKey(null)} />
      <SocialDrillDown     open={drillKey === "social"}  onClose={() => setDrillKey(null)} />

      {/* ── Bottom tab panels ───────────────────────── */}
      <InvoicesTab open={openTab === "invoices"} onClose={() => setOpenTab(null)} />
      <LogTab      open={openTab === "log"}      onClose={() => setOpenTab(null)} />
      <GizmoTab    open={openTab === "gizmo"}    onClose={() => setOpenTab(null)} />
    </div>
  );
}

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
import { LaborDrillDown } from "./components/LaborDrillDown";
import { SalesDrillDown } from "./components/SalesDrillDown";
import { PrimeCostDrillDown } from "./components/PrimeCostDrillDown";

type TabKey = "dashboard" | "invoices" | "log" | "gizmo";

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

  const [tab, setTab]         = useState<TabKey>("dashboard");
  const [weatherData, setWeatherData] = useState<WeatherData>({ condition: "clear", tempF: null });
  const [drillKey, setDrillKey] = useState<KpiKey | null>(null);

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

  return (
    <div
      style={{
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
        style={{
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
        <div
          style={{
            background: coastal.statusBarBg,
            color: "#fff",
            fontSize: 10,
            fontWeight: 700,
            padding: "6px 14px",
            display: "flex",
            justifyContent: "space-between",
            letterSpacing: ".08em",
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
        <KpiBar kind="net" label={net.label} value={net.value} sub={net.sub} />
        <MarqueeFeed />
        <BottomTabs active={tab} onChange={setTab} />
      </div>

      {/* Drill-down modals */}
      <SalesDrillDown
        open={drillKey === "sales"}
        onClose={() => setDrillKey(null)}
      />
      <LaborDrillDown
        open={drillKey === "labor"}
        onClose={() => setDrillKey(null)}
      />
      <PrimeCostDrillDown
        open={drillKey === "prime"}
        onClose={() => setDrillKey(null)}
      />
    </div>
  );
}

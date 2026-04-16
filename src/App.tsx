import { useEffect, useRef, useState } from "react";
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

const PULL_THRESHOLD = 70; // px needed to trigger refresh

export default function App() {
  const businessName = useAppStore((s) => s.businessName);
  const sales        = useKpiStore((s) => s.sales);
  const net          = useKpiStore((s) => s.net);
  const tiles        = useKpiStore((s) => s.tiles);
  const refresh      = useKpiStore((s) => s.refresh);

  const [openTab, setOpenTab]       = useState<TabKey | null>(null);
  const [weatherData, setWeatherData] = useState<WeatherData>({ condition: "clear", tempF: null });
  const [drillKey, setDrillKey]     = useState<KpiKey | null>(null);
  const [openFeed, setOpenFeed]     = useState<FeedKey | null>(null);

  // ── Pull-to-refresh state ─────────────────────────────────────────────────
  const scrollRef      = useRef<HTMLDivElement>(null);
  const touchStartY    = useRef(0);
  const [pullY, setPullY]           = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ── Back-button: push history entry when any modal opens ─────────────────
  const anyOpen = drillKey !== null || openTab !== null || openFeed !== null;
  const prevAnyOpen = useRef(false);

  useEffect(() => {
    if (anyOpen && !prevAnyOpen.current) {
      history.pushState({ modal: true }, "");
    }
    prevAnyOpen.current = anyOpen;
  }, [anyOpen]);

  useEffect(() => {
    const handlePopState = () => {
      // Close whichever modal is open — back stays on page
      if (drillKey !== null) { setDrillKey(null); return; }
      if (openTab  !== null) { setOpenTab(null);  return; }
      if (openFeed !== null) { setOpenFeed(null); return; }
      // Nothing open — re-push so the page is never popped away
      history.pushState({ modal: false }, "");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [drillKey, openTab, openFeed]);

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

  // ── Pull-to-refresh handlers ──────────────────────────────────────────────
  const handleTouchStart = (e: React.TouchEvent) => {
    if (scrollRef.current && scrollRef.current.scrollTop === 0) {
      touchStartY.current = e.touches[0].clientY;
    } else {
      touchStartY.current = 0;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartY.current || isRefreshing) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    if (delta > 0) {
      // Dampen pull so it feels springy
      setPullY(Math.min(delta * 0.45, PULL_THRESHOLD));
    }
  };

  const handleTouchEnd = async () => {
    if (pullY >= PULL_THRESHOLD && !isRefreshing) {
      setIsRefreshing(true);
      setPullY(0);
      await Promise.all([
        refresh(),
        fetchWeather().then(setWeatherData),
        new Promise((r) => setTimeout(r, 600)), // minimum spinner time
      ]);
      setIsRefreshing(false);
    } else {
      setPullY(0);
    }
    touchStartY.current = 0;
  };

  const salesDisplay = `$${sales.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  // ── Color-grading scores for the headline bars ────────────────────────────
  const scoreFromRange = (v: number, min: number, max: number) => {
    if (!Number.isFinite(v)) return 5;
    if (v <= min) return 1;
    if (v >= max) return 8;
    return Math.round(1 + ((v - min) / (max - min)) * 7);
  };
  const salesScore = scoreFromRange(sales.value, 500, 2500);
  const netPctNum  = typeof net.value === "string" ? parseFloat(net.value) : NaN;
  const netScore   = scoreFromRange(netPctNum, -5, 15);

  // Pull indicator progress 0→1
  const pullProgress = Math.min(pullY / PULL_THRESHOLD, 1);

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: coastal.pageBg,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        fontFamily: coastal.fonts.manrope,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          minHeight: "100dvh",
          background: coastal.phoneBg,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Pull-to-refresh indicator */}
        <div style={{
          height: isRefreshing ? 36 : pullY,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: pullY === 0 ? "height 0.25s ease" : "none",
          background: coastal.phoneBg,
          flexShrink: 0,
        }}>
          {(pullY > 10 || isRefreshing) && (
            <div style={{
              width: 22, height: 22,
              borderRadius: "50%",
              border: `2.5px solid rgba(255,255,255,0.25)`,
              borderTopColor: "#fff",
              opacity: isRefreshing ? 1 : pullProgress,
              animation: isRefreshing ? "ptr-spin 0.7s linear infinite" : "none",
              transform: isRefreshing ? undefined : `rotate(${pullProgress * 270}deg)`,
            }} />
          )}
        </div>

        {/* Scrollable content */}
        <div
          ref={scrollRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            flex: 1,
            overflowY: "auto",
            overscrollBehavior: "none",
            display: "flex",
            flexDirection: "column",
            background: coastal.phoneBg,
          }}
        >
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
        </div>

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

      <style>{`
        @keyframes ptr-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

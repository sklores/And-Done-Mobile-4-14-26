import { useEffect, useMemo, useRef, useState } from "react";
import { coastal } from "./theme/skins";
import { ALERT_THRESHOLDS } from "./config/alertThresholds";
import { useAppStore } from "./stores/useAppStore";
import { useKpiStore } from "./stores/useKpiStore";
import { useLogStore } from "./stores/useLogStore";
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
import { useIsDusky, useIsNight } from "./hooks/useTimeOfDay";

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
  const businessName          = useAppStore((s) => s.businessName);
  const sales                 = useKpiStore((s) => s.sales);
  const net                   = useKpiStore((s) => s.net);
  const tiles                 = useKpiStore((s) => s.tiles);
  const refresh               = useKpiStore((s) => s.refresh);
  const subscribeToSnapshots  = useKpiStore((s) => s.subscribeToSnapshots);
  const hydrateLog            = useLogStore((s) => s.hydrate);

  const [openTab, setOpenTab]       = useState<TabKey | null>(null);
  const [weatherData, setWeatherData] = useState<WeatherData>({ condition: "clear", tempF: null });
  const [drillKey, setDrillKey]     = useState<KpiKey | null>(null);
  const [openFeed, setOpenFeed]     = useState<FeedKey | null>(null);

  // ── Pull-to-refresh state ─────────────────────────────────────────────────
  const scrollRef      = useRef<HTMLDivElement>(null);
  const touchStartY    = useRef(0);
  const [pullY, setPullY]           = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Bump to retrigger the lighthouse sweep (mount, KPI refresh, pull-to-refresh)
  const [beamPulseKey, setBeamPulseKey] = useState(0);

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

  // ── Supabase real-time subscription (primary data source) ────────────────
  useEffect(() => {
    const unsubscribe = subscribeToSnapshots();
    return unsubscribe;
  }, [subscribeToSnapshots]);

  // ── Activity log: load from Supabase + subscribe for realtime inserts ────
  useEffect(() => {
    hydrateLog();
  }, [hydrateLog]);

  // ── Toast direct poll (fallback + sales/labor detail) ─────────────────────
  useEffect(() => {
    const doRefresh = () => {
      refresh();
      setBeamPulseKey((k) => k + 1);
    };
    doRefresh();
    const id = setInterval(doRefresh, 5 * 60 * 1000);
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
      setBeamPulseKey((k) => k + 1);
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

  // ── Crisis-level pulse alerts ─────────────────────────────────────────────
  const alertingKeys = useMemo(() => {
    const keys = new Set<string>();
    const T = ALERT_THRESHOLDS;
    if (sales.value < T.sales.below) keys.add("sales");
    if (netPctNum   < T.net.below)   keys.add("net");
    tiles.forEach((t) => {
      const v = parseFloat(t.value);
      if (!Number.isFinite(v)) return;
      if (t.key === "cogs"  && v > T.cogs.above)  keys.add("cogs");
      if (t.key === "labor" && v > T.labor.above)  keys.add("labor");
      if (t.key === "prime" && v > T.prime.above)  keys.add("prime");
      if (t.key === "fixed" && v > T.fixed.above)  keys.add("fixed");
    });
    return keys;
  }, [sales.value, netPctNum, tiles]);

  // Pull indicator progress 0→1
  const pullProgress = Math.min(pullY / PULL_THRESHOLD, 1);

  // ── Nocturnal UI (option B + mild C) ─────────────────────────────────────
  // After sundown: darken the page/phone bg and apply a gentle brightness +
  // saturation filter to all the UI chrome below the scene card so the
  // pastel KPI tiles stop yelling when the scene has gone dark.
  const isNight = useIsNight();
  const isDusky = useIsDusky();
  const pageBg  = isDusky ? "#1E1A17" : coastal.pageBg;
  const phoneBg = isNight ? "#1E1A17" : isDusky ? "#2A2320" : coastal.phoneBg;
  // Filter strength — sundown gets a modest dim, full night goes hard so the
  // pastel tiles stop yelling against the dark scene.
  const chromeFilter = isNight
    ? "brightness(0.48) saturate(0.55)"
    : isDusky
      ? "brightness(0.72) saturate(0.78)"
      : undefined;
  // Nameplate row (under the scene image) bleeds into the water at night
  // so there's no visible "footer strip" between the scene and the KPI
  // chrome. Matches WATER[night][1] (#10243A) from CoastalScene — the
  // mid-band water color — so the seam disappears into the ocean.
  const namePlateBg = isDusky ? "#10243A" : "#C4B090";
  // Scene frame + bottom-tab bar share one dark color at night so the
  // chrome reads as a single frame; the nameplate no longer matches.
  // the day and swap to a dark walnut after sundown so they stop glowing.
  const frameColor     = isDusky ? "#1A2438" : "#C4B090";
  const frameSeamColor = isDusky ? "#101828" : "#A89070";
  const namePlateText  = isDusky ? "#D8E0F0" : "#3A2A10";

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: pageBg,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        fontFamily: coastal.fonts.manrope,
        transition: "background 1.2s ease",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          minHeight: "100dvh",
          background: phoneBg,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          transition: "background 1.2s ease",
        }}
      >
        {/* Scrollable content */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>

          {/* Pull-to-refresh indicator — overlays content, never moves it */}
          {(pullY > 10 || isRefreshing) && (
            <div style={{
              position: "absolute",
              top: isRefreshing ? 10 : pullY - 32,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 10,
              width: 28, height: 28,
              borderRadius: "50%",
              border: "2.5px solid rgba(255,255,255,0.25)",
              borderTopColor: "#fff",
              opacity: isRefreshing ? 1 : pullProgress,
              animation: isRefreshing ? "ptr-spin 0.7s linear infinite" : "none",
              rotate: isRefreshing ? undefined : `${pullProgress * 270}deg`,
              transition: pullY === 0 ? "top 0.25s ease, opacity 0.25s ease" : "none",
            }} />
          )}

        <div
          ref={scrollRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            height: "100%",
            overflowY: "auto",
            overscrollBehavior: "none",
            display: "flex",
            flexDirection: "column",
            background: phoneBg,
            transition: "background 1.2s ease",
          }}
        >
          {/* Framed painting with nameplate along the bottom of the frame */}
          {/* DIAGNOSTIC: at night, parent wrapper forced transparent + no
              shadow so the nameplate row is the only thing that can draw
              a dark strip below the scene. */}
          <div
            style={{
              margin: "8px 12px 0",
              borderTop: `6px solid ${frameColor}`,
              borderLeft: `6px solid ${frameColor}`,
              borderRight: `6px solid ${frameColor}`,
              borderBottom: isDusky ? "none" : `3px solid ${frameColor}`,
              borderRadius: 8,
              boxShadow: isDusky ? "none" : "0 4px 16px rgba(0,0,0,0.15)",
              overflow: "hidden",
              background: isDusky ? "transparent" : frameColor,
              flexShrink: 0,
            }}
          >
            <CoastalScene weather={weatherData.condition} beamPulseKey={beamPulseKey} />
            <div
              style={isDusky ? {
                // Hot-pink diagnostic confirmed this is the nameplate row.
                // Now painted ocean blue (sampled from the live scene) and
                // all layering props hard-forced so no wrapper / overlay /
                // pseudo can leak a different dark over it.
                background: "#132437",
                backgroundColor: "#132437",
                backgroundImage: "none",
                color: namePlateText,
                fontSize: 12,
                fontWeight: 700,
                padding: "7px 12px",
                display: "flex",
                justifyContent: "space-between",
                letterSpacing: ".06em",
                borderTop: "none",
                borderBottom: "none",
                boxShadow: "none",
                opacity: 1,
                filter: "none",
                mixBlendMode: "normal",
                backdropFilter: "none",
              } : {
                background: namePlateBg,
                color: namePlateText,
                fontSize: 12,
                fontWeight: 700,
                padding: "7px 12px",
                display: "flex",
                justifyContent: "space-between",
                letterSpacing: ".06em",
                borderTop: `1px solid ${frameSeamColor}`,
                boxShadow: "none",
                transition: "background 1.2s ease",
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
          {/* Nocturnal dimming — applied only to the UI chrome below the
              scene card. The scene renders its own day/night sky internally. */}
          <div
            style={{
              filter: chromeFilter,
              transition: "filter 1.2s ease",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <KpiBar
              kind="sales"
              label={sales.label}
              value={salesDisplay}
              sub={sales.sub}
              score={salesScore}
              alerting={alertingKeys.has("sales")}
              onClick={() => setDrillKey("sales" as KpiKey)}
            />
            <KpiGrid tiles={tiles} onTileClick={setDrillKey} alertingKeys={alertingKeys} />
            <KpiBar
              kind="net"
              label={net.label}
              value={net.value}
              valueSub={net.dollars !== 0 ? `$${net.dollars.toLocaleString()}` : undefined}
              sub="today"
              score={netScore}
              isLast
              alerting={alertingKeys.has("net")}
              onClick={() => setDrillKey("net" as KpiKey)}
            />
            <MarqueeFeed onLongPress={setOpenFeed} />
          </div>
        </div>{/* end scroll container */}
        </div>{/* end relative wrapper */}

        <BottomTabs onOpen={setOpenTab} bg={frameColor} textColor={namePlateText} />
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

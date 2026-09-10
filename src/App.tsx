import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSkin } from "./theme/skins";
import { money } from "./lib/money";
import { ALERT_THRESHOLDS } from "./config/alertThresholds";
import { scoreAgainstExpected } from "./config/salesTargetConfig";
import { fetchReviewsBundle, ratingToReviewScore } from "./data/reviewsAdapter";
import { fetchAgingResult, agingToDebtScore, agingAgeDays, AGING_STALE_DAYS, type AgingSnapshot } from "./data/agingAdapter";
import { useAppStore } from "./stores/useAppStore";
import { useKpiStore } from "./stores/useKpiStore";
import { useLogStore } from "./stores/useLogStore";
import { useMaintenanceStore } from "./stores/useMaintenanceStore";
import { useFixedCostStore } from "./stores/useFixedCostStore";
import type { KpiKey } from "./stores/useKpiStore";
import { KpiBar } from "./components/KpiBar";
import { KpiGrid } from "./components/KpiGrid";
import { Scene } from "./components/Scene";
import type { WeatherCondition } from "./components/CoastalScene";
import { StatRow } from "./components/StatRow";
import type { FeedState } from "./components/StatRow";
import { BottomTabs } from "./components/BottomTabs";
import type { TabKey } from "./components/BottomTabs";
import { LaborDrillDown } from "./components/LaborDrillDown";
import { SalesDrillDown } from "./components/SalesDrillDown";
import { PrimeCostDrillDown } from "./components/PrimeCostDrillDown";
import { FixedCostDrillDown } from "./components/FixedCostDrillDown";
import { NetDrillDown } from "./components/NetDrillDown";
import { COGSDrillDown } from "./components/COGSDrillDown";
import { ReviewsDrillDown } from "./components/ReviewsDrillDown";
import { DebtDrillDown } from "./components/DebtDrillDown";
import { InvoicesTab } from "./components/tabs/InvoicesTab";
import { LogTab } from "./components/tabs/LogTab";
import { GizmoTab } from "./components/tabs/GizmoTab";
import { SkinPicker } from "./components/SkinPicker";
import { FullscreenScene } from "./components/FullscreenScene";
import { useIsDusky, useIsNight } from "./hooks/useTimeOfDay";

// Three states, and "we haven't looked yet" is not one of the other two:
//   loading      the first read is still in flight -- the nameplate says
//                NOTHING about the weather rather than announcing an absence
//                it hasn't established
//   ready        we have a reading
//   unavailable  a read came back failed or empty; the nameplate prints the
//                absence instead of a fabricated sunny day
// The vista still needs SOME sky to paint, so `condition` keeps its fallback
// for the scene in every state -- it is the nameplate that makes the claim.
type WeatherState = "loading" | "ready" | "unavailable";
type WeatherData = { condition: WeatherCondition; tempF: number | null; state: WeatherState };

const WEATHER_LOADING: WeatherData = { condition: "clear", tempF: null, state: "loading" };
const NO_WEATHER: WeatherData = { condition: "clear", tempF: null, state: "unavailable" };

// Same bargain as `condition` above, for the same reason. The vista tints one
// decorative element (Coastal's balloon / beam) from the Reviews score, and
// an SVG fill cannot be "unknown" -- it has to be SOME colour. So when there
// is no score, the scenery takes this tint and says nothing: the vista makes
// no claim about the rating, carries no number, and is not a surface the
// owner reads a review score off. The claim lives on the Reviews box, which
// goes neutral and unscored (StatRow) whenever this is in play.
const SCENE_TINT_WITHOUT_SCORE = 5;

async function fetchWeather(): Promise<WeatherData> {
  try {
    const res = await fetch("/api/weather", { cache: "no-store" });
    if (!res.ok) return NO_WEATHER;
    const data = await res.json();
    // /api/weather answers an upstream failure with 502 (handled above); this
    // guard only covers a 200 whose body is not a reading.
    if (data?.error || typeof data?.condition !== "string") return NO_WEATHER;
    return {
      condition: data.condition as WeatherCondition,
      tempF: typeof data.tempF === "number" ? Math.round(data.tempF) : null,
      state: "ready",
    };
  } catch {
    return NO_WEATHER;
  }
}

const PULL_THRESHOLD = 70; // px needed to trigger refresh

export default function App() {
  const skin                  = useSkin();
  const businessName          = useAppStore((s) => s.businessName);
  const sales                 = useKpiStore((s) => s.sales);
  const net                   = useKpiStore((s) => s.net);
  const period                = useKpiStore((s) => s.period);
  const tiles                 = useKpiStore((s) => s.tiles);
  const snapStatus            = useKpiStore((s) => s.status);
  const asOf                  = useKpiStore((s) => s.asOf);
  const meta                  = useKpiStore((s) => s.meta);
  const pullSnapshot          = useKpiStore((s) => s.pullSnapshot);
  const refresh               = useKpiStore((s) => s.refresh);
  const subscribeToSnapshots  = useKpiStore((s) => s.subscribeToSnapshots);
  const hydrateLog            = useLogStore((s) => s.hydrate);
  const hydrateMaintenance    = useMaintenanceStore((s) => s.hydrate);
  const hydrateFixedCost      = useFixedCostStore((s) => s.hydrate);

  const [openTab, setOpenTab]       = useState<TabKey | null>(null);
  const [weatherData, setWeatherData] = useState<WeatherData>(WEATHER_LOADING);
  const [drillKey, setDrillKey]     = useState<KpiKey | null>(null);
  const [openFeed, setOpenFeed]     = useState<"reviews" | "debt" | null>(null);

  // ── Pull-to-refresh state ─────────────────────────────────────────────────
  const scrollRef      = useRef<HTMLDivElement>(null);
  const touchStartY    = useRef(0);
  const [pullY, setPullY]           = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Bump to retrigger the lighthouse sweep (mount, KPI refresh, pull-to-refresh)
  const [beamPulseKey, setBeamPulseKey] = useState(0);

  // ── Vista gestures ───────────────────────────────────────────────────────
  //   long-press (550ms, hold still)  → skin picker
  //   triple-tap (3 taps in ~450ms)   → fullscreen landscape vista
  // The two can't collide: a tap ends long before the 550ms press fires, and
  // a press that fires cancels any tap sequence in flight.
  const [skinPickerOpen, setSkinPickerOpen] = useState(false);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const longPressTimer = useRef<number | null>(null);
  const longPressStart = useRef<{ x: number; y: number } | null>(null);
  const longPressFired = useRef(false);
  const tapCount       = useRef(0);
  const tapResetTimer  = useRef<number | null>(null);

  const clearTapRun = () => {
    tapCount.current = 0;
    if (tapResetTimer.current != null) {
      clearTimeout(tapResetTimer.current);
      tapResetTimer.current = null;
    }
  };
  // Drop any pending timers if the component unmounts mid-gesture
  useEffect(() => () => {
    if (longPressTimer.current != null) clearTimeout(longPressTimer.current);
    if (tapResetTimer.current  != null) clearTimeout(tapResetTimer.current);
  }, []);

  const frameTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    longPressStart.current = { x: t.clientX, y: t.clientY };
    longPressFired.current = false;
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null;
      longPressFired.current = true;
      clearTapRun();              // a hold is not the start of a tap run
      haptic(20);
      setSkinPickerOpen(true);
    }, 550);
  };
  const frameTouchMove = (e: React.TouchEvent) => {
    if (!longPressStart.current) return;
    const t = e.touches[0];
    // A drag (scroll / pull-to-refresh) cancels BOTH gestures
    if (Math.abs(t.clientX - longPressStart.current.x) > 10 ||
        Math.abs(t.clientY - longPressStart.current.y) > 10) {
      if (longPressTimer.current != null) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    }
  };
  const frameTouchEnd = () => {
    if (longPressTimer.current != null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  // Tap counting rides on CLICK, not touchend.
  //
  // Hand-rolling tap detection off touchstart/touchend failed on real
  // hardware for two reasons that synthetic events can't reproduce:
  //   1. a real finger rolls 10-20px on a "stationary" tap, which tripped
  //      the drag-cancel and zeroed the run;
  //   2. with double-tap-zoom enabled the browser swallows the 2nd/3rd
  //      click of a fast triple-tap (fixed by touch-action: manipulation
  //      on the frame, below).
  // The browser already does tap-vs-scroll discrimination for us and only
  // emits `click` for a genuine tap — so let it, and just count.
  const frameClick = () => {
    // The click that follows a long-press isn't a tap
    if (longPressFired.current) { longPressFired.current = false; return; }

    tapCount.current += 1;
    if (tapCount.current >= 3) {
      clearTapRun();
      haptic([12, 40, 12]);
      setFullscreenOpen(true);
      return;
    }
    if (tapResetTimer.current != null) clearTimeout(tapResetTimer.current);
    tapResetTimer.current = window.setTimeout(() => {
      tapCount.current = 0;
      tapResetTimer.current = null;
    }, 650); // generous — a deliberate 3-press is slower than a nervous one
  };

  // ── Back-button: push history entry when any modal opens ─────────────────
  const anyOpen = drillKey !== null || openTab !== null || openFeed !== null || skinPickerOpen || fullscreenOpen;
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
      if (fullscreenOpen)    { setFullscreenOpen(false); return; }
      if (skinPickerOpen)    { setSkinPickerOpen(false); return; }
      if (drillKey !== null) { setDrillKey(null); return; }
      if (openTab  !== null) { setOpenTab(null);  return; }
      if (openFeed !== null) { setOpenFeed(null); return; }
      // Nothing open — re-push so the page is never popped away
      history.pushState({ modal: false }, "");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [drillKey, openTab, openFeed, skinPickerOpen, fullscreenOpen]);

  // ── Supabase real-time subscription (primary data source) ────────────────
  useEffect(() => {
    const unsubscribe = subscribeToSnapshots();
    return unsubscribe;
  }, [subscribeToSnapshots]);

  // ── Activity log (seed) ───────────────────────────────────────────────────
  useEffect(() => {
    hydrateLog();
  }, [hydrateLog]);

  // ── Maintenance & Repair (seed): the list follows the selected period ────
  useEffect(() => {
    hydrateMaintenance(period);
  }, [hydrateMaintenance, period]);

  // ── Fixed-cost line items: hydrate from org_settings.pro_forma_json ──────
  useEffect(() => {
    hydrateFixedCost();
  }, [hydrateFixedCost]);

  // ── Reviews + A/P aging (the two StatRow boxes) ──────────────────────────
  // Both feeds carry their own state word. A read that fails is never
  // laundered into a value: with an earlier read on screen it goes "stale"
  // (last known, dimmed, labelled), with nothing behind it "unavailable"
  // (neutral tile, no score, tap to retry) -- never a green tile, a zero,
  // or a skeleton that shimmers for the rest of the session.
  const [reviewsScore, setReviewsScore] = useState<number | null>(null);
  const [reviewsRating, setReviewsRating] = useState<number | null>(null);
  const [reviewsCount, setReviewsCount] = useState(0);
  const [reviewsAsOf, setReviewsAsOf] = useState<string | null>(null);
  const [reviewsState, setReviewsState] = useState<FeedState>("loading");
  const [aging, setAging] = useState<AgingSnapshot | null>(null);
  const [agingState, setAgingState] = useState<FeedState>("loading");

  const loadReviews = useCallback(async () => {
    const b = await fetchReviewsBundle();
    if (!b) { setReviewsState((s) => (s === "ready" || s === "stale" ? "stale" : "unavailable")); return; }
    // A bundle with nothing rated is a real answer ("no reviews yet"), and
    // it scores nothing -- an empty feed is not a middling restaurant.
    setReviewsRating(b.overallRating);
    setReviewsScore(b.overallRating != null ? ratingToReviewScore(b.overallRating) : null);
    setReviewsCount(b.totalReviews);
    // NOT b.fetchedAt: that is minted client-side when THIS browser called the
    // API, so it is always within minutes of now -- a stamp that can never go
    // stale, which is worse than none. The only real age we have is when the
    // sync job last wrote a row, so take the newest of those (the bundle's
    // `recent` rows are the newest reviews it holds). No rows, no stamp.
    setReviewsAsOf(b.recent.reduce<string | null>(
      (newest, r) => (r.fetched_at && (newest == null || r.fetched_at > newest) ? r.fetched_at : newest),
      null,
    ));
    setReviewsState("ready");
  }, []);

  const loadAging = useCallback(async () => {
    // Three answers, kept apart: a snapshot, "no A/P report on file yet"
    // (a real answer about a new tenant or a feed that hasn't landed its
    // first report), and a read that failed. Collapsing the middle one into
    // the last showed a legitimate empty state as a broken feed, with a
    // retry that could never succeed.
    const a = await fetchAgingResult();
    if (a.status === "ready") { setAging(a.data); setAgingState("ready"); return; }
    if (a.status === "empty") { setAging(null); setAgingState("empty"); return; }
    // A failed re-read must not overwrite a good snapshot with null.
    setAgingState((s) => (s === "ready" || s === "stale" ? "stale" : "unavailable"));
  }, []);

  const retryReviews = useCallback(() => { setReviewsState("loading"); void loadReviews(); }, [loadReviews]);
  const retryAging   = useCallback(() => { setAgingState("loading");   void loadAging();   }, [loadAging]);

  // Same cadence as the KPI poll, and again the moment the app is looked at:
  // the installed PWA suspends timers in the background and is resumed, not
  // reloaded, so a mount-only fetch would freeze both boxes for the session.
  useEffect(() => {
    const load = () => { void loadReviews(); void loadAging(); };
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
  }, [loadReviews, loadAging]);

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
  // Tracks whether the "ready to refresh" haptic has already fired during
  // the current pull gesture so it only buzzes once.
  const thresholdHapticFired = useRef(false);

  // Safe wrapper around the Vibration API — no-ops on iOS Safari (no support)
  // and any other environment that doesn't implement it.
  const haptic = (pattern: number | number[]) => {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      try { navigator.vibrate(pattern); } catch { /* ignore */ }
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (scrollRef.current && scrollRef.current.scrollTop === 0) {
      touchStartY.current = e.touches[0].clientY;
      thresholdHapticFired.current = false;
    } else {
      touchStartY.current = 0;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartY.current || isRefreshing) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    if (delta > 0) {
      // Dampen pull so it feels springy
      const next = Math.min(delta * 0.45, PULL_THRESHOLD);
      // One-shot haptic the moment we cross the threshold (only once per pull)
      if (next >= PULL_THRESHOLD && !thresholdHapticFired.current) {
        thresholdHapticFired.current = true;
        haptic(20);
      }
      setPullY(next);
    }
  };

  const handleTouchEnd = async () => {
    if (pullY >= PULL_THRESHOLD && !isRefreshing) {
      setIsRefreshing(true);
      setPullY(0);
      setBeamPulseKey((k) => k + 1);
      await Promise.all([
        pullSnapshot(),                       // the tiles
        refresh().catch(() => undefined),     // the drill-downs; a failure there must not strand the gesture
        loadReviews().catch(() => undefined),  // the two StatRow boxes: a pull
        loadAging().catch(() => undefined),    // must refresh what it looks like it refreshes
        fetchWeather().then(setWeatherData).catch(() => undefined),
        new Promise((r) => setTimeout(r, 600)), // minimum spinner time
      ]);
      setIsRefreshing(false);
      // Confirmation haptic — two short taps so it feels distinct from the
      // single-buzz "threshold crossed" cue above.
      haptic([10, 40, 10]);
    } else {
      setPullY(0);
    }
    touchStartY.current = 0;
    thresholdHapticFired.current = false;
  };

  // Has a snapshot that actually CARRIED NUMBERS landed for this period?
  //
  // `asOf` cannot answer that. applySnapshot stamps it on the "no data for
  // this period yet" reply as well, so the ordinary morning sequence -- empty
  // at 8am, then a re-poll that fails -- would read as "we have last known
  // numbers", flipping the bar from "--" / "no numbers yet" to "$0 · offline ·
  // last known · as of 8:00 AM" and dimming every tile as though it once held
  // a figure. A read that failed is not a zero, and it is not a last known
  // value it never had.
  //
  // So watch the store for a snapshot that reached `ready` -- the only status
  // that means numbers -- and forget it the moment the period changes, since
  // setPeriod clears the numbers on screen with it. (Kept in state, not a ref:
  // this decides what the bar renders, and refs can't be read during render.)
  const [hasSnapshot, setHasSnapshot] = useState(() => useKpiStore.getState().status === "ready");
  useEffect(() => useKpiStore.subscribe((s, prev) => {
    if (s.period !== prev.period) setHasSnapshot(s.status === "ready");
    else if (s.status === "ready") setHasSnapshot(true);
  }), []);

  // Before this period's first snapshot lands there is no total to show, only
  // a named absence -- including when a failed read is what stopped it
  // landing. Only a snapshot that arrived puts a dollar figure on the bar.
  const salesKnown = snapStatus === "ready" || (snapStatus === "error" && hasSnapshot);
  const salesDisplay = salesKnown
    ? `$${sales.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : "--";

  // ── Sales score: actual vs the seed's expected-to-date for THIS period ────
  // (same-weekday 4-week baseline, today prorated by open hours). No score
  // until there is a baseline and data. One formula, shared with the Sales
  // drill-down and the crisis alarm, so the same dollars can never be graded
  // two ways on two surfaces; where the period has days the heartbeat never
  // reported, the coverage line below names the gap rather than the score
  // quietly grading against a smaller target.
  const salesScore = scoreAgainstExpected(sales.value, meta?.expectedToDate ?? null, snapStatus);

  // What the seed says it left out. `periodWindow` sums only the days that
  // produced a close and reports the gap as days_missing / days_partial; a
  // month built from 19 of its 28 days must not be presented as the month.
  const coverage =
    meta == null ? null
      : meta.daysMissing > 0 ? `built from ${Math.max(0, meta.daysExpected - meta.daysMissing)} of ${meta.daysExpected} days`
      : meta.daysPartial > 0 ? `${meta.daysPartial} partial day${meta.daysPartial === 1 ? "" : "s"}`
      : null;

  // One freshness line for the whole screen, on the Sales bar: which period
  // these numbers are, and when they were captured. (It used to ride the
  // weather line up in the nameplate, where it read like a forecast.)
  const stamp = asOf ? `as of ${new Date(asOf).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : null;
  const periodWord = { day: "Today", wtd: "Week", mtd: "Month" }[period];
  const salesSub =
    snapStatus === "loading" ? "loading…"
      // Keep the stamp precisely WHEN the numbers are ageing: "offline" with
      // no as-of is the least honest line the screen could print. And with
      // nothing behind the failure there is no "last known" to claim -- the
      // read simply did not happen.
      : snapStatus === "error" ? (hasSnapshot
          ? ["offline · last known", stamp, coverage].filter(Boolean).join(" · ")
          : ["couldn't load", periodWord].join(" · "))
      : snapStatus === "empty" ? ["no numbers yet", periodWord].join(" · ")
      : [periodWord, stamp, coverage].filter(Boolean).join(" · ");

  // The Net bar gets the same freshness, minus the period word the bar
  // above it already prints (it has a dollar figure to fit alongside).
  const netSub =
    snapStatus === "loading" ? "loading…"
      : snapStatus === "error" ? (hasSnapshot ? ["offline", stamp].filter(Boolean).join(" · ") : "couldn't load")
      : snapStatus === "empty" ? "no numbers yet"
      : [stamp, coverage].filter(Boolean).join(" · ") || periodWord;

  // Net score comes from the store (bucketed thresholds in useKpiStore).
  // Avoids the prior divergence where the home tile used a different scale
  // than the drill-down + email.
  const netPctNum  = typeof net.value === "string" ? parseFloat(net.value) : NaN;
  const netScore   = net.score;

  // Skeletons while the selected period's numbers are in flight.
  const isLoadingKpis = snapStatus === "loading";
  // The pull failed and the store kept the previous numbers: they are still
  // true as of `asOf`, but they are not this minute's. Dim them and let each
  // surface say so -- the dimming the store's own comment promises.
  const isStaleKpis  = snapStatus === "error" && hasSnapshot;
  // The pull failed with nothing behind it (first load, or straight after a
  // period switch): the tiles are "--" placeholders and must say the read
  // failed, not that they are the last known numbers.
  const isFailedKpis = snapStatus === "error" && !hasSnapshot;

  // The A/P aging report arrives by email, so the tile's as-of can be weeks
  // behind. Past AGING_STALE_DAYS say how OLD it is instead of printing a
  // bare "as of 7/1" that reads as current. The score is untouched: the
  // balance on file is known, and age is a caveat to state, not grounds to
  // withhold a colour on a threshold nobody decided.
  const agingAge = aging ? agingAgeDays(aging.reportDate) : null;
  const debtAgeNote = agingAge != null && agingAge > AGING_STALE_DAYS ? `report ${agingAge} days old` : null;

  // ── Crisis-level pulse alerts ─────────────────────────────────────────────
  const alertingKeys = useMemo(() => {
    const keys = new Set<string>();
    const T = ALERT_THRESHOLDS;
    const ready = snapStatus === "ready";              // nothing to alarm about while loading / empty
    const expected = meta?.expectedToDate ?? null;
    // A "dangerously slow" day is judged against expectation for the period,
    // not a single-day dollar floor -- a week can't be "below $400". No floor
    // on the actual, either: $0 at 9pm against a $4,000 expectation is a dead
    // POS or a dead service, the single worst state this screen can be in, and
    // it is exactly when the alarm must be loudest. (Declining to SCORE an
    // empty till is a different question from declining to alarm on one.)
    if (ready && expected != null && expected > 0 && sales.value < expected * T.sales.belowFractionOfExpected) keys.add("sales");
    if (ready && netPctNum < T.net.below) keys.add("net");
    if (ready) tiles.forEach((t) => {
      const v = parseFloat(t.value);
      if (!Number.isFinite(v)) return;
      if (t.key === "cogs"  && v > T.cogs.above)  keys.add("cogs");
      if (t.key === "labor" && v > T.labor.above)  keys.add("labor");
      if (t.key === "prime" && v > T.prime.above)  keys.add("prime");
      if (t.key === "fixed" && v > T.fixed.above)  keys.add("fixed");
    });
    return keys;
  }, [sales.value, netPctNum, tiles, snapStatus, meta]);

  // Pull indicator progress 0→1
  // pullProgress used to drive the now-removed pull-to-refresh spinner.
  // The lighthouse beam pulse in the coastal scene is the only refresh
  // affordance we need (triggered via setBeamPulseKey on refresh).

  // ── Nocturnal UI (option B + mild C) ─────────────────────────────────────
  // After sundown: darken the page/phone bg and apply a gentle brightness +
  // saturation filter to all the UI chrome below the scene card so the
  // pastel KPI tiles stop yelling when the scene has gone dark.
  const isNight = useIsNight();
  const isDusky = useIsDusky();
  const pageBg  = isDusky ? skin.chrome.pageBgDusk : skin.pageBg;
  const phoneBg = isNight ? skin.chrome.phoneBgNight : isDusky ? skin.chrome.phoneBgDusk : skin.phoneBg;
  // Filter strength — sundown gets a modest dim, full night goes hard so the
  // pastel tiles stop yelling against the dark scene.
  // Always-dark skins (Nostromo, New York) are night-tuned already —
  // dimming them would crush the neon/phosphor tiles.
  const chromeFilter = !skin.chrome.dimAtNight
    ? undefined
    : isNight
      ? "brightness(0.48) saturate(0.55)"
      : isDusky
        ? "brightness(0.72) saturate(0.78)"
        : undefined;
  // Nameplate row (under the scene image) bleeds into the water at night
  // so there's no visible "footer strip" between the scene and the KPI
  // chrome. Matches WATER[night][1] (#10243A) from CoastalScene — the
  // mid-band water color — so the seam disappears into the ocean.
  const namePlateBg = isDusky ? skin.chrome.namePlateBgDusk : skin.chrome.namePlateBg;
  // Scene frame + bottom-tab bar share one dark color at night so the
  // chrome reads as a single frame; the nameplate no longer matches.
  // the day and swap to a dark walnut after sundown so they stop glowing.
  const frameColor     = isDusky ? skin.chrome.frameDusk : skin.chrome.frame;
  const frameSeamColor = isDusky ? skin.chrome.frameSeamDusk : skin.chrome.frameSeam;
  const namePlateText  = isDusky ? skin.chrome.namePlateTextDusk : skin.chrome.namePlateText;

  // Fullscreen hides the phone's own clock, so the nameplate carries one.
  // Ticks every 20s (minutes only) and again the moment the app is looked
  // at, so it is never showing a stale minute after a night on the counter.
  const [clock, setClock] = useState<Date>(() => new Date());
  useEffect(() => {
    const tick = () => setClock(new Date());
    const id = setInterval(tick, 20_000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("pageshow", tick);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", tick); window.removeEventListener("pageshow", tick); };
  }, []);
  const clockLabel = clock.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  // The canvas -- html AND body -- is always the skin's frame color, so no
  // black can appear anywhere the app itself doesn't paint (the fullscreen
  // letterbox, the overscroll gutter). theme-color follows it too, for the
  // status bar in the modes that still have one.
  useEffect(() => {
    document.documentElement.style.background = frameColor;
    document.body.style.background = frameColor;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", frameColor);
  }, [frameColor]);

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: pageBg,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        fontFamily: skin.fonts.body,
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
        {/* Top rail -- the frame color, mirroring the bottom bar.
            Fullscreen hides the status bar and Android letterboxes its strip
            black; that strip is outside the page, so we cannot paint it. What
            we CAN do is give it something deliberate to meet: the app is
            framed in driftwood top and bottom, and the black reads as the
            phone rather than as a seam we forgot. On a notched iPhone the
            safe-area inset makes this rail exactly the notch band, which is
            the same job it did as padding before. */}
        <div
          aria-hidden
          style={{
            height: "max(env(safe-area-inset-top), 14px)",
            flexShrink: 0,
            background: frameColor,
            borderBottom: `1px solid ${frameSeamColor}`,
            transition: "background 1.2s ease",
          }}
        />
        {/* Scrollable content */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" }}>

          {/* No pull-to-refresh spinner — the lighthouse beam pulse in the
              coastal scene (triggered on refresh) is the visual feedback. */}

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
            minHeight: 0,
            background: phoneBg,
            transition: "background 1.2s ease",
          }}
        >
          {/* Framed painting with nameplate along the bottom of the frame */}
          {/* DIAGNOSTIC: at night, parent wrapper forced transparent + no
              shadow so the nameplate row is the only thing that can draw
              a dark strip below the scene. */}
          <div
            onTouchStart={frameTouchStart}
            onTouchMove={frameTouchMove}
            onTouchEnd={frameTouchEnd}
            onContextMenu={(e) => { e.preventDefault(); setSkinPickerOpen(true); }}
            onClick={frameClick}
            style={{
              userSelect: "none",
              WebkitUserSelect: "none",
              WebkitTouchCallout: "none",
              // Disables double-tap-to-zoom on the vista. Without this the
              // browser eats the 2nd/3rd click of a fast triple-tap (and
              // adds tap delay) — the reason triple-tap failed on device.
              touchAction: "manipulation",
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
            {/* Scenery tint, not a score — see SCENE_TINT_WITHOUT_SCORE. */}
            <Scene weather={weatherData.condition} beamPulseKey={beamPulseKey} reviewsScore={reviewsScore ?? SCENE_TINT_WITHOUT_SCORE} />
            <div
              style={isDusky ? {
                // Hot-pink diagnostic confirmed this is the nameplate row.
                // Now painted ocean blue (sampled from the live scene) and
                // all layering props hard-forced so no wrapper / overlay /
                // pseudo can leak a different dark over it.
                background: skin.chrome.namePlateBgDusk,
                backgroundColor: skin.chrome.namePlateBgDusk,
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
                {/* While the first read is in flight the nameplate says
                    nothing about the weather -- "no weather" is a finding, and
                    we haven't looked yet. The clock stands alone until a read
                    comes back. */}
                {weatherData.state !== "loading" && (
                  <>
                    <span style={{ opacity: weatherData.state === "ready" ? 0.9 : 0.55 }}>
                      {weatherData.state === "unavailable" && "no weather"}
                      {weatherData.state === "ready" && weatherData.condition === "clear"  && "☀️"}
                      {weatherData.state === "ready" && weatherData.condition === "cloudy" && "⛅"}
                      {weatherData.state === "ready" && weatherData.condition === "rain"   && "🌧️"}
                      {weatherData.state === "ready" && weatherData.condition === "snow"   && "❄️"}
                      {weatherData.state === "ready" && weatherData.condition === "wind"   && "💨"}
                      {weatherData.state === "ready" && weatherData.tempF != null && ` ${weatherData.tempF}°`}
                    </span>
                    <span style={{ opacity: 0.55 }}>·</span>
                  </>
                )}
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{clockLabel}</span>
              </span>
            </div>
          </div>
          {/* Nocturnal dimming — applied only to the UI chrome below the
              scene card. The scene renders its own day/night sky internally.
              The `pwa-stack` class triggers PWA-only extra spacing between
              tiles (see index.css @media (display-mode: standalone)). */}
          <div
            className="pwa-stack"
            style={{
              filter: chromeFilter,
              transition: "filter 1.2s ease",
              display: "flex",
              flexDirection: "column",
              // Removing the marquee left ~200px of dead space above the tab
              // bar. Grow into it and spread the slack evenly between rows
              // instead of pooling it all at the bottom.
              flex: 1,
              gap: 8,
              paddingTop: 8,
              paddingBottom: 8,
            }}
          >
            <KpiBar
              kind="sales"
              label={sales.label}
              value={salesDisplay}
              sub={salesSub}
              score={salesScore}
              alerting={alertingKeys.has("sales")}
              loading={isLoadingKpis}
              stale={isStaleKpis}
              onClick={() => setDrillKey("sales" as KpiKey)}
            />
            <KpiGrid tiles={tiles} onTileClick={setDrillKey} alertingKeys={alertingKeys} loading={isLoadingKpis} stale={isStaleKpis} failed={isFailedKpis} />
            <StatRow
              reviewsRating={reviewsRating}
              reviewsCount={reviewsCount}
              reviewsScore={reviewsScore}
              reviewsState={reviewsState}
              reviewsAsOf={reviewsAsOf}
              debtTotal={aging?.totalOpen ?? null}
              debtOver90={aging?.over90 ?? 0}
              // The whole snapshot, not a bare bucket: agingToDebtScore
              // returns null when there is no report at all, which lands on
              // the neutral tile. A bare `over90` defaulted to 0, so the
              // ABSENCE of an A/P report scored 8 -- the greenest stop on the
              // scale -- on a read that never happened. An old-but-real report
              // still scores; `debtAgeNote` says how old it is.
              debtScore={agingToDebtScore(aging)}
              debtState={agingState}
              debtAsOf={aging?.reportDate ?? null}
              debtAgeNote={debtAgeNote}
              onOpenReviews={() => setOpenFeed("reviews")}
              onOpenDebt={() => setOpenFeed("debt")}
              onRetryReviews={retryReviews}
              onRetryDebt={retryAging}
            />
            <KpiBar
              kind="net"
              label={net.label}
              value={net.value}
              valueSub={net.dollars !== 0 ? money(net.dollars) : undefined}
              sub={netSub}
              score={netScore}
              loading={isLoadingKpis}
              stale={isStaleKpis}
              alerting={alertingKeys.has("net")}
              onClick={() => setDrillKey("net" as KpiKey)}
            />

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
      <DebtDrillDown    open={openFeed === "debt"}    onClose={() => setOpenFeed(null)} />

      {/* ── Skin picker (long-press the vista) ──────── */}
      <SkinPicker open={skinPickerOpen} onClose={() => setSkinPickerOpen(false)} />
      <FullscreenScene
        open={fullscreenOpen}
        onClose={() => setFullscreenOpen(false)}
        weather={weatherData.condition}
        beamPulseKey={beamPulseKey}
        /* Scenery tint, not a score — see SCENE_TINT_WITHOUT_SCORE. */
        reviewsScore={reviewsScore ?? SCENE_TINT_WITHOUT_SCORE}
      />

      {/* ── Bottom tab panels ───────────────────────── */}
      <InvoicesTab open={openTab === "invoices"} onClose={() => setOpenTab(null)} />
      <LogTab      open={openTab === "log"}      onClose={() => setOpenTab(null)} />
      <GizmoTab    open={openTab === "gizmo"}    onClose={() => setOpenTab(null)} onOpenTab={setOpenTab} />

    </div>
  );
}

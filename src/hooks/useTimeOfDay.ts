// Shared time-of-day hook — reads the same calc the CoastalScene uses so
// the UI chrome (page bg, KPI tiles) can dim in sync with the sky.

import { useEffect, useState } from "react";

export type TimeOfDay = "dawn" | "morning" | "afternoon" | "sundown" | "night";

const GCDC_LAT =  38.90;
const GCDC_LON = -77.04;

function sunTimes(date: Date, lat = GCDC_LAT, lon = GCDC_LON): { sunrise: number; sunset: number } {
  const rad = Math.PI / 180;
  const deg = 180 / Math.PI;
  const yearStart = new Date(date.getFullYear(), 0, 0).getTime();
  const n = Math.floor((date.getTime() - yearStart) / 86400000);
  const decl = 23.44 * Math.sin(rad * (360 / 365.25) * (n - 81));
  const cosH = -Math.tan(rad * lat) * Math.tan(rad * decl);
  if (cosH > 1)  return { sunrise: 24, sunset: 24 };
  if (cosH < -1) return { sunrise: 0,  sunset: 24 };
  const hourAngle = Math.acos(cosH) * deg / 15;
  const B = rad * (360 / 365) * (n - 81);
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
  const noonUTC = 12 - lon / 15;
  const noonLocal = noonUTC - eot / 60 - date.getTimezoneOffset() / 60;
  return { sunrise: noonLocal - hourAngle, sunset: noonLocal + hourAngle };
}

export function getTimeOfDay(d = new Date()): TimeOfDay {
  const h = d.getHours() + d.getMinutes() / 60;
  const { sunrise, sunset } = sunTimes(d);
  if (h >= sunrise - 1   && h < sunrise + 1 ) return "dawn";
  if (h >= sunrise + 1   && h < 12          ) return "morning";
  if (h >= 12            && h < sunset - 1  ) return "afternoon";
  if (h >= sunset - 1    && h < sunset + 0.5) return "sundown";
  return "night";
}

export function useTimeOfDay(): TimeOfDay {
  const [tod, setTod] = useState<TimeOfDay>(() => getTimeOfDay());
  useEffect(() => {
    const id = setInterval(() => setTod(getTimeOfDay()), 60_000);
    return () => clearInterval(id);
  }, []);
  return tod;
}

// The scene palette (sky gradient, sun/moon) stays driven by the 5-label
// getTimeOfDay() above — don't touch that. The chrome-dimming booleans
// below are intentionally decoupled so they can be tuned independently
// of the sky-palette phases.
//
// Desired chrome timing:
//   isDusky → starts 30 min after sunset (UI goes dark)
//   isNight → starts  1 hr after isDusky (= sunset + 1.5 h; scene goes
//             fully nocturnal: moon/stars/jellyfish, no sharks, etc.)
// Both remain true through the rest of the night until dawn
// (sunrise - 1 hr, matching the getTimeOfDay "dawn" window).

function hoursAfterSunsetBoundaries(d = new Date()): { afterSunset: boolean; duskStart: number; nightStart: number; dawnEnd: number; h: number } {
  const h = d.getHours() + d.getMinutes() / 60;
  const { sunrise, sunset } = sunTimes(d);
  return {
    afterSunset: h >= sunset,
    duskStart:  sunset + 0.5,
    nightStart: sunset + 1.5,
    dawnEnd:    sunrise - 1,
    h,
  };
}

/** True once the scene has fully committed to night (sunset + 1.5h)
 *  through the end of dawn (sunrise - 1h). */
export function useIsNight(): boolean {
  const [flag, setFlag] = useState<boolean>(() => isNightNow());
  useEffect(() => {
    const id = setInterval(() => setFlag(isNightNow()), 60_000);
    return () => clearInterval(id);
  }, []);
  return flag;
}

function isNightNow(d = new Date()): boolean {
  const { h, nightStart, dawnEnd } = hoursAfterSunsetBoundaries(d);
  // Night runs from nightStart (past 24h counts) through dawnEnd the
  // next morning. Since nightStart > dawnEnd in a 0–24 frame, the
  // correct test is: h >= nightStart OR h < dawnEnd.
  return h >= nightStart || h < dawnEnd;
}

/** True from 30 min after sunset through end of dawn — the chrome starts
 *  dimming here, even though the scene still shows a sundown sky until
 *  isNight kicks in an hour later. */
export function useIsDusky(): boolean {
  const [flag, setFlag] = useState<boolean>(() => isDuskyNow());
  useEffect(() => {
    const id = setInterval(() => setFlag(isDuskyNow()), 60_000);
    return () => clearInterval(id);
  }, []);
  return flag;
}

function isDuskyNow(d = new Date()): boolean {
  const { h, duskStart, dawnEnd } = hoursAfterSunsetBoundaries(d);
  return h >= duskStart || h < dawnEnd;
}

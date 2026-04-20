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

/** True after sundown-proper (the blue hour has ended) through dawn. */
export function useIsNight(): boolean {
  const tod = useTimeOfDay();
  return tod === "night";
}

/** True from sundown onward through the full night — for when you want
 *  the UI to start dimming earlier, as the sky is already going orange. */
export function useIsDusky(): boolean {
  const tod = useTimeOfDay();
  return tod === "sundown" || tod === "night";
}

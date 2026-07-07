// Shared time-of-day machinery for the skin scenes.
//
// Extracted from CoastalScene's NOAA-style sun calc so the Le Mans /
// Nostromo / New York scenes phase with the real sun exactly like Coastal.
// CoastalScene keeps its own internal copy (deliberately untouched — see
// the blue-line saga); new scenes import from here.

export type TimeOfDay = 'dawn' | 'morning' | 'afternoon' | 'sundown' | 'night'

const GCDC_LAT = 38.90
const GCDC_LON = -77.04

export function sunTimes(date: Date, lat = GCDC_LAT, lon = GCDC_LON): { sunrise: number; sunset: number } {
  const rad = Math.PI / 180
  const deg = 180 / Math.PI
  const yearStart = new Date(date.getFullYear(), 0, 0).getTime()
  const n = Math.floor((date.getTime() - yearStart) / 86400000)
  const decl = 23.44 * Math.sin(rad * (360 / 365.25) * (n - 81))
  const cosH = -Math.tan(rad * lat) * Math.tan(rad * decl)
  if (cosH > 1)  return { sunrise: 24, sunset: 24 }
  if (cosH < -1) return { sunrise: 0,  sunset: 24 }
  const hourAngle = Math.acos(cosH) * deg / 15
  const B = rad * (360 / 365) * (n - 81)
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B)
  const noonUTC = 12 - lon / 15
  const noonLocal = noonUTC - eot / 60 - date.getTimezoneOffset() / 60
  return { sunrise: noonLocal - hourAngle, sunset: noonLocal + hourAngle }
}

export function getTimeOfDay(d = new Date()): TimeOfDay {
  const h = d.getHours() + d.getMinutes() / 60
  const { sunrise, sunset } = sunTimes(d)
  if (h >= sunrise - 1 && h < sunrise + 1  ) return 'dawn'
  if (h >= sunrise + 1 && h < 12           ) return 'morning'
  if (h >= 12          && h < sunset - 1   ) return 'afternoon'
  if (h >= sunset - 1  && h < sunset + 0.5 ) return 'sundown'
  return 'night'
}

/** Lunar phase 0–1 (0 = new, 0.5 = full). Synodic-month mean cycle. */
export function moonPhase(date = new Date()): number {
  const SYNODIC = 29.53058867
  const KNOWN_NEW_JD = 2451550.26
  const jd = date.getTime() / 86400000 + 2440587.5
  const days = (((jd - KNOWN_NEW_JD) % SYNODIC) + SYNODIC) % SYNODIC
  return days / SYNODIC
}

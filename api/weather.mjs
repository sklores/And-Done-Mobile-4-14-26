// Vercel serverless function: GET /api/weather
// Fetches current conditions for zip 20006 (Washington DC) via
// Open-Meteo — free, no API key required.

// 20006 centroid: 38.8977° N, -77.0365° W
const LAT = 38.8977
const LON = -77.0365

// windKph may be null when the feed omits it: the wind upgrades simply
// don't apply, rather than a missing wind being read as a calm one.
const WMO_TO_CONDITION = (code, windKph) => {
  if (code === 0 || code === 1 || code === 2) {
    return windKph > 30 ? 'wind' : 'clear'
  }
  if (code === 3 || code === 45 || code === 48) {
    return windKph > 35 ? 'wind' : 'cloudy'
  }
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) {
    return 'rain'
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return 'snow'
  }
  return windKph > 30 ? 'wind' : 'clear'
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export default async function handler(_req, res) {
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 's-maxage=1800, stale-while-revalidate') // 30 min cache
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=weather_code,wind_speed_10m,temperature_2m&temperature_unit=fahrenheit&timezone=America%2FNew_York&forecast_days=1`
    const r = await fetch(url)
    if (!r.ok) throw new Error(`open-meteo ${r.status}`)
    const data = await r.json()
    const code    = num(data.current?.weather_code)
    // No code, no reading: a missing sky is not a clear one.
    if (code === null) throw new Error('open-meteo: no current weather_code')
    const windKph = num(data.current?.wind_speed_10m)
    const tempF   = num(data.current?.temperature_2m)
    const condition = WMO_TO_CONDITION(code, windKph)
    res.statusCode = 200
    res.end(JSON.stringify({ condition, tempF, code, windKph, fetchedAt: new Date().toISOString() }))
  } catch (e) {
    // A dead feed is unavailable, not sunny: no condition to paint, and the
    // miss is not cached at the CDN for the next half hour.
    res.setHeader('cache-control', 'no-store')
    res.statusCode = 502
    res.end(JSON.stringify({ condition: null, tempF: null, unavailable: true, error: e instanceof Error ? e.message : String(e) }))
  }
}

// Vercel serverless function: GET /api/weather
// Fetches current conditions for zip 20006 (Washington DC) via
// Open-Meteo — free, no API key required.

// 20006 centroid: 38.8977° N, -77.0365° W
const LAT = 38.8977
const LON = -77.0365

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

export default async function handler(_req, res) {
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 's-maxage=1800, stale-while-revalidate') // 30 min cache
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=weather_code,wind_speed_10m,temperature_2m&temperature_unit=fahrenheit&timezone=America%2FNew_York&forecast_days=1`
    const r = await fetch(url)
    if (!r.ok) throw new Error(`open-meteo ${r.status}`)
    const data = await r.json()
    const code    = data.current?.weather_code ?? 0
    const windKph = data.current?.wind_speed_10m ?? 0
    const tempF   = data.current?.temperature_2m ?? null
    const condition = WMO_TO_CONDITION(code, windKph)
    res.statusCode = 200
    res.end(JSON.stringify({ condition, tempF, code, windKph, fetchedAt: new Date().toISOString() }))
  } catch (e) {
    // Fail gracefully — clear sky is a safe default
    res.statusCode = 200
    res.end(JSON.stringify({ condition: 'clear', error: e.message }))
  }
}

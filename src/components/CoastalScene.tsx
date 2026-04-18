import { useEffect, useState } from 'react'
import { useKpiStore } from '../stores/useKpiStore'

type TimeOfDay = 'dawn' | 'morning' | 'afternoon' | 'sundown' | 'night'
export type WeatherCondition = 'clear' | 'cloudy' | 'rain' | 'snow' | 'wind'

interface CoastalSceneProps {
  weather?: WeatherCondition
}

function getTimeOfDay(d = new Date()): TimeOfDay {
  const h = d.getHours()
  if (h >= 5 && h < 7) return 'dawn'
  if (h >= 7 && h < 12) return 'morning'
  if (h >= 12 && h < 17) return 'afternoon'
  if (h >= 17 && h < 20) return 'sundown'
  return 'night'
}

const SKY: Record<TimeOfDay, [string, string, string]> = {
  dawn:      ['#C87848', '#F4A870', '#F8DDB8'],
  morning:   ['#6AAED4', '#94CAE0', '#C0E0EE'],
  afternoon: ['#4A90C8', '#78B4D8', '#AADCEE'],
  sundown:   ['#C84828', '#E87840', '#F4A860'],
  night:     ['#080E1C', '#0C1428', '#101E38'],
}

// Extra deep-top color injected as a 4th gradient stop for sundown/dawn
const SKY_DEEP_TOP: Partial<Record<TimeOfDay, string>> = {
  dawn:    '#1E0E28',  // dark purple-navy before sunrise
  sundown: '#3C1420',  // deep crimson-purple at the top
}

const HORIZON: Record<TimeOfDay, string> = {
  dawn:      '#F0C8A0',
  morning:   '#CCE8F4',
  afternoon: '#C4E4F4',
  sundown:   '#F8C888',
  night:     '#0E1C30',
}

const WATER: Record<TimeOfDay, [string, string, string]> = {
  dawn:      ['#5A7E98', '#2E5470', '#102840'],  // slate-blue pre-dawn
  morning:   ['#4A9AB8', '#2A7898', '#0E4E6E'],  // clear bright teal-blue
  afternoon: ['#3A8EB8', '#1A6898', '#0A4068'],  // deep clean blue
  sundown:   ['#3A6A8A', '#1A4868', '#0A2848'],  // dusky navy — stays blue
  night:     ['#0C1828', '#080E18', '#040810'],  // near-black deep blue
}

const SUN: Record<TimeOfDay, { x: number; y: number; r: number; c: string; g: string; moon: boolean }> = {
  dawn:      { x: 42,  y: 74, r: 18, c: '#FFAA44', g: '#FF8822', moon: false },
  morning:   { x: 290, y: 28, r: 17, c: '#FFFDE0', g: '#FFF0A0', moon: false },
  afternoon: { x: 230, y: 20, r: 16, c: '#FFF8C0', g: '#FFFDE0', moon: false },
  sundown:   { x: 34,  y: 62, r: 20, c: '#FF6622', g: '#FF4400', moon: false },
  night:     { x: 318, y: 26, r: 11, c: '#E8E4D4', g: '#D0CCB8', moon: true  },
}

const CLOUD_OPACITY: Record<TimeOfDay, number> = {
  dawn: .50, morning: .65, afternoon: .52, sundown: .36, night: .12,
}

const ROCK_COLORS: Record<TimeOfDay, [string, string, string]> = {
  dawn:      ['#505A62', '#3E484E', '#303840'],
  morning:   ['#545E66', '#424C54', '#323A40'],
  afternoon: ['#545E66', '#424C54', '#323A40'],
  sundown:   ['#4A4440', '#38343A', '#2A2628'],
  night:     ['#1E2838', '#162030', '#0E1826'],
}

function wAmp(sales: number): number {
  return Math.round(Math.pow(sales / 20000, 0.55) * 30)
}
function wSpd(sales: number, base: number, isWind: boolean): string {
  const b = isWind ? base * 0.48 : base
  return (b * (1 - Math.pow(sales / 20000, 0.5) * 0.48)).toFixed(1)
}

const WL = 132  // waterline Y in 375x200 viewBox

function wp1(a: number): string {
  const t = WL, c = t - a
  return `M-30,${t} C12,${c} 54,${t+a*.65} 96,${t} C138,${c} 180,${t+a*.65} 222,${t} C264,${c} 306,${t+a*.65} 348,${t} C366,${c+2} 384,${t+a*.4} 410,${t} L410,200 L-30,200Z`
}
function wp2(a: number): string {
  const t = WL+8, c = t - a * .78
  return `M-30,${t} C18,${c} 66,${t+a*.58} 114,${t} C162,${c} 210,${t+a*.58} 258,${t} C306,${c} 350,${t+a*.58} 395,${t} L410,200 L-30,200Z`
}
function wp3(a: number): string {
  const t = WL+18, c = t - a * .45
  return `M-30,${t} C25,${c} 80,${t+a*.4} 135,${t} C190,${c} 245,${t+a*.4} 300,${t} C340,${c} 368,${t+a*.3} 410,${t} L410,200 L-30,200Z`
}

const SCENE_CSS = `
@keyframes cs-wv1{0%,100%{transform:translateX(0)}50%{transform:translateX(-22px)}}
@keyframes cs-wv2{0%,100%{transform:translateX(-16px)}50%{transform:translateX(18px)}}
@keyframes cs-wv3{0%,100%{transform:translateX(10px)}50%{transform:translateX(-14px)}}
@keyframes cs-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3.5px)}}
@keyframes cs-beam{0%,100%{opacity:.5;transform:rotate(-18deg)}50%{opacity:.1;transform:rotate(18deg)}}
@keyframes cs-drift1{0%,100%{transform:translateX(0)}50%{transform:translateX(12px)}}
@keyframes cs-drift2{0%,100%{transform:translateX(0)}50%{transform:translateX(-10px)}}
@keyframes cs-bfly{0%{transform:translateX(-30px)}100%{transform:translateX(420px)}}
@keyframes cs-bfly2{0%{transform:translateX(-80px)}100%{transform:translateX(420px)}}
@keyframes cs-bfly3{0%{transform:translateX(-50px)}100%{transform:translateX(420px)}}
@keyframes cs-twink{0%,100%{opacity:.85}50%{opacity:.15}}
@keyframes cs-shark1{0%{transform:translateX(0)}50%{transform:translateX(-28px)}100%{transform:translateX(0)}}
@keyframes cs-shark2{0%{transform:translateX(0)}50%{transform:translateX(22px)}100%{transform:translateX(0)}}
@keyframes cs-shark3{0%{transform:translateX(0)}50%{transform:translateX(-20px)}100%{transform:translateX(0)}}
@keyframes cs-shark4{0%{transform:translateX(0)}50%{transform:translateX(26px)}100%{transform:translateX(0)}}
@keyframes cs-shark5{0%{transform:translateX(0)}50%{transform:translateX(-16px)}100%{transform:translateX(0)}}
@keyframes cs-rain{0%{transform:translateY(-30px)}100%{transform:translateY(210px) translateX(20px)}}
@keyframes cs-snow{0%{transform:translateY(-10px)}50%{transform:translateY(80px) translateX(8px)}100%{transform:translateY(175px) translateX(-4px)}}
@keyframes cs-wind{0%{opacity:0;transform:translateX(-60px)}40%{opacity:.32}100%{opacity:0;transform:translateX(420px)}}
@keyframes cs-balloon{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
@keyframes cs-spray{0%{opacity:0;transform:translateY(0)}35%{opacity:.75}100%{opacity:0;transform:translateY(-16px) scaleX(1.6)}}
@keyframes cs-spray2{0%{opacity:0}25%{opacity:.55}100%{opacity:0;transform:translateY(-10px) translateX(8px)}}
@keyframes cs-sprayl{0%{opacity:0;transform:translateY(0)}30%{opacity:.5}100%{opacity:0;transform:translateY(-12px) scaleX(1.3)}}
@keyframes cs-dolphin{0%,22%,100%{transform:translateY(0) rotate(0deg);opacity:0} 7%{transform:translateY(-26px) rotate(-22deg);opacity:1} 14%{transform:translateY(-14px) rotate(12deg);opacity:0.8} 18%{transform:translateY(0) rotate(0deg);opacity:0}}
@keyframes cs-dolphin2{0%,24%,100%{transform:translateY(0) rotate(0deg);opacity:0} 8%{transform:translateY(-20px) rotate(-18deg);opacity:0.85} 15%{transform:translateY(-8px) rotate(10deg);opacity:0.6} 20%{transform:translateY(0) rotate(0deg);opacity:0}}
@keyframes cs-amp-draw{0%{stroke-dashoffset:1;opacity:1}52%{stroke-dashoffset:0;opacity:1}72%{stroke-dashoffset:0;opacity:1}100%{stroke-dashoffset:0;opacity:0}}
`

const STARS: [number, number][] = [
  [55,10],[100,7],[155,16],[210,9],[268,13],[318,7],[348,20],
  [88,26],[195,24],[305,28],[138,18],[240,22],
]
const RAIN_DROPS: [number, number][] = [
  [30,10],[80,25],[135,5],[190,18],[245,8],[300,22],[350,12],
  [55,38],[110,45],[165,30],[220,42],[275,35],[320,48],
  [18,55],[90,60],[160,52],[230,58],[310,40],
]
// 20 bird slots — rendered first-N based on labor score (3=good → 20=bad)
// Negative delays seed each bird mid-flight on load so they never bunch at left.
const BIRD_SLOTS = [
  { y: 44, spd: 22, dl: -2,  s: 1.0, sw: 1.1 },
  { y: 32, spd: 30, dl: -11, s: 0.9, sw: 0.9 },
  { y: 52, spd: 38, dl: -18, s: 0.85,sw: 0.85},
  { y: 28, spd: 25, dl: -5,  s: 1.0, sw: 1.0 },
  { y: 48, spd: 20, dl: -8,  s: 0.9, sw: 0.9 },
  { y: 36, spd: 33, dl: -14, s: 0.85,sw: 0.85},
  { y: 56, spd: 28, dl: -3,  s: 1.0, sw: 0.9 },
  { y: 24, spd: 18, dl: -9,  s: 1.1, sw: 1.0 },
  { y: 40, spd: 35, dl: -20, s: 0.8, sw: 0.8 },
  { y: 60, spd: 24, dl: -6,  s: 0.9, sw: 0.85},
  { y: 20, spd: 40, dl: -15, s: 0.75,sw: 0.75},
  { y: 50, spd: 26, dl: -1,  s: 0.95,sw: 0.9 },
  { y: 34, spd: 32, dl: -12, s: 0.85,sw: 0.85},
  { y: 58, spd: 22, dl: -7,  s: 0.9, sw: 0.85},
  { y: 22, spd: 29, dl: -16, s: 0.8, sw: 0.8 },
  { y: 46, spd: 36, dl: -4,  s: 0.85,sw: 0.85},
  { y: 30, spd: 21, dl: -10, s: 1.0, sw: 0.9 },
  { y: 62, spd: 27, dl: -19, s: 0.75,sw: 0.75},
  { y: 38, spd: 31, dl: -13, s: 0.9, sw: 0.85},
  { y: 26, spd: 23, dl: -17, s: 0.95,sw: 0.9 },
]

// 5 shark positions — rendered first-N based on expenses score (0=good → 5=bad)
const SHARK_DEFS = [
  { x: 262, fy: WL+20, ty: WL+11, hw: 9,  rx: 11, ry: 3.5, anim: 'cs-shark1', dur: 9,  dl: 0 },
  { x: 316, fy: WL+26, ty: WL+19, hw: 8,  rx: 9,  ry: 3.0, anim: 'cs-shark2', dur: 13, dl: 4 },
  { x: 236, fy: WL+24, ty: WL+16, hw: 8,  rx: 10, ry: 3.2, anim: 'cs-shark3', dur: 11, dl: 2 },
  { x: 292, fy: WL+30, ty: WL+22, hw: 7,  rx: 8,  ry: 2.8, anim: 'cs-shark4', dur: 15, dl: 7 },
  { x: 340, fy: WL+22, ty: WL+15, hw: 8,  rx: 9,  ry: 3.0, anim: 'cs-shark5', dur: 10, dl: 5 },
]

const SNOW_FLAKES: [number, number][] = [
  [45,5],[100,12],[160,3],[220,8],[280,14],[335,6],
  [70,20],[130,25],[190,18],[250,22],[305,28],
  [20,35],[85,40],[145,32],[205,38],[265,44],[320,36],
  [50,50],[115,55],[175,48],[235,52],
]

export function CoastalScene({ weather = 'clear' }: CoastalSceneProps) {
  const [tod, setTod] = useState<TimeOfDay>(getTimeOfDay())
  const salesRaw = useKpiStore(s => s.sales)
  const tiles    = useKpiStore(s => s.tiles)
  const sales    = salesRaw?.value ?? 0

  // KPI scores 1–8 (8 = excellent)
  const laborScore = tiles.find(t => t.key === 'labor')?.score    ?? 5
  const primeScore = tiles.find(t => t.key === 'prime')?.score    ?? 5
  const expScore   = tiles.find(t => t.key === 'fixed')?.score ?? 5
  const revScore   = tiles.find(t => t.key === 'reviews')?.score  ?? 5
  const socScore   = tiles.find(t => t.key === 'social')?.score   ?? 5

  useEffect(() => {
    const id = setInterval(() => setTod(getTimeOfDay()), 60_000)
    return () => clearInterval(id)
  }, [])

  const isWind    = weather === 'wind'
  const isNight   = tod === 'night'
  const isSundown = tod === 'sundown'
  const isDawn    = tod === 'dawn'

  const [s1, s2, s3] = SKY[tod]
  const [w1, w2, w3] = WATER[tod]
  const hz  = HORIZON[tod]
  const sun = SUN[tod]
  const cOp = CLOUD_OPACITY[tod]
  const [rC, rM, rD] = ROCK_COLORS[tod]
  // Clouds read warm-cream at golden hours so they don't go pink over orange sky
  const cc  = isNight ? '#1A2A3A' : weather === 'cloudy' ? '#8AAABB' : (isSundown || isDawn) ? '#FFE8CC' : 'white'
  // 4th sky gradient stop — dark purple crown for sundown/dawn
  const skyDeepTop = SKY_DEEP_TOP[tod] ?? null

  // Sales → waves
  const amp   = wAmp(sales) + (isWind ? 8 : 0)
  const spd1  = wSpd(sales, isWind ? 2.1 : 4.4, isWind)
  const spd2  = wSpd(sales, isWind ? 1.6 : 3.4, isWind)
  const spd3  = wSpd(sales, isWind ? 2.7 : 5.5, isWind)
  const sc01  = Math.min(sales / 20000, 1)
  const foamOp   = (.06 + sc01 * .3).toFixed(2)
  const spraySpd = (isWind ? 1.0 : Math.max(.7, 2.2 - sc01 * 1.4)).toFixed(1)
  const sprayOp  = Math.min(.92, sc01 * .8 + .1).toFixed(2)

  const skyTop = weather === 'cloudy' ? '#5A7888' : s1
  const skyMid = weather === 'cloudy' ? '#7A9AAA' : s2
  const skyBot = weather === 'cloudy' ? '#98B4BE' : s3

  const lx    = 52
  const lBase = WL

  // Labor → birds: high labor % (bad score) = more birds. 3 (good) → 20 (bad).
  const birdCount = isNight ? 0 : Math.round(3 + (8 - laborScore) / 7 * 17)

  // Weather → water mood tint (always blue-family, layered over time-of-day base)
  const WEATHER_WATER_TINT: Record<WeatherCondition, { color: string; op: number }> = {
    clear:  { color: '#40C8E0', op: isNight ? 0 : (isSundown || isDawn ? 0.04 : 0.08) }, // bright Caribbean shimmer
    cloudy: { color: '#2A4860', op: 0.14 }, // cool steel-blue, overcast flat
    rain:   { color: '#1A3050', op: 0.22 }, // dark blue-gray, heavy
    wind:   { color: '#0E2040', op: 0.20 }, // deep navy, foreboding
    snow:   { color: '#B8D4F0', op: 0.16 }, // icy pale blue
  }
  const wt = WEATHER_WATER_TINT[weather]

  // Prime Cost → lighthouse beam intensity
  const primeNorm = (primeScore - 1) / 7
  const beamOp    = 0.04 + primeNorm * 0.22

  // Reviews → balloon altitude (high score = flies higher = lower Y value)
  const revNorm = (revScore - 1) / 7
  const bx      = 195
  const by      = Math.round(14 + (1 - revNorm) * 44)  // 14 (excellent) → 58 (critical)

  // Expenses → sharks: 0 = good (no sharks), 5 = bad (5 sharks).
  const SHARK_COUNT_MAP = [0, 5, 5, 4, 3, 2, 1, 0, 0]
  const sharkCount = SHARK_COUNT_MAP[expScore] ?? 0
  const sharkOp = isNight ? 0.5 : 0.75

  // Social → dolphins (active + frequency when good)
  const socNorm       = (socScore - 1) / 7
  const dolphinActive = socScore >= 3
  const dolphinOp     = dolphinActive ? (.45 + socNorm * .5) : 0
  const dolphinSpd    = dolphinActive ? (socScore >= 6 ? 4.5 : socScore >= 4 ? 7.5 : 12) : 99

  return (
    <div className="coastal-scene" style={{ width: '100%', aspectRatio: '375 / 200', overflow: 'hidden', display: 'block' }}>
      <style>{SCENE_CSS}</style>
      <svg viewBox="0 0 375 200" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={{ display: 'block' }}>
        <defs>
          <linearGradient id="cs-sky" x1="0" y1="0" x2="0" y2="1">
            {skyDeepTop && <stop offset="0%"  stopColor={skyDeepTop} />}
            <stop offset={skyDeepTop ? "18%" : "0%"}  stopColor={skyTop} />
            <stop offset={skyDeepTop ? "58%" : "52%"} stopColor={skyMid} />
            <stop offset="100%" stopColor={skyBot} />
          </linearGradient>
          <linearGradient id="cs-haze" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={hz} stopOpacity={0} />
            <stop offset="100%" stopColor={hz} stopOpacity={0.52} />
          </linearGradient>
          <linearGradient id="cs-water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={w1} />
            <stop offset="45%"  stopColor={w2} />
            <stop offset="100%" stopColor={w3} />
          </linearGradient>
          <linearGradient id="cs-sheen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="white" stopOpacity={isWind ? .14 : .07} />
            <stop offset="100%" stopColor="white" stopOpacity={0} />
          </linearGradient>
          <clipPath id="cs-clip"><rect width="375" height="200" /></clipPath>
        </defs>
        <g clipPath="url(#cs-clip)">

          {/* Sky */}
          <rect width="375" height="200" fill="url(#cs-sky)" />

          {/* Stars (night only) */}
          {isNight && STARS.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y}
              r={i % 6 === 0 ? 1.2 : .75} fill="white"
              opacity={.5 + .3 * (i % 3) / 2}
              style={{ animation: `cs-twink ${1.8+(i%4)*.45}s ease-in-out infinite ${i*.15}s` }} />
          ))}

          {/* Sun / Moon */}
          {sun.moon ? (
            <>
              <circle cx={sun.x} cy={sun.y} r={sun.r}       fill={sun.c} opacity={.9} />
              <circle cx={sun.x+5} cy={sun.y-3} r={sun.r-2} fill={s1} />
            </>
          ) : (
            <>
              {/* Extra wide atmospheric haze at golden hours */}
              {(isSundown || isDawn) && (
                <>
                  <circle cx={sun.x} cy={sun.y} r={sun.r+55} fill={sun.c} opacity={.03} />
                  <circle cx={sun.x} cy={sun.y} r={sun.r+35} fill={sun.c} opacity={.05} />
                  <circle cx={sun.x} cy={sun.y} r={sun.r+20} fill={sun.g} opacity={.09} />
                  {/* Horizon glow band */}
                  <ellipse cx={sun.x} cy={WL} rx={120} ry={22} fill={sun.c} opacity={.10} />
                  <ellipse cx={sun.x} cy={WL} rx={80}  ry={12} fill={sun.c} opacity={.08} />
                </>
              )}
              <circle cx={sun.x} cy={sun.y} r={sun.r+10} fill={sun.g} opacity={.14} />
              <circle cx={sun.x} cy={sun.y} r={sun.r+5}  fill={sun.g} opacity={.12} />
              <circle cx={sun.x} cy={sun.y} r={sun.r}    fill={sun.c} opacity={.95} />
            </>
          )}

          {/* Clouds */}
          <g style={{ animation: `cs-drift1 14s ease-in-out infinite` }} opacity={cOp}>
            <ellipse cx="260" cy="28" rx="50" ry="13" fill={cc} opacity={.44} />
            <ellipse cx="244" cy="31" rx="34" ry="9"  fill={cc} opacity={.34} />
            <ellipse cx="280" cy="30" rx="28" ry="8"  fill={cc} opacity={.32} />
          </g>
          <g style={{ animation: `cs-drift2 20s ease-in-out infinite 5s` }} opacity={cOp * .75}>
            <ellipse cx="340" cy="22" rx="38" ry="10" fill={cc} opacity={.36} />
            <ellipse cx="326" cy="24" rx="26" ry="7"  fill={cc} opacity={.28} />
          </g>
          {weather === 'cloudy' && (
            <>
              <g style={{ animation: `cs-drift1 8s ease-in-out infinite` }} opacity={.82}>
                <ellipse cx="200" cy="36" rx="80" ry="22" fill={cc} opacity={.5} />
                <ellipse cx="178" cy="40" rx="55" ry="16" fill={cc} opacity={.4} />
                <ellipse cx="228" cy="38" rx="50" ry="15" fill={cc} opacity={.36} />
              </g>
              <g style={{ animation: `cs-drift2 12s ease-in-out infinite 2s` }} opacity={.7}>
                <ellipse cx="100" cy="56" rx="65" ry="18" fill={cc} opacity={.4} />
                <ellipse cx="76"  cy="60" rx="42" ry="12" fill={cc} opacity={.33} />
              </g>
            </>
          )}

          {/* Rain */}
          {weather === 'rain' && RAIN_DROPS.map(([x, y], i) => (
            <line key={i} x1={x} y1={y} x2={x+5} y2={y+14}
              stroke="rgba(180,210,240,0.55)" strokeWidth={.8}
              style={{ animation: `cs-rain ${.6+(i%4)*.15}s linear infinite ${(i*.11)%1}s` }} />
          ))}

          {/* Snow */}
          {weather === 'snow' && SNOW_FLAKES.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y}
              r={i%4===0 ? 2.2 : i%3===0 ? 1.6 : 1.1} fill="rgba(255,255,255,0.75)"
              style={{ animation: `cs-snow ${2.2+(i%5)*.4}s ease-in-out infinite ${(i*.18)%2}s` }} />
          ))}

          {/* Wind lines */}
          {weather === 'wind' && [[10,42,80],[5,59,60],[8,74,90],[6,52,70],[7,66,50]].map(([h,y,len],i) => (
            <line key={i} x1={-60} y1={y} x2={-60+len} y2={y}
              stroke="rgba(255,255,255,0.22)" strokeWidth={h/4} strokeLinecap="round"
              style={{ animation: `cs-wind ${1.2+i*.3}s ease-in-out infinite ${i*.4}s` }} />
          ))}

          {/* Balloon — altitude = Reviews score */}
          <g style={{ animation: `cs-balloon 5s ease-in-out infinite`, transformOrigin: `${bx}px ${by+28}px` }}
             opacity={isNight ? .4 : .88}>
            <ellipse cx={bx}    cy={by+13} rx="19" ry="23" fill="#7BBFAA" />
            <path d={`M${bx-19},${by+13} Q${bx},${by-11} ${bx+19},${by+13}`} fill="#5BA090" opacity={.55} />
            <path d={`M${bx-19},${by+13} Q${bx},${by+37} ${bx+19},${by+13}`} fill="#4A9080" opacity={.38} />
            <line x1={bx-19} y1={by+13} x2={bx+19} y2={by+13} stroke="rgba(44,58,53,0.18)" strokeWidth={.7} />
            <line x1={bx}    y1={by-9}  x2={bx}    y2={by+36} stroke="rgba(44,58,53,0.18)" strokeWidth={.7} />
            <line x1={bx-13} y1={by+34} x2={bx-8}  y2={by+42} stroke="#8A7A60" strokeWidth={.9} />
            <line x1={bx+13} y1={by+34} x2={bx+8}  y2={by+42} stroke="#8A7A60" strokeWidth={.9} />
            <rect x={bx-9} y={by+42} width="18" height="8" rx="2.5" fill="#C09870" />
            <rect x={bx-7} y={by+43} width="14" height="6" rx="2"   fill="#A07848" opacity={.55} />
          </g>

          {/* Birds — Labor score: 3 (good/low labor) → 20 (bad/high labor) */}
          {BIRD_SLOTS.slice(0, birdCount).map((b, i) => (
            <g key={i} style={{ animation: `cs-bfly ${b.spd}s linear infinite ${b.dl}s` }}>
              <path d={`M0,${b.y} Q${3.5*b.s},${b.y-5*b.s} ${7*b.s},${b.y} Q${10.5*b.s},${b.y-5*b.s} ${14*b.s},${b.y}`}
                stroke="#4A6A80" strokeWidth={b.sw} fill="none" strokeLinecap="round" />
            </g>
          ))}

          {/* Horizon haze */}
          <rect x="0" y={WL-28} width="375" height="30" fill="url(#cs-haze)" />

          {/* Reef rock (drawn before water so water covers underwater portion) */}
          <path d={`M12,200 L12,${WL} L18,${WL-1} L24,${WL-1} L30,${WL-2} L38,${WL-2} L44,${WL-2} L52,${WL-2} L60,${WL-2} L66,${WL-1} L72,${WL-1} L78,${WL-1} L84,${WL} L90,${WL-1} L94,${WL} L94,200Z`} fill={rC} />
          <path d={`M16,200 L16,${WL} L22,${WL} L28,${WL-1} L36,${WL-1} L44,${WL-1} L52,${WL-2} L60,${WL-1} L66,${WL-1} L72,${WL-1} L78,${WL} L84,${WL} L90,${WL} L92,${WL} L92,200Z`} fill={rM} />
          <path d={`M22,200 L22,${WL} L30,${WL} L38,${WL-1} L46,${WL-1} L52,${WL-1} L58,${WL-1} L64,${WL-1} L70,${WL} L76,${WL} L82,${WL} L86,200Z`} fill={rD} />
          <path d={`M14,${WL} L20,${WL-2} L24,${WL-1}`} stroke={rC} strokeWidth=".7" fill="none" opacity={.5} />
          <path d={`M80,${WL-1} L86,${WL-2} L92,${WL-1}`} stroke={rC} strokeWidth=".7" fill="none" opacity={.45} />

          {/* Water */}
          <rect x="0" y={WL} width="375" height={200-WL} fill="url(#cs-water)" />
          <rect x="0" y={WL} width="375" height={24}     fill="url(#cs-sheen)" />

          {/* Weather → water mood tint (always blue-family) */}
          {wt.op > 0.01 && (
            <rect x="0" y={WL} width="375" height={200-WL} fill={wt.color} opacity={wt.op} />
          )}

          {/* Sun/dawn reflection on water */}
          {(isSundown || isDawn) && !sun.moon && (
            <ellipse cx={isSundown ? sun.x+30 : sun.x+20} cy={192} rx={55} ry={8} fill={sun.c} opacity={.1} />
          )}

          {/* Waves — amplitude = Sales */}
          <g style={{ animation: `cs-wv1 ${spd1}s ease-in-out infinite` }}>
            <path d={wp1(amp)} fill={w1} opacity={.52} />
          </g>
          <g style={{ animation: `cs-wv2 ${spd2}s ease-in-out infinite .6s` }}>
            <path d={wp2(amp)} fill={w1} opacity={isWind ? .52 : .4} />
          </g>
          <g style={{ animation: `cs-wv3 ${spd3}s ease-in-out infinite 1.2s` }}>
            <path d={wp3(amp)} fill={w2} opacity={isWind ? .46 : .36} />
          </g>

          {/* Foam lines */}
          <path d={`M100,${WL-Math.round(amp*.15)} C140,${WL-Math.round(amp*.3)} 180,${WL+Math.round(amp*.15)} 220,${WL-Math.round(amp*.15)} C260,${WL-Math.round(amp*.3)} 300,${WL+Math.round(amp*.15)} 340,${WL-Math.round(amp*.15)} C360,${WL-Math.round(amp*.2)} 372,${WL+Math.round(amp*.1)} 375,${WL}`}
            stroke="white" strokeWidth={.6+sc01*.7} fill="none" opacity={foamOp} />
          <path d={`M100,${WL+14-Math.round(amp*.1)} C145,${WL+14-Math.round(amp*.2)} 195,${WL+14+Math.round(amp*.12)} 245,${WL+14-Math.round(amp*.1)} C295,${WL+14-Math.round(amp*.2)} 340,${WL+14+Math.round(amp*.12)} 375,${WL+14}`}
            stroke="white" strokeWidth={.6} fill="none" opacity={(parseFloat(foamOp)*.55).toFixed(2)} />

          {/* Sharks — Expenses: 0 = good (no sharks), 5 = critical (5 sharks) */}
          {SHARK_DEFS.slice(0, sharkCount).map((sk, i) => (
            <g key={i} style={{ animation: `${sk.anim} ${sk.dur}s ease-in-out infinite ${sk.dl}s` }} opacity={sharkOp}>
              <path d={`M${sk.x},${sk.fy} L${sk.x+sk.hw},${sk.ty} L${sk.x+sk.hw*2},${sk.fy}`}
                fill={isNight ? '#0A2030' : '#1A3A50'} />
              <ellipse cx={sk.x+sk.hw} cy={sk.fy+1} rx={sk.rx} ry={sk.ry}
                fill={isNight ? '#0A2030' : '#1A3A50'} opacity={.32} />
            </g>
          ))}

          {/* Sailboat */}
          <g style={{ animation: `cs-bob 5.5s ease-in-out infinite` }}>
            <rect x="148" y={WL+9}  width="24" height="8" rx="3.5" fill="#C09870" opacity={.88} />
            <line x1="159" y1={WL+9} x2="159" y2={WL-10} stroke="#8A6840" strokeWidth="1.3" />
            <path d={`M159,${WL-8} L174,${WL+5} L159,${WL+9}Z`}  fill="#F0EDE4" opacity={.9} />
            <path d={`M159,${WL-5} L146,${WL+5} L159,${WL+9}Z`}  fill="#E4E0D8" opacity={.65} />
          </g>

          {/* Dolphins — Social score (active + frequency when good) */}
          {dolphinActive && (
            <>
              <g transform={`translate(298, ${WL})`}
                 style={{ animation: `cs-dolphin ${dolphinSpd}s ease-in-out infinite 1s`, transformOrigin: '12px 0px' }}
                 opacity={dolphinOp}>
                <path d="M0,0 Q8,-22 18,-14 Q24,-7 20,0"  fill="#2A7090" />
                <path d="M10,-15 L14,-24 L18,-16"          fill="#1A5070" />
                <path d="M0,0 L-5,6"  stroke="#2A7090" strokeWidth="2.2" strokeLinecap="round" />
                <path d="M0,0 L-3,9"  stroke="#2A7090" strokeWidth="2.2" strokeLinecap="round" />
              </g>
              {socScore >= 6 && (
                <g transform={`translate(328, ${WL})`}
                   style={{ animation: `cs-dolphin2 ${(dolphinSpd*.78).toFixed(1)}s ease-in-out infinite 3.2s`, transformOrigin: '10px 0px' }}
                   opacity={dolphinOp * .72}>
                  <path d="M0,0 Q7,-18 15,-11 Q20,-5 17,0" fill="#2A7090" />
                  <path d="M8,-12 L11,-20 L15,-13"          fill="#1A5070" />
                  <path d="M0,0 L-4,5"  stroke="#2A7090" strokeWidth="2" strokeLinecap="round" />
                  <path d="M0,0 L-2,8"  stroke="#2A7090" strokeWidth="2" strokeLinecap="round" />
                </g>
              )}
            </>
          )}

          {/* Rock spray */}
          <g style={{ animation: `cs-sprayl ${spraySpd}s ease-in-out infinite` }}>
            <path d={`M8,${WL-4-Math.round(amp*.25)} Q14,${WL-13-Math.round(amp*.45)} 20,${WL-8-Math.round(amp*.2)}`}
              stroke="white" strokeWidth={.8+sc01*.9} fill="none" strokeLinecap="round" opacity={sprayOp} />
            <path d={`M6,${WL-2} Q14,${WL-13-Math.round(amp*.4)} 22,${WL-6}Z`}
              fill="white" opacity={(parseFloat(sprayOp)*.6).toFixed(2)} />
            <circle cx="12" cy={WL-14-Math.round(amp*.4)} r={.8+sc01*1.2}
              fill="white" opacity={(parseFloat(sprayOp)*.7).toFixed(2)} />
          </g>
          <g style={{ animation: `cs-spray ${spraySpd}s ease-in-out infinite .7s` }}>
            <path d={`M88,${WL-5-Math.round(amp*.2)} Q94,${WL-13-Math.round(amp*.38)} 100,${WL-8}`}
              stroke="white" strokeWidth={.7+sc01*.7} fill="none" strokeLinecap="round"
              opacity={(parseFloat(sprayOp)*.85).toFixed(2)} />
            <circle cx="96" cy={WL-15-Math.round(amp*.35)} r={.7+sc01}
              fill="white" opacity={(parseFloat(sprayOp)*.6).toFixed(2)} />
          </g>
          <g style={{ animation: `cs-spray2 ${spraySpd}s ease-in-out infinite 1.5s` }}>
            <circle cx="22" cy={WL-10-Math.round(amp*.3)} r={.6+sc01*.9}
              fill="white" opacity={(parseFloat(sprayOp)*.5).toFixed(2)} />
            <circle cx="82" cy={WL-9-Math.round(amp*.25)} r={.5+sc01*.8}
              fill="white" opacity={(parseFloat(sprayOp)*.45).toFixed(2)} />
          </g>

          {/* Lighthouse — beam intensity = Prime Cost score */}
          <g>
            <g style={{ transformOrigin: `${lx}px ${lBase}px`, animation: `cs-beam 4s ease-in-out infinite` }}>
              <path d={`M${lx},${lBase} L${lx-36},${lBase-38} L${lx+36},${lBase-38}Z`}
                fill="#FFFDE0" opacity={beamOp} />
            </g>
            <path d={`M${lx-8},${lBase} L${lx-6},${lBase-36} L${lx+6},${lBase-36} L${lx+8},${lBase}Z`} fill="#D0C8B0" />
            <rect x={lx-7}  y={lBase-7}  width="14" height="8"  fill="#C0B8A8" />
            <rect x={lx-6}  y={lBase-14} width="12" height="8"  fill="#C8C0B0" />
            <rect x={lx-7}  y={lBase-8}  width="2"  height="6"  fill="#AEA898" opacity={.6} />
            <rect x={lx+5}  y={lBase-8}  width="2"  height="6"  fill="#AEA898" opacity={.6} />
            <rect x={lx-5}  y={lBase-22} width="10" height="9" rx="1" fill="#A8A898" />
            <rect x={lx-6}  y={lBase-27} width="12" height="6" rx="1" fill="#C8C0A8" />
            <rect x={lx-7}  y={lBase-31} width="14" height="5" rx="1" fill="#B8B0A0" />
            <circle cx={lx} cy={lBase-30} r="4.5" fill="#F5E07A" />
            <circle cx={lx} cy={lBase-30} r="7.5" fill="#FFFDE0" opacity={.24} />
            <rect x={lx-9} y={lBase} width="18" height="3" rx="1" fill="#A8A090" />
          </g>

          {/* Bottom water depth */}
          <rect x="0" y="192" width="375" height="8" fill={w3} opacity={.5} />

          {/* & — self-drawing stroke intro, fades completely, never returns */}
          {/* pathLength="1" normalizes so dasharray/offset math is unit-based */}
          <g>
            <path
              d="M206,70 C206,55 195,46 180,46 C163,46 150,60 150,77 C150,93 162,102 180,108 C195,115 158,130 152,150 C148,166 160,176 176,176 C195,176 214,164 213,147 C218,140 225,133 232,126"
              pathLength="1"
              fill="none" stroke="white" strokeWidth="22"
              strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray="1" strokeDashoffset="1"
              opacity="0.13"
              style={{ animation: 'cs-amp-draw 3.8s ease-in-out forwards' }}
            />
            <path
              d="M206,70 C206,55 195,46 180,46 C163,46 150,60 150,77 C150,93 162,102 180,108 C195,115 158,130 152,150 C148,166 160,176 176,176 C195,176 214,164 213,147 C218,140 225,133 232,126"
              pathLength="1"
              fill="none" stroke="white" strokeWidth="5.5"
              strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray="1" strokeDashoffset="1"
              style={{ animation: 'cs-amp-draw 3.8s ease-in-out forwards' }}
            />
          </g>

          {/* &done — painter's signature, bottom-right corner, always there */}
          <text
            x="368"
            y="193"
            textAnchor="end"
            fill="#ffffff"
            fontFamily="'Manrope', sans-serif"
            fontSize="8"
            fontWeight="600"
            letterSpacing="1.5"
            opacity={isNight ? 0.28 : 0.18}
          >
            &amp;done
          </text>

        </g>
      </svg>
    </div>
  )
}

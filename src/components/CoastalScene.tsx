import { useEffect, useState } from 'react'
import { useKpiStore } from '../stores/useKpiStore'
import { tileForScore } from '../theme/skins'
import { FEED_SCORES } from '../data/feedScores'

type TimeOfDay = 'dawn' | 'morning' | 'afternoon' | 'sundown' | 'night'
export type WeatherCondition = 'clear' | 'cloudy' | 'rain' | 'snow' | 'wind'

interface CoastalSceneProps {
  weather?: WeatherCondition
  /** Bump this number to retrigger the big lighthouse sweep (mount, KPI refresh, pull-to-refresh). */
  beamPulseKey?: number
}

// NOAA-style sunrise/sunset in local clock hours. DST-aware via
// getTimezoneOffset. Good to within a few minutes for DC at our scale —
// way better than hardcoded 5pm–8pm sundown year-round.
const GCDC_LAT =  38.90
const GCDC_LON = -77.04
function sunTimes(date: Date, lat = GCDC_LAT, lon = GCDC_LON): { sunrise: number; sunset: number } {
  const rad = Math.PI / 180
  const deg = 180 / Math.PI
  const yearStart = new Date(date.getFullYear(), 0, 0).getTime()
  const n = Math.floor((date.getTime() - yearStart) / 86400000)           // day of year
  const decl = 23.44 * Math.sin(rad * (360 / 365.25) * (n - 81))          // solar declination
  const cosH = -Math.tan(rad * lat) * Math.tan(rad * decl)
  if (cosH > 1)  return { sunrise: 24, sunset: 24 }                       // polar night
  if (cosH < -1) return { sunrise: 0,  sunset: 24 }                       // midnight sun
  const hourAngle = Math.acos(cosH) * deg / 15                            // half-day length in hours
  const B = rad * (360 / 365) * (n - 81)
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B) // equation of time, min
  const noonUTC = 12 - lon / 15
  const noonLocal = noonUTC - eot / 60 - date.getTimezoneOffset() / 60
  return { sunrise: noonLocal - hourAngle, sunset: noonLocal + hourAngle }
}

function getTimeOfDay(d = new Date()): TimeOfDay {
  const h = d.getHours() + d.getMinutes() / 60
  const { sunrise, sunset } = sunTimes(d)
  // Dawn: 1h before sunrise → 1h after (the warm glow window)
  if (h >= sunrise - 1    && h < sunrise + 1  ) return 'dawn'
  // Morning: post-dawn through noon
  if (h >= sunrise + 1    && h < 12           ) return 'morning'
  // Afternoon: noon until golden hour kicks in (~1h before sunset)
  if (h >= 12             && h < sunset - 1   ) return 'afternoon'
  // Sundown: golden hour + first 30min of civil twilight
  if (h >= sunset - 1     && h < sunset + 0.5 ) return 'sundown'
  return 'night'
}

const SKY: Record<TimeOfDay, [string, string, string]> = {
  dawn:      ['#C87848', '#F4A870', '#F8DDB8'],
  morning:   ['#6AAED4', '#94CAE0', '#C0E0EE'],
  afternoon: ['#4A90C8', '#78B4D8', '#AADCEE'],
  sundown:   ['#C84828', '#E87840', '#F4A860'],
  night:     ['#142042', '#1A2E58', '#243E6E'],
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
  night:     '#1E3458',
}

const WATER: Record<TimeOfDay, [string, string, string]> = {
  dawn:      ['#5A7E98', '#2E5470', '#102840'],  // slate-blue pre-dawn
  morning:   ['#4A9AB8', '#2A7898', '#0E4E6E'],  // clear bright teal-blue
  afternoon: ['#3A8EB8', '#1A6898', '#0A4068'],  // deep clean blue
  sundown:   ['#3A6A8A', '#1A4868', '#0A2848'],  // dusky navy — stays blue
  night:     ['#18304A', '#10243A', '#081828'],  // deep moonlit navy (not pitch black)
}

const SUN: Record<TimeOfDay, { x: number; y: number; r: number; c: string; g: string; moon: boolean }> = {
  dawn:      { x: 42,  y: 74, r: 18, c: '#FFAA44', g: '#FF8822', moon: false },
  morning:   { x: 290, y: 28, r: 17, c: '#FFFDE0', g: '#FFF0A0', moon: false },
  afternoon: { x: 230, y: 20, r: 16, c: '#FFF8C0', g: '#FFFDE0', moon: false },
  sundown:   { x: 34,  y: 62, r: 20, c: '#FF6622', g: '#FF4400', moon: false },
  night:     { x: 316, y: 30, r: 15, c: '#F7E49A', g: '#F4D472', moon: true  },
}

/**
 * Returns lunar phase 0–1 for the given date.
 *   0.00 / 1.00 = new moon
 *   0.25        = first quarter (waxing, right half lit)
 *   0.50        = full moon
 *   0.75        = last quarter (waning, left half lit)
 * Accurate to within a day using the synodic-month mean cycle.
 */
function moonPhase(date = new Date()): number {
  const SYNODIC = 29.53058867
  // Known new moon: 2000-01-06 18:14 UTC → JD 2451550.26
  const KNOWN_NEW_JD = 2451550.26
  const jd = date.getTime() / 86400000 + 2440587.5
  const days = (((jd - KNOWN_NEW_JD) % SYNODIC) + SYNODIC) % SYNODIC
  return days / SYNODIC
}

/**
 * SVG path for the illuminated portion of the moon at the given phase,
 * centered at (cx,cy) with radius r.
 */
function moonLitPath(cx: number, cy: number, r: number, phase: number): string {
  const f = (1 - Math.cos(2 * Math.PI * phase)) / 2 // illuminated fraction 0–1
  const waxing = phase < 0.5
  const rxTerm = r * Math.abs(1 - 2 * f)
  const outerSweep = waxing ? 1 : 0
  const termSweep  = (f > 0.5) === waxing ? outerSweep : 1 - outerSweep
  return [
    `M ${cx},${cy - r}`,
    `A ${r},${r} 0 0,${outerSweep} ${cx},${cy + r}`,
    `A ${rxTerm},${r} 0 0,${termSweep} ${cx},${cy - r}`,
    'Z',
  ].join(' ')
}


const CLOUD_OPACITY: Record<TimeOfDay, number> = {
  dawn: .50, morning: .65, afternoon: .52, sundown: .36, night: .12,
}

const ROCK_COLORS: Record<TimeOfDay, [string, string, string]> = {
  dawn:      ['#505A62', '#3E484E', '#303840'],
  morning:   ['#545E66', '#424C54', '#323A40'],
  afternoon: ['#545E66', '#424C54', '#323A40'],
  sundown:   ['#4A4440', '#38343A', '#2A2628'],
  night:     ['#2E3E54', '#243148', '#182238'],
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
@keyframes cs-beam{0%{transform:rotate(-72deg)}100%{transform:rotate(-8deg)}}
@keyframes cs-beam-core{0%{transform:rotate(-70deg)}100%{transform:rotate(-10deg)}}
@keyframes cs-beam-pulse{0%,100%{opacity:.9}50%{opacity:1}}
@keyframes cs-beam-fade{0%,60%{opacity:1}100%{opacity:0}}
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
@keyframes cs-jelly{0%,100%{transform:translateY(0) scaleY(1)}50%{transform:translateY(-6px) scaleY(.88)}}
@keyframes cs-jelly-drift{0%{transform:translateX(0)}100%{transform:translateX(60px)}}
@keyframes cs-jelly-pulse{0%,100%{opacity:.45}50%{opacity:.85}}
@keyframes cs-amp-fade{0%{opacity:0}15%{opacity:0.92}65%{opacity:0.92}100%{opacity:0}}
@keyframes cs-drift-r{0%{transform:translateX(-110px)}100%{transform:translateX(470px)}}
@keyframes cs-drift-l{0%{transform:translateX(470px)}100%{transform:translateX(-110px)}}
@keyframes cs-moon-glow{0%,100%{opacity:.14}50%{opacity:.26}}
@keyframes cs-moon-halo{0%,100%{opacity:.05;transform:scale(1)}50%{opacity:.09;transform:scale(1.06)}}
@keyframes cs-sun-spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
@keyframes cs-sun-pulse{0%,100%{opacity:.18;transform:scale(1)}50%{opacity:.32;transform:scale(1.08)}}
@keyframes cs-sun-shimmer{0%,100%{opacity:.55}50%{opacity:.95}}
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

// ─── Boats ──────────────────────────────────────────────────────────
type BoatKey =
  | 'sailboat' | 'cruise_ship' | 'yacht' | 'pirate_ship' | 'ghost_ship'
  | 'oil_tanker' | 'cargo_freighter' | 'crowded_rowboat' | 'party_boat'
  | 'speedboat' | 'kayak' | 'fishing_boat' | 'jet_ski'

// Positive = sits deeper; negative = rides higher on water
const BOAT_Y_OFFSET: Record<BoatKey, number> = {
  sailboat: 0, cruise_ship: -3, yacht: 0, pirate_ship: -2, ghost_ship: -2,
  oil_tanker: -4, cargo_freighter: -3, crowded_rowboat: 2, party_boat: -1,
  speedboat: 1, kayak: 2, fishing_boat: 0, jet_ski: 1,
}

function renderBoat(key: BoatKey, isNight: boolean) {
  switch (key) {
    case 'sailboat':
      return (
        <g>
          <rect x={-12} y={1} width={24} height={8} rx={3.5} fill="#C09870" opacity={.88} />
          <line x1={0} y1={1} x2={0} y2={-19} stroke="#8A6840" strokeWidth={1.3} />
          <path d="M0,-17 L15,-3 L0,1 Z" fill="#F0EDE4" opacity={.92} />
          <path d="M0,-14 L-13,-3 L0,1 Z" fill="#E4E0D8" opacity={.65} />
        </g>
      )
    case 'cruise_ship':
      return (
        <g>
          <rect x={-35} y={0} width={70} height={7} rx={2} fill="#F8F8F4" />
          <rect x={-32} y={-9} width={60} height={9} fill="#FFFFFF" />
          <rect x={-24} y={-16} width={40} height={7} fill="#F0F0EA" />
          {Array.from({ length: 10 }).map((_, i) => (
            <rect key={i} x={-30 + i * 6} y={-6} width={3} height={2} fill="#2A6090" />
          ))}
          {Array.from({ length: 6 }).map((_, i) => (
            <rect key={`t${i}`} x={-22 + i * 6} y={-13} width={3} height={2} fill="#2A6090" />
          ))}
          <rect x={8}  y={-22} width={3} height={6} fill="#C04040" />
          <rect x={14} y={-22} width={3} height={6} fill="#C04040" />
          <rect x={-32} y={7} width={64} height={2} fill="#2A3A4A" opacity={.6} />
        </g>
      )
    case 'yacht':
      return (
        <g>
          <path d="M-18,1 L17,1 L14,8 L-14,8 Z" fill="#F8F6EE" />
          <rect x={-10} y={-6} width={18} height={7} rx={1} fill="#E8E4D8" />
          <rect x={-7} y={-4} width={3} height={3} fill="#6090B0" />
          <rect x={-2} y={-4} width={3} height={3} fill="#6090B0" />
          <rect x={3}  y={-4} width={3} height={3} fill="#6090B0" />
          <line x1={-2} y1={-6} x2={-2} y2={-14} stroke="#888" strokeWidth={.8} />
        </g>
      )
    case 'pirate_ship':
      return (
        <g>
          <path d="M-20,1 Q-22,8 -14,10 L14,10 Q22,8 20,1 Z" fill="#3A2818" />
          <rect x={-18} y={-2} width={36} height={4} fill="#5A3A24" />
          <line x1={-8} y1={-2} x2={-8} y2={-26} stroke="#2A1808" strokeWidth={1.3} />
          <line x1={8}  y1={-2} x2={8}  y2={-22} stroke="#2A1808" strokeWidth={1.3} />
          <path d="M-8,-24 L-18,-11 L-8,-8 Z" fill="#1A1A1A" opacity={.88} />
          <path d="M8,-20 L17,-9 L8,-6 Z" fill="#2A1A1A" opacity={.88} />
          <rect x={-9} y={-26} width={6} height={4} fill="#1A1A1A" />
          <circle cx={-6} cy={-24} r={1} fill="#FFF" />
        </g>
      )
    case 'ghost_ship':
      return (
        <g opacity={isNight ? .7 : .5}>
          <path d="M-20,1 Q-22,8 -14,10 L14,10 Q22,8 20,1 Z" fill="#9AB8C8" />
          <line x1={-6} y1={1} x2={-6} y2={-22} stroke="#B8CCD8" strokeWidth={1.1} />
          <line x1={8}  y1={1} x2={8}  y2={-18} stroke="#B8CCD8" strokeWidth={1.1} />
          <path d="M-6,-20 L-16,-8 L-6,-6 Z" fill="#E0EAF0" opacity={.55} />
          <path d="M8,-16 L16,-6 L8,-4 Z"    fill="#E0EAF0" opacity={.55} />
          <ellipse cx={0} cy={3} rx={22} ry={3} fill="#C8D8E0" opacity={.35} />
        </g>
      )
    case 'oil_tanker':
      return (
        <g>
          <rect x={-42} y={0} width={84} height={9} fill="#1E1E1E" />
          <rect x={-40} y={-4} width={80} height={4} fill="#2E2E2E" />
          <circle cx={-24} cy={-7} r={4} fill="#555" />
          <circle cx={-10} cy={-7} r={4} fill="#555" />
          <circle cx={4}   cy={-7} r={4} fill="#555" />
          <circle cx={18}  cy={-7} r={4} fill="#555" />
          <rect x={28} y={-16} width={10} height={12} fill="#404040" />
          <rect x={30} y={-23} width={3}  height={7}  fill="#1A1A1A" />
          <rect x={30} y={-23} width={3}  height={2}  fill="#6A6A6A" />
          <rect x={-40} y={9}  width={80} height={2}  fill="#0A0A0A" opacity={.6} />
        </g>
      )
    case 'cargo_freighter':
      return (
        <g>
          <rect x={-32} y={0}   width={64} height={9} fill="#8A3020" />
          <rect x={-30} y={-10} width={60} height={10} fill="#A04030" />
          {['#4080A0','#A05050','#508060','#C0A040','#804080','#607080','#B08030'].map((c, i) => (
            <rect key={i} x={-28 + i * 8} y={-17} width={7} height={7} fill={c} />
          ))}
          <rect x={24} y={-24} width={7}  height={7} fill="#D8D0C0" />
          <rect x={26} y={-30} width={2}  height={6} fill="#1A1A1A" />
        </g>
      )
    case 'crowded_rowboat':
      return (
        <g>
          <path d="M-14,1 Q-16,8 -10,9 L10,9 Q16,8 14,1 Z" fill="#8A6840" />
          <rect x={-12} y={-1} width={24} height={2} fill="#6A4828" />
          <rect x={-10} y={-4} width={20} height={3} fill="#2A2A28" />
          <circle cx={-8} cy={-5}  r={2.2} fill="#2A2A28" />
          <circle cx={-3} cy={-6}  r={2.2} fill="#2A2A28" />
          <circle cx={2}  cy={-5}  r={2.2} fill="#2A2A28" />
          <circle cx={7}  cy={-6}  r={2.2} fill="#2A2A28" />
          <line x1={-14} y1={-1} x2={-21} y2={4} stroke="#6A4828" strokeWidth={1} />
          <line x1={14}  y1={-1} x2={21}  y2={4} stroke="#6A4828" strokeWidth={1} />
        </g>
      )
    case 'party_boat':
      return (
        <g>
          <path d="M-18,1 L18,1 L15,9 L-15,9 Z" fill="#F5D060" />
          <rect x={-14} y={-8} width={28} height={9} rx={1} fill="#F8E890" />
          <rect x={-16} y={-12} width={32} height={3} fill="#E04060" />
          {['#FF4060','#FFD040','#40D0A0','#4080FF','#D040D0'].map((c, i) => (
            <circle key={i} cx={-12 + i * 6} cy={-9.5} r={1} fill={c} />
          ))}
          <rect x={-10} y={-6} width={4} height={4} fill="#2A3A50" />
          <rect x={-3}  y={-6} width={4} height={4} fill="#2A3A50" />
          <rect x={4}   y={-6} width={4} height={4} fill="#2A3A50" />
        </g>
      )
    case 'speedboat':
      return (
        <g>
          <path d="M-14,1 L16,1 L18,4 L14,7 L-10,7 Z" fill="#D03030" />
          <rect x={-10} y={-3} width={16} height={4} rx={1} fill="#F8F8F8" />
          <path d="M-10,-3 L-4,-3 L-4,1 L-10,1 Z" fill="#2A3040" opacity={.7} />
          <path d="M-14,4 Q-22,3 -28,5" stroke="white" strokeWidth={1}   fill="none" opacity={.7} />
          <path d="M-14,6 Q-22,7 -30,7" stroke="white" strokeWidth={.8}  fill="none" opacity={.5} />
        </g>
      )
    case 'kayak':
      return (
        <g>
          <path d="M-14,3 Q-16,6 -10,7 L10,7 Q16,6 14,3 Q0,4 -14,3 Z" fill="#E07030" />
          <circle cx={0} cy={-2} r={2.5} fill="#2A4060" />
          <rect x={-1} y={-1} width={2} height={4} fill="#2A4060" />
          <line x1={-9} y1={-5} x2={9} y2={1} stroke="#6A4828" strokeWidth={.9} />
        </g>
      )
    case 'fishing_boat':
      return (
        <g>
          <path d="M-16,1 Q-18,8 -12,9 L12,9 Q18,8 16,1 Z" fill="#4A6878" />
          <rect x={-6} y={-7} width={10} height={8} fill="#D8D0B8" />
          <rect x={-4} y={-5} width={3}  height={3} fill="#3A5060" />
          <line x1={4}  y1={-7} x2={14} y2={-15} stroke="#2A2A28" strokeWidth={.8} />
          <line x1={14} y1={-15} x2={16} y2={4}  stroke="#2A2A28" strokeWidth={.5} />
        </g>
      )
    case 'jet_ski':
      return (
        <g>
          <path d="M-10,1 L12,1 L14,4 L10,6 L-8,6 Z" fill="#4080D0" />
          <rect x={-4} y={-3} width={6} height={4} fill="#2A3040" />
          <circle cx={-1} cy={-1} r={1.5} fill="#E0C040" />
          <path d="M-10,4 Q-16,3 -22,5" stroke="white" strokeWidth={.8} fill="none" opacity={.6} />
        </g>
      )
  }
}

function pickHero(netScore: number, sales: number): BoatKey {
  if (sales <= 0)       return 'ghost_ship'
  if (netScore >= 7)    return 'cruise_ship'
  if (netScore >= 6)    return 'yacht'
  if (netScore >= 5)    return 'party_boat'
  if (netScore >= 4)    return 'sailboat'
  if (netScore >= 3)    return 'fishing_boat'
  return 'pirate_ship'
}

function pickSecondary(scores: {
  labor: number; prime: number; fixed: number; cogs: number
}): BoatKey {
  const entries = (Object.entries(scores) as [keyof typeof scores, number][])
    .sort((a, b) => a[1] - b[1])
  const [worstKey, worstScore] = entries[0]
  if (worstScore >= 6) return 'kayak'
  if (worstKey === 'labor') return 'crowded_rowboat'
  if (worstKey === 'cogs')  return 'cargo_freighter'
  if (worstKey === 'fixed') return 'oil_tanker'
  if (worstKey === 'prime') return 'ghost_ship'
  return 'kayak'
}

const AMBIENT_POOL: BoatKey[] = [
  'speedboat', 'jet_ski', 'kayak', 'fishing_boat', 'sailboat', 'yacht',
]
// At night the harbor quiets down — only slow, lit boats stay out.
const NIGHT_POOL: BoatKey[] = ['sailboat', 'fishing_boat', 'yacht']
function pickAmbient(isNight: boolean): BoatKey {
  const pool = isNight ? NIGHT_POOL : AMBIENT_POOL
  return pool[Math.floor(Date.now() / 60000) % pool.length]
}

// Running-lights overlay (port=red, starboard=green, mast=white) drawn on top
// of a boat when the scene is at night. Positions are boat-specific so the
// lights sit where they'd actually be on the real hull/mast.
function renderRunningLights(key: BoatKey) {
  // [mast (x, y), port (x, y), starboard (x, y)] — null to skip a slot.
  const L: Partial<Record<BoatKey, { mast?: [number,number]; port?: [number,number]; stbd?: [number,number] }>> = {
    sailboat:     { mast: [0, -19], port: [-11, 2],  stbd: [11, 2]  },
    fishing_boat: { mast: [14, -15], port: [-15, 2], stbd: [15, 2]  },
    yacht:        { mast: [-2, -14], port: [-16, 0], stbd: [15, 0]  },
    cruise_ship:  { mast: [14, -22], port: [-34, 2], stbd: [34, 2]  },
    cargo_freighter: { mast: [26, -30], port: [-30, 2], stbd: [30, 2] },
    oil_tanker:   { mast: [30, -23], port: [-40, 5], stbd: [40, 5]  },
    pirate_ship:  { mast: [-6, -24], port: [-18, 6], stbd: [18, 6]  },
    party_boat:   { mast: [0, -12], port: [-16, 2], stbd: [16, 2]  },
    speedboat:    { port: [-12, 0], stbd: [14, 0] },
  }
  const l = L[key]
  if (!l) return null
  return (
    <g>
      {l.mast && (
        <>
          <circle cx={l.mast[0]} cy={l.mast[1]} r={2.2} fill="#FFF6C0" opacity={.45} />
          <circle cx={l.mast[0]} cy={l.mast[1]} r={1.1} fill="#FFFFE8" />
        </>
      )}
      {l.port && (
        <>
          <circle cx={l.port[0]} cy={l.port[1]} r={1.9} fill="#FF4848" opacity={.38} />
          <circle cx={l.port[0]} cy={l.port[1]} r={0.9} fill="#FF6666" />
        </>
      )}
      {l.stbd && (
        <>
          <circle cx={l.stbd[0]} cy={l.stbd[1]} r={1.9} fill="#38E078" opacity={.38} />
          <circle cx={l.stbd[0]} cy={l.stbd[1]} r={0.9} fill="#58F090" />
        </>
      )}
    </g>
  )
}

const SNOW_FLAKES: [number, number][] = [
  [45,5],[100,12],[160,3],[220,8],[280,14],[335,6],
  [70,20],[130,25],[190,18],[250,22],[305,28],
  [20,35],[85,40],[145,32],[205,38],[265,44],[320,36],
  [50,50],[115,55],[175,48],[235,52],
]

export function CoastalScene({ weather = 'clear', beamPulseKey = 0 }: CoastalSceneProps) {
  // Lighthouse sweep plays on mount + whenever beamPulseKey changes, then fades
  // back to just the gentle lamp bloom so it isn't distracting in the background.
  const [beamSweeping, setBeamSweeping] = useState(true)
  useEffect(() => {
    setBeamSweeping(true)
    const id = setTimeout(() => setBeamSweeping(false), 2000) // one full 2s sweep
    return () => clearTimeout(id)
  }, [beamPulseKey])

  const [tod, setTod] = useState<TimeOfDay>(getTimeOfDay())
  const salesRaw = useKpiStore(s => s.sales)
  const tiles    = useKpiStore(s => s.tiles)
  const netSt    = useKpiStore(s => s.net)
  const sales    = salesRaw?.value ?? 0

  // KPI scores 1–8 (8 = excellent)
  const laborScore = tiles.find(t => t.key === 'labor')?.score    ?? 5
  const primeScore = tiles.find(t => t.key === 'prime')?.score    ?? 5
  const expScore   = tiles.find(t => t.key === 'fixed')?.score ?? 5
  const cogsScoreT = tiles.find(t => t.key === 'cogs')?.score  ?? 5
  const netProfitScore = netSt?.score ?? 5

  // Boat slot selections (hero/secondary/ambient) — computed after `isNight`
  // is known below so we can swap to a slow lit-boat pool at night.
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

  // At night the harbor quiets down — override all three boat slots to the
  // slow lit-boat pool so speedboats/jet skis don't streak by in the dark.
  const heroBoat      = isNight ? 'sailboat'
                                : pickHero(netProfitScore, sales)
  const secondaryBoat = isNight ? 'fishing_boat'
                                : pickSecondary({
                                    labor: laborScore,
                                    prime: primeScore,
                                    fixed: expScore,
                                    cogs:  cogsScoreT,
                                  })
  const ambientBoat   = pickAmbient(isNight)

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

  // Reviews → balloon color (tracks Reviews chip color in MarqueeFeed)
  const reviewsPalette = tileForScore(FEED_SCORES.reviews)
  const balloonBody    = reviewsPalette.bg     // main fabric color
  const balloonShade   = reviewsPalette.label  // darker underside / shadow

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
          <linearGradient id="cs-beam-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#FFFDE8" stopOpacity={1} />
            <stop offset="35%"  stopColor="#FFFDE0" stopOpacity={0.55} />
            <stop offset="75%"  stopColor="#FFFDE0" stopOpacity={0.15} />
            <stop offset="100%" stopColor="#FFFDE0" stopOpacity={0} />
          </linearGradient>
          <radialGradient id="cs-beam-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#FFFDE0" stopOpacity={0.9} />
            <stop offset="60%"  stopColor="#FFFDE0" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#FFFDE0" stopOpacity={0} />
          </radialGradient>
          <clipPath id="cs-clip"><rect width="375" height="200" /></clipPath>
        </defs>
        <g clipPath="url(#cs-clip)">

          {/* Sky */}
          <rect width="375" height="200" fill="url(#cs-sky)" />

          {/* Stars (night only) — skip any that fall inside/near the moon disc */}
          {isNight && STARS.filter(([x, y]) => {
            const dx = x - sun.x, dy = y - sun.y
            return Math.sqrt(dx*dx + dy*dy) > sun.r + 6
          }).map(([x, y], i) => (
            <circle key={i} cx={x} cy={y}
              r={i % 6 === 0 ? 1.2 : .75} fill="white"
              opacity={.5 + .3 * (i % 3) / 2}
              style={{ animation: `cs-twink ${1.8+(i%4)*.45}s ease-in-out infinite ${i*.15}s` }} />
          ))}

          {/* Sun / Moon */}
          {sun.moon ? (() => {
            const phase    = moonPhase()
            const lit      = moonLitPath(sun.x, sun.y, sun.r, phase)
            const illum    = (1 - Math.cos(2 * Math.PI * phase)) / 2
            const clipId   = 'cs-moon-lit-clip'
            return (
              <g>
                <defs>
                  <clipPath id={clipId}>
                    <path d={lit} />
                  </clipPath>
                  <radialGradient id="cs-moon-grad" cx="55%" cy="55%" r="70%">
                    <stop offset="0%"  stopColor="#FFF4C0" />
                    <stop offset="55%" stopColor={sun.c} />
                    <stop offset="100%" stopColor={sun.g} />
                  </radialGradient>
                </defs>

                {/* Halo / corona — dims with phase so new moon has no glow */}
                <circle cx={sun.x} cy={sun.y} r={sun.r+24}
                  fill="#F8E8A8"
                  opacity={0.05 + illum * 0.12}
                  style={{ animation: 'cs-moon-halo 6s ease-in-out infinite', transformOrigin: `${sun.x}px ${sun.y}px` }} />
                <circle cx={sun.x} cy={sun.y} r={sun.r+12} fill="#F4DC90"
                  opacity={0.04 + illum * 0.10} />
                <circle cx={sun.x} cy={sun.y} r={sun.r+5}  fill="#FFF0B8"
                  opacity={illum * 0.5}
                  style={{ animation: 'cs-moon-glow 4s ease-in-out infinite' }} />

                {/* Dark-side disc (earthshine) — faint so an unlit portion still reads */}
                <circle cx={sun.x} cy={sun.y} r={sun.r}
                  fill="#3A3420" opacity={0.55} />

                {/* Illuminated portion */}
                {illum > 0.01 && (
                  <>
                    <path d={lit} fill="url(#cs-moon-grad)" />
                    {/* Terminator softening — thin gradient-edge shadow along the lit side */}
                    <g clipPath={`url(#${clipId})`}>
                      {/* Craters — only render where lit */}
                      <circle cx={sun.x+sun.r*0.35} cy={sun.y-sun.r*0.10} r={1.6} fill="#C89A30" opacity={.38} />
                      <circle cx={sun.x+sun.r*0.55} cy={sun.y+sun.r*0.30} r={1.9} fill="#C89A30" opacity={.40} />
                      <circle cx={sun.x+sun.r*0.18} cy={sun.y+sun.r*0.55} r={1.3} fill="#C89A30" opacity={.35} />
                      <circle cx={sun.x-sun.r*0.25} cy={sun.y+sun.r*0.10} r={1.1} fill="#C89A30" opacity={.32} />
                      <circle cx={sun.x-sun.r*0.40} cy={sun.y-sun.r*0.30} r={0.9} fill="#C89A30" opacity={.30} />
                      <circle cx={sun.x+sun.r*0.05} cy={sun.y+sun.r*0.15} r={0.9} fill="#C89A30" opacity={.30} />
                      <circle cx={sun.x+sun.r*0.65} cy={sun.y-sun.r*0.05} r={0.8} fill="#C89A30" opacity={.28} />
                      <circle cx={sun.x+sun.r*0.55} cy={sun.y+sun.r*0.22} r={0.35} fill="#FFF6D8" opacity={.55} />
                      <circle cx={sun.x+sun.r*0.35} cy={sun.y-sun.r*0.18} r={0.3}  fill="#FFF6D8" opacity={.5} />
                    </g>
                    {/* Outer rim highlight on the lit curve */}
                    <path d={lit} fill="none" stroke="#FFF8D8" strokeWidth={0.6} opacity={.35} />
                  </>
                )}
              </g>
            )
          })() : (
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

              {/* Bright-day sun rays — morning/afternoon + clear weather only */}
              {weather === 'clear' && !isNight && !isSundown && !isDawn && (
                <g style={{
                  transformOrigin: `${sun.x}px ${sun.y}px`,
                  animation: 'cs-sun-spin 140s linear infinite',
                }}>
                  {Array.from({ length: 12 }).map((_, i) => {
                    const angle = (i * Math.PI) / 6
                    const long = i % 2 === 0
                    const inner = sun.r + 6
                    const outer = sun.r + (long ? 26 : 18)
                    const x1 = sun.x + Math.cos(angle) * inner
                    const y1 = sun.y + Math.sin(angle) * inner
                    const x2 = sun.x + Math.cos(angle) * outer
                    const y2 = sun.y + Math.sin(angle) * outer
                    return (
                      <line
                        key={i}
                        x1={x1} y1={y1} x2={x2} y2={y2}
                        stroke={sun.c}
                        strokeWidth={long ? 2.2 : 1.4}
                        strokeLinecap="round"
                        opacity={long ? .55 : .38}
                        style={{ animation: `cs-sun-shimmer ${2.4 + (i % 4) * 0.3}s ease-in-out infinite ${i * 0.13}s` }}
                      />
                    )
                  })}
                </g>
              )}

              {/* Warm corona — breathes gently on sunny days */}
              {weather === 'clear' && !isNight && (
                <circle cx={sun.x} cy={sun.y} r={sun.r+18} fill={sun.c}
                  style={{
                    transformOrigin: `${sun.x}px ${sun.y}px`,
                    animation: 'cs-sun-pulse 5s ease-in-out infinite',
                  }} />
              )}

              <circle cx={sun.x} cy={sun.y} r={sun.r+10} fill={sun.g} opacity={.14} />
              <circle cx={sun.x} cy={sun.y} r={sun.r+5}  fill={sun.g}
                opacity={(isSundown || isDawn) ? .12 : .22} />
              <circle cx={sun.x} cy={sun.y} r={sun.r}    fill={sun.c} opacity={.96} />
              {/* Bright inner core highlight — bright daylight only (on red sundown sun it reads as a second disc) */}
              {weather === 'clear' && !isSundown && !isDawn && (
                <circle cx={sun.x-sun.r*0.2} cy={sun.y-sun.r*0.2} r={sun.r*0.55}
                  fill="#FFFDF0" opacity={.45} />
              )}
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

          {/* Balloon — altitude = Reviews score, color = Reviews chip color */}
          <g style={{ animation: `cs-balloon 5s ease-in-out infinite`, transformOrigin: `${bx}px ${by+28}px` }}
             opacity={isNight ? .82 : .92}>
            <ellipse cx={bx}    cy={by+13} rx="19" ry="23" fill={balloonBody} />
            <path d={`M${bx-19},${by+13} Q${bx},${by-11} ${bx+19},${by+13}`} fill={balloonShade} opacity={.32} />
            <path d={`M${bx-19},${by+13} Q${bx},${by+37} ${bx+19},${by+13}`} fill={balloonShade} opacity={.48} />
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

          {/* Bioluminescent jellyfish — night-only. Parked deep in the water
              column (viewBox is 200 tall, waves live WL..WL+18) so they sit
              below the wave troughs but well above the bottom edge. Bigger
              and more opaque than the first pass so they actually read. */}
          {isNight && [
            { x:  78, y: 178, hue: '#6AD0FF', size: 1.3, spd: 3.2, drift: 18, dl: 0.0 },
            { x: 168, y: 188, hue: '#B088FF', size: 1.1, spd: 3.8, drift: 22, dl: 1.3 },
            { x: 260, y: 182, hue: '#58E8D8', size: 1.45, spd: 3.4, drift: 26, dl: 0.6 },
          ].map((j, i) => (
            // NB: SVG `transform=` attribute and CSS `transform` on the same
            // element don't compose — CSS wins and clobbers the position.
            // We split static position (SVG attr) from the animations (CSS)
            // onto separate nested <g>s so they compose correctly.
            <g key={`jelly-${i}`} transform={`translate(${j.x}, ${j.y})`}>
              <g style={{ animation: `cs-jelly-drift ${j.drift}s ease-in-out infinite alternate ${j.dl}s` }}>
                <g transform={`scale(${j.size})`}>
                  <g style={{ animation: `cs-jelly ${j.spd}s ease-in-out infinite ${j.dl}s` }}>
                    <g style={{ animation: `cs-jelly-pulse ${j.spd * 1.3}s ease-in-out infinite ${j.dl}s` }}>
                  {/* Outer halo glow so it reads against dark water */}
                  <ellipse cx={0} cy={0} rx={14} ry={10} fill={j.hue} opacity={.18} />
                  <ellipse cx={0} cy={0} rx={9} ry={6.5} fill={j.hue} opacity={.35} />
                  {/* Bell — dome with scalloped mouth */}
                  <path d={`M-6,0 Q-6,-6 0,-6 Q6,-6 6,0 Q5.5,1.2 4,1 Q3,-.2 2,1 Q1,-.2 0,1 Q-1,-.2 -2,1 Q-3,-.2 -4,1 Q-5.5,1.2 -6,0 Z`}
                        fill={j.hue} opacity={.9} />
                  {/* Highlight on bell */}
                  <ellipse cx={-1.8} cy={-3} rx={1.4} ry={2.2} fill="#FFFFFF" opacity={.55} />
                  {/* Tentacles — longer, curly, wafting */}
                  <path d={`M-4,1 Q-4.6,5 -3.6,9 Q-4.4,13 -3.3,17`} stroke={j.hue} strokeWidth={.8} fill="none" opacity={.75} strokeLinecap="round" />
                  <path d={`M-2,1 Q-2.3,6 -1.2,10 Q-2.2,14 -1.1,18`} stroke={j.hue} strokeWidth={.8} fill="none" opacity={.75} strokeLinecap="round" />
                  <path d={`M0,1 Q.3,6 -.2,10 Q.5,14 -.2,18`}         stroke={j.hue} strokeWidth={.8} fill="none" opacity={.75} strokeLinecap="round" />
                  <path d={`M2,1 Q2.3,6 1.2,10 Q2.2,14 1.1,18`}       stroke={j.hue} strokeWidth={.8} fill="none" opacity={.75} strokeLinecap="round" />
                      <path d={`M4,1 Q4.6,5 3.6,9 Q4.4,13 3.3,17`}        stroke={j.hue} strokeWidth={.8} fill="none" opacity={.75} strokeLinecap="round" />
                    </g>
                  </g>
                </g>
              </g>
            </g>
          ))}

          {/* Drifting boats — hero (profit), secondary (worst cost KPI), ambient (rotation) */}
          {/* Ambient — furthest back, rides highest on waterline. Seeded at ~75% across. */}
          <g style={{ animation: 'cs-drift-r 24s linear infinite -18s' }}>
            <g transform={`translate(0, ${WL - 4 + (BOAT_Y_OFFSET[ambientBoat] ?? 0)})`}>
              <g style={{ animation: 'cs-bob 4.8s ease-in-out infinite' }}>
                {renderBoat(ambientBoat, isNight)}
                {isNight && renderRunningLights(ambientBoat)}
              </g>
            </g>
          </g>

          {/* Hero — profit-driven, middle band, L→R. Seeded at ~40% across.
              Hidden at night (the harbor is quiet — just the ambient boat). */}
          {!isNight && <g style={{ animation: 'cs-drift-r 30s linear infinite -12s' }}>
            <g transform={`translate(0, ${WL + 2 + (BOAT_Y_OFFSET[heroBoat] ?? 0)})`}>
              <g style={{ animation: 'cs-bob 5.5s ease-in-out infinite' }}>
                {renderBoat(heroBoat, isNight)}
                {isNight && renderRunningLights(heroBoat)}
              </g>
            </g>
          </g>}

          {/* Secondary — worst non-profit KPI, front band, R→L. Seeded at ~40% from right.
              Hidden at night. */}
          {!isNight && <g style={{ animation: 'cs-drift-l 36s linear infinite -14s' }}>
            <g transform={`translate(0, ${WL + 12 + (BOAT_Y_OFFSET[secondaryBoat] ?? 0)})`}>
              <g style={{ animation: 'cs-bob 6.4s ease-in-out infinite' }}>
                {renderBoat(secondaryBoat, isNight)}
                {isNight && renderRunningLights(secondaryBoat)}
              </g>
            </g>
          </g>}

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
            {beamSweeping && (
              <>
                {/* Outer soft beam cone — sweeps across sky, originates at lamp */}
                <g style={{
                  transformOrigin: `${lx}px ${lBase-30}px`,
                  animation: `cs-beam 2s ease-in-out forwards, cs-beam-fade 2s ease-out forwards`,
                  opacity: Math.min(1, beamOp * 3.2),
                  mixBlendMode: 'screen',
                }}>
                  <path
                    d={`M${lx},${lBase-30} L${lx+180},${lBase-30-34} Q${lx+186},${lBase-30} ${lx+180},${lBase-30+34} Z`}
                    fill="url(#cs-beam-grad)"
                  />
                </g>
                {/* Inner bright beam core — tighter, slightly different timing */}
                <g style={{
                  transformOrigin: `${lx}px ${lBase-30}px`,
                  animation: `cs-beam-core 2s ease-in-out forwards, cs-beam-fade 2s ease-out forwards`,
                  opacity: Math.min(1, beamOp * 4.5),
                  mixBlendMode: 'screen',
                }}>
                  <path
                    d={`M${lx},${lBase-30} L${lx+150},${lBase-30-10} L${lx+150},${lBase-30+10} Z`}
                    fill="url(#cs-beam-grad)"
                  />
                </g>
              </>
            )}
            {/* Lamp halo bloom */}
            <ellipse cx={lx} cy={lBase-30} rx="12" ry="10"
              fill="url(#cs-beam-glow)"
              opacity={Math.min(1, 0.35 + beamOp * 2)}
              style={{ animation: `cs-beam-pulse 2.4s ease-in-out infinite`, mixBlendMode: 'screen' }}
            />
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

          {/* & — bold italic serif, fades in then fades out, never returns */}
          <text
            x="187.5"
            y="128"
            textAnchor="middle"
            fill="white"
            fontFamily="Georgia, 'Times New Roman', serif"
            fontStyle="italic"
            fontWeight="900"
            fontSize="110"
            style={{ animation: 'cs-amp-fade 3.2s ease-in-out forwards' }}
          >
            &amp;
          </text>

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

import { useEffect, useState } from 'react'
import { getTimeOfDay, moonPhase, type TimeOfDay } from '../theme/timeOfDay'
import type { WeatherCondition } from './CoastalScene'

// New York skin scene — the "skyscraper office window" variant. The view
// out of a corporate office: floor-to-ceiling glass split by two thin
// mullions, Empire State + Chrysler silhouettes across the way, cabs and
// steam vents at street level. Manhattan at night — relentless, alive.
// Weather renders ON the glass (rain streaks) because we're inside.
// Same contract as CoastalScene: 375×200 viewBox, weather + beamPulseKey.

interface Props {
  weather?: WeatherCondition
  beamPulseKey?: number
}

const SKY: Record<TimeOfDay, [string, string, string]> = {
  dawn:      ['#2A1430', '#B85878', '#F0A8A0'],  // dawn pinks
  morning:   ['#4A7EB8', '#78A8D0', '#B0D0E4'],  // morning blue
  afternoon: ['#3A6EA8', '#6898C8', '#A0C4E0'],  // afternoon clear
  sundown:   ['#38122E', '#C04828', '#F09048'],  // sundown orange
  night:     ['#14102A', '#1E1438', '#2A1E48'],  // dusk-into-night purple
}

// How lit the building windows read, per time
const WINDOW_GLOW: Record<TimeOfDay, number> = {
  dawn: .55, morning: .18, afternoon: .14, sundown: .7, night: 1,
}

const BUILDING: Record<TimeOfDay, { far: string; near: string }> = {
  dawn:      { far: '#241A30', near: '#1A1226' },
  morning:   { far: '#38445C', near: '#242E44' },
  afternoon: { far: '#344058', near: '#222C42' },
  sundown:   { far: '#2A1428', near: '#1C0E1E' },
  night:     { far: '#1A1630', near: '#110E20' },
}

// Deterministic lit-window grid for a tower
function litWindows(x: number, y: number, w: number, h: number, seed: number, density: number) {
  const wins: { x: number; y: number }[] = []
  const cols = Math.floor(w / 5)
  const rows = Math.floor(h / 7)
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const v = Math.sin(seed * 91.7 + c * 12.9898 + r * 78.233) * 43758.5453
      if ((v - Math.floor(v)) < density) wins.push({ x: x + 2.5 + c * 5, y: y + 3 + r * 7 })
    }
  }
  return wins
}

export function NewYorkScene({ weather = 'clear', beamPulseKey = 0 }: Props) {
  const [tod, setTod] = useState<TimeOfDay>(getTimeOfDay())
  useEffect(() => {
    const id = setInterval(() => setTod(getTimeOfDay()), 60_000)
    return () => clearInterval(id)
  }, [])

  const sky = SKY[tod]
  const b = BUILDING[tod]
  const glow = WINDOW_GLOW[tod]
  const isNight = tod === 'night'
  const isDark = isNight || tod === 'sundown' || tod === 'dawn'
  const windy = weather === 'wind'
  const phase = moonPhase()
  const moonlit = (1 - Math.cos(2 * Math.PI * phase)) / 2

  return (
    <div className="newyork-scene" style={{ width: '100%', aspectRatio: '375 / 200', overflow: 'hidden', display: 'block', position: 'relative' }}>
      <style>{`
        @keyframes nySteam {
          0%   { transform: translateY(0)    scaleX(1);   opacity: 0 }
          15%  { opacity: .55 }
          100% { transform: translateY(-34px) scaleX(1.7); opacity: 0 }
        }
        @keyframes nyCab {
          0%   { transform: translateX(-50px) }
          100% { transform: translateX(420px) }
        }
        @keyframes nyCabBack {
          0%   { transform: translateX(420px) }
          100% { transform: translateX(-60px) }
        }
        @keyframes nyGlassRain {
          0%   { transform: translateY(-14px); opacity: 0 }
          20%  { opacity: .55 }
          100% { transform: translateY(210px); opacity: .1 }
        }
        @keyframes nySnow {
          from { transform: translateY(-12px) }
          to   { transform: translateY(212px) }
        }
        @keyframes nyBillboard {
          0%, 100% { opacity: .35 }
          50%      { opacity: .95 }
        }
        @keyframes nyPulse {
          0%   { opacity: 0 }
          25%  { opacity: 1 }
          70%  { opacity: 1 }
          100% { opacity: 0 }
        }
      `}</style>
      <svg viewBox="0 0 375 200" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={{ display: 'block' }}>
        <defs>
          <linearGradient id="ny-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={sky[0]} />
            <stop offset="60%" stopColor={sky[1]} />
            <stop offset="100%" stopColor={sky[2]} />
          </linearGradient>
          <radialGradient id="ny-pool">
            <stop offset="0%" stopColor="#F7C948" stopOpacity=".34" />
            <stop offset="100%" stopColor="#F7C948" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="ny-head">
            <stop offset="0%" stopColor="#FFF2C0" stopOpacity=".8" />
            <stop offset="100%" stopColor="#FFF2C0" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* ── Sky ─────────────────────────────────────────────── */}
        <rect x="0" y="0" width="375" height="150" fill="url(#ny-sky)" />

        {/* moon at night (real phase) */}
        {isNight && (
          <g>
            <circle cx="316" cy="30" r="13" fill="#2A2A3C" />
            {moonlit > 0.02 && (
              <circle cx="316" cy="30" r="13" fill="#EDE8DC" opacity={Math.max(.35, moonlit)} />
            )}
          </g>
        )}

        {/* cloud bank (cloudy/rain/snow) */}
        {(weather === 'cloudy' || weather === 'rain' || weather === 'snow') && (
          <g opacity={isDark ? .2 : .5}>
            <ellipse cx="80"  cy="26" rx="52" ry="10" fill="#C8CCD8" />
            <ellipse cx="230" cy="18" rx="60" ry="11" fill="#C8CCD8" />
            <ellipse cx="340" cy="32" rx="44" ry="9"  fill="#C8CCD8" />
          </g>
        )}

        {/* ── Skyline (mid-ground) ─────────────────────────────── */}
        {/* far generic towers */}
        <rect x="0"   y="74" width="42" height="76" fill={b.far} />
        <rect x="46"  y="86" width="30" height="64" fill={b.far} />
        <rect x="248" y="80" width="34" height="70" fill={b.far} />
        <rect x="330" y="70" width="45" height="80" fill={b.far} />

        {/* Empire State — center */}
        <g>
          <rect x="150" y="86" width="52" height="64" fill={b.near} />
          <rect x="158" y="66" width="36" height="22" fill={b.near} />
          <rect x="166" y="50" width="20" height="18" fill={b.near} />
          <rect x="172" y="40" width="8"  height="12" fill={b.near} />
          <line x1="176" y1="24" x2="176" y2="40" stroke={b.near} strokeWidth="2.4" />
          {/* spire beacon */}
          <circle cx="176" cy="24" r="1.8" fill="#FF4040" opacity={isDark ? .95 : .3}>
            {isDark && <animate attributeName="opacity" values=".95;.2;.95" dur="2.6s" repeatCount="indefinite" />}
          </circle>
        </g>

        {/* Chrysler — right, chevron crown */}
        <g>
          <rect x="292" y="92" width="30" height="58" fill={b.near} />
          <path d="M292,92 L307,60 L322,92 Z" fill={b.near} />
          {/* chevron arcs in the crown */}
          <path d="M298,88 q9,-12 18,0" stroke={isDark ? '#F7C948' : '#8A94AC'} strokeWidth="1.2" fill="none" opacity={isDark ? .8 : .5} />
          <path d="M301,80 q6,-9 12,0"  stroke={isDark ? '#F7C948' : '#8A94AC'} strokeWidth="1.1" fill="none" opacity={isDark ? .7 : .45} />
          <path d="M304,72 q3,-5 6,0"   stroke={isDark ? '#F7C948' : '#8A94AC'} strokeWidth="1"   fill="none" opacity={isDark ? .6 : .4} />
          <line x1="307" y1="52" x2="307" y2="60" stroke={b.near} strokeWidth="1.6" />
        </g>

        {/* nearer flanking towers */}
        <rect x="86"  y="96" width="40" height="54" fill={b.near} />
        <rect x="216" y="100" width="26" height="50" fill={b.near} />

        {/* lit windows across all towers */}
        <g fill="#F7C948" opacity={glow}>
          {litWindows(0, 74, 42, 76, 1, .34).map((w, i) => <rect key={`a${i}`} x={w.x} y={w.y} width="2.2" height="3.2" />)}
          {litWindows(46, 86, 30, 64, 2, .3).map((w, i) => <rect key={`b${i}`} x={w.x} y={w.y} width="2.2" height="3.2" />)}
          {litWindows(150, 86, 52, 64, 3, .36).map((w, i) => <rect key={`c${i}`} x={w.x} y={w.y} width="2.2" height="3.2" />)}
          {litWindows(158, 66, 36, 22, 4, .3).map((w, i) => <rect key={`d${i}`} x={w.x} y={w.y} width="2.2" height="3.2" />)}
          {litWindows(292, 92, 30, 58, 5, .32).map((w, i) => <rect key={`e${i}`} x={w.x} y={w.y} width="2.2" height="3.2" />)}
          {litWindows(86, 96, 40, 54, 6, .3).map((w, i) => <rect key={`f${i}`} x={w.x} y={w.y} width="2.2" height="3.2" />)}
          {litWindows(216, 100, 26, 50, 7, .28).map((w, i) => <rect key={`g${i}`} x={w.x} y={w.y} width="2.2" height="3.2" />)}
          {litWindows(330, 70, 45, 80, 8, .33).map((w, i) => <rect key={`h${i}`} x={w.x} y={w.y} width="2.2" height="3.2" />)}
        </g>

        {/* billboard — flashes on refresh (beamPulseKey), gentle cycle otherwise */}
        <g>
          <rect x="92" y="104" width="28" height="13" rx="1" fill="#0E0E18" stroke="#3A3A50" strokeWidth=".8" />
          <rect x="94" y="106" width="24" height="9" fill="#4169E1" style={{ animation: 'nyBillboard 5s ease-in-out infinite' }} />
          <g key={beamPulseKey} style={{ animation: 'nyPulse 1.5s ease-out 1 both' }}>
            <rect x="94" y="106" width="24" height="9" fill="#F7C948" />
            <text x="106" y="113" textAnchor="middle" fontSize="6" fontFamily="'Bebas Neue', sans-serif" fill="#111118">&amp; DONE</text>
          </g>
        </g>

        {/* ── Street level ─────────────────────────────────────── */}
        <rect x="0" y="150" width="375" height="50" fill="#1C1C2A" />
        {/* sidewalk edge */}
        <line x1="0" y1="150" x2="375" y2="150" stroke="#3A3A50" strokeWidth="1.4" />
        {/* lane dashes */}
        <line x1="0" y1="178" x2="375" y2="178" stroke="#5A5A40" strokeWidth="1" strokeDasharray="10 12" opacity=".55" />

        {/* streetlights — three pools */}
        {[52, 187, 322].map((x, i) => (
          <g key={i}>
            <line x1={x} y1="126" x2={x} y2="150" stroke="#3A3A50" strokeWidth="2" />
            <line x1={x} y1="126" x2={x + 10} y2="128" stroke="#3A3A50" strokeWidth="1.6" />
            <circle cx={x + 11} cy="129" r="2" fill="#F7C948" opacity={isDark ? .95 : .4} />
            <ellipse cx={x + 11} cy="152" rx="24" ry="7" fill="url(#ny-pool)" opacity={isDark ? 1 : .25} />
          </g>
        ))}

        {/* taillights — mid-distance cluster */}
        <g opacity={isDark ? .9 : .5}>
          <rect x="150" y="160" width="14" height="7" rx="1.6" fill="#262636" />
          <circle cx="151.6" cy="163.4" r="1.3" fill="#FF3030" />
          <circle cx="162.4" cy="163.4" r="1.3" fill="#FF3030" />
        </g>

        {/* cab 1 — foreground, left → right */}
        <g style={{ animation: `nyCab ${windy ? 8 : 12}s linear infinite` }}>
          <g transform="translate(0,182)">
            <path d="M28,6 L52,4 L52,12 Z" fill="url(#ny-head)" opacity={isDark ? 1 : .3} />
            <path d="M2,4 Q3,0 8,0 L13,-3.5 Q14,-4.5 16,-4.5 L21,-4.5 Q23,-4.5 24,-3 L26,0 Q29,.5 29,3.5 L29,7 Q29,9 26,9 L5,9 Q2,9 2,7 Z" fill="#F7C948" />
            <rect x="13.6" y="-3.4" width="9.5" height="3.4" rx="1" fill="#2A2A3C" />
            <rect x="12" y="-.5" width="7" height="2.4" rx=".6" fill="#111118" />
            <text x="15.5" y="1.6" textAnchor="middle" fontSize="2.6" fontFamily="'Bebas Neue', sans-serif" fill="#F7C948">TAXI</text>
            <circle cx="8"  cy="9" r="2.6" fill="#111118" />
            <circle cx="23" cy="9" r="2.6" fill="#111118" />
            <circle cx="8"  cy="9" r="1"   fill="#8A8298" />
            <circle cx="23" cy="9" r="1"   fill="#8A8298" />
            <rect x="2" y="3" width="1.3" height="2.6" fill="#FF3030" />
          </g>
        </g>

        {/* cab 2 — far lane, right → left, slower + smaller */}
        <g style={{ animation: `nyCabBack ${windy ? 13 : 19}s linear infinite` }}>
          <g transform="translate(0,166) scale(.72)">
            <path d="M-20,7 L-44,5 L-44,13 Z" fill="url(#ny-head)" opacity={isDark ? .9 : .25} transform="scale(-1,1) translate(-8,0)" />
            <path d="M2,4 Q3,0 8,0 L13,-3.5 Q14,-4.5 16,-4.5 L21,-4.5 Q23,-4.5 24,-3 L26,0 Q29,.5 29,3.5 L29,7 Q29,9 26,9 L5,9 Q2,9 2,7 Z" fill="#E0B640" />
            <rect x="13.6" y="-3.4" width="9.5" height="3.4" rx="1" fill="#262636" />
            <circle cx="8"  cy="9" r="2.6" fill="#111118" />
            <circle cx="23" cy="9" r="2.6" fill="#111118" />
          </g>
        </g>

        {/* steam vents — three animated plumes */}
        {[92, 208, 300].map((x, i) => (
          <g key={i}>
            <rect x={x - 7} y="153" width="14" height="2.5" rx="1.2" fill="#3A3A50" />
            {[0, 1, 2].map((p) => (
              <ellipse
                key={p}
                cx={x + (windy ? 6 : 0)}
                cy={150}
                rx={7 + p * 2}
                ry={4 + p}
                fill="#E8E0D0"
                style={{
                  animation: `nySteam ${2.8 + i * 0.5 + p * 0.9}s ease-out ${p * 1.1}s infinite`,
                  transformOrigin: `${x}px 150px`,
                }}
                opacity="0"
              />
            ))}
          </g>
        ))}

        {/* ── Weather on the glass (we're inside) ──────────────── */}
        {weather === 'rain' && (
          <g>
            {Array.from({ length: 14 }, (_, i) => (
              <line
                key={i}
                x1={(i * 53 + 20) % 375} y1="0"
                x2={(i * 53 + 17) % 375} y2="16"
                stroke="#C8D8E8" strokeWidth="1.4" strokeLinecap="round"
                style={{ animation: `nyGlassRain ${2.2 + (i % 5) * 0.7}s linear ${(i % 7) * 0.5}s infinite` }}
                opacity="0"
              />
            ))}
          </g>
        )}
        {weather === 'snow' && (
          <g opacity=".85" style={{ animation: 'nySnow 6s linear infinite' }}>
            {Array.from({ length: 18 }, (_, i) => (
              <circle key={i} cx={(i * 41 + 15) % 375} cy={(i * 67) % 200 - 200} r={i % 3 === 0 ? 1.7 : 1.1} fill="#F0F2F6" />
            ))}
          </g>
        )}

        {/* ── Office window framing (foreground) ───────────────── */}
        {/* two thin mullions splitting the view into three panels */}
        <rect x="122" y="0" width="5" height="200" fill="#0A0A12" />
        <rect x="248" y="0" width="5" height="200" fill="#0A0A12" />
        {/* outer frame */}
        <rect x="0" y="0" width="375" height="200" fill="none" stroke="#0A0A12" strokeWidth="6" />
        {/* glass reflection streak */}
        <path d="M30,200 L150,0 L186,0 L66,200 Z" fill="#FFFFFF" opacity=".035" />
        <path d="M240,200 L340,0 L356,0 L256,200 Z" fill="#FFFFFF" opacity=".025" />
      </svg>
    </div>
  )
}

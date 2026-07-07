import { useEffect, useState } from 'react'
import { getTimeOfDay, type TimeOfDay } from '../theme/timeOfDay'
import type { WeatherCondition } from './CoastalScene'

// Nostromo skin scene — Weyland-Yutani corporate. A clean institutional
// bulkhead with a circular porthole looking out onto deep space: stars and
// a ringed planet. "Clean institutional surface over dark reality."
// Interior lighting phases with the ship's clock (real time of day):
// bright institutional white by day, amber at sundown, red-shifted night
// watch after dark. Space itself never changes.
// Same contract as CoastalScene: 375×200 viewBox, weather + beamPulseKey.

interface Props {
  weather?: WeatherCondition
  beamPulseKey?: number
}

// Interior lighting per ship-clock phase
const PANEL: Record<TimeOfDay, { bg: string; seam: string; text: string; accent: string; stripeOn: boolean }> = {
  dawn:      { bg: '#D8DEDA', seam: '#B4BEBA', text: '#4A5A56', accent: '#C4922A', stripeOn: true },
  morning:   { bg: '#EEF2F0', seam: '#C6D0CC', text: '#5A6A66', accent: '#1658CC', stripeOn: true },
  afternoon: { bg: '#E8EEEA', seam: '#C2CCC8', text: '#56665F', accent: '#1658CC', stripeOn: true },
  sundown:   { bg: '#CCC8B8', seam: '#A8A492', text: '#5C584A', accent: '#C4922A', stripeOn: true },
  night:     { bg: '#232A2E', seam: '#182022', text: '#6A7A78', accent: '#CC2020', stripeOn: false },
}

// Deterministic pseudo-random star field (no Math.random — stable renders)
const STARS = Array.from({ length: 46 }, (_, i) => {
  const a = Math.sin(i * 127.1) * 43758.5453
  const b = Math.sin(i * 311.7) * 12543.8571
  const fx = a - Math.floor(a)
  const fy = b - Math.floor(b)
  return {
    x: 158 + fx * 168,          // inside the porthole box
    y: 22 + fy * 156,
    r: (i % 5 === 0 ? 1.3 : i % 3 === 0 ? 0.9 : 0.6),
    tw: i % 4 === 0,            // twinklers
    d: 2 + (i % 5),             // twinkle duration
  }
})

export function NostromoScene({ weather = 'clear', beamPulseKey = 0 }: Props) {
  const [tod, setTod] = useState<TimeOfDay>(getTimeOfDay())
  useEffect(() => {
    const id = setInterval(() => setTod(getTimeOfDay()), 60_000)
    return () => clearInterval(id)
  }, [])

  const p = PANEL[tod]
  const isNightWatch = tod === 'night'
  // Space weather: cloudy → nebula haze; rain/snow → dust drift; wind → faster drift
  const nebula = weather === 'cloudy'
  const dust = weather === 'rain' || weather === 'snow' || weather === 'wind'
  const dustSpeed = weather === 'wind' ? 7 : 16

  return (
    <div className="nostromo-scene" style={{ width: '100%', aspectRatio: '375 / 200', overflow: 'hidden', display: 'block', position: 'relative' }}>
      <style>{`
        @keyframes wyTwinkle {
          0%, 100% { opacity: .25 }
          50%      { opacity: 1 }
        }
        @keyframes wyBlink {
          0%, 78%, 100% { opacity: 1 }
          82%, 96%      { opacity: .15 }
        }
        @keyframes wyDrift {
          from { transform: translateX(0) }
          to   { transform: translateX(-60px) }
        }
        @keyframes wyPlanet {
          0%, 100% { transform: translateY(0) }
          50%      { transform: translateY(-3px) }
        }
        @keyframes wyPulse {
          0%   { opacity: 0 }
          20%  { opacity: 1 }
          60%  { opacity: 1 }
          100% { opacity: 0 }
        }
        @keyframes wyScan {
          from { transform: translateY(-6px);  opacity: 0 }
          15%  { opacity: .5 }
          85%  { opacity: .5 }
          to   { transform: translateY(200px); opacity: 0 }
        }
      `}</style>
      <svg viewBox="0 0 375 200" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={{ display: 'block' }}>
        <defs>
          <radialGradient id="wy-space" cx="42%" cy="46%">
            <stop offset="0%" stopColor="#101430" />
            <stop offset="70%" stopColor="#0A0A18" />
            <stop offset="100%" stopColor="#06060E" />
          </radialGradient>
          <radialGradient id="wy-planet-sh" cx="35%" cy="35%">
            <stop offset="0%" stopColor="#3E7EE8" />
            <stop offset="55%" stopColor="#1658CC" />
            <stop offset="100%" stopColor="#0A2A66" />
          </radialGradient>
          <clipPath id="wy-port">
            <circle cx="242" cy="100" r="76" />
          </clipPath>
          <radialGradient id="wy-glow">
            <stop offset="0%" stopColor={p.accent} stopOpacity=".55" />
            <stop offset="100%" stopColor={p.accent} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* ── Institutional bulkhead ─────────────────────────────── */}
        <rect x="0" y="0" width="375" height="200" fill={p.bg} />
        {/* horizontal panel seams */}
        <line x1="0" y1="34"  x2="375" y2="34"  stroke={p.seam} strokeWidth="1.4" />
        <line x1="0" y1="166" x2="375" y2="166" stroke={p.seam} strokeWidth="1.4" />
        <line x1="0" y1="100" x2="140" y2="100" stroke={p.seam} strokeWidth="1" opacity=".7" />
        {/* rivets down the left panel edge */}
        {[14, 48, 82, 116, 150, 184].map((y) => (
          <circle key={y} cx="8" cy={y} r="1.6" fill={p.seam} />
        ))}
        {[14, 48, 82, 116, 150, 184].map((y) => (
          <circle key={y} cx="132" cy={y} r="1.6" fill={p.seam} />
        ))}

        {/* WY wordmark + tagline */}
        <g fontFamily="'Share Tech Mono', monospace" fill={p.text}>
          <text x="18" y="54" fontSize="11" letterSpacing="2">WEYLAND-YUTANI</text>
          <text x="18" y="68" fontSize="6" letterSpacing="1.4" opacity=".75">BUILDING BETTER WORLDS</text>
          <text x="18" y="88" fontSize="5.5" letterSpacing="1" opacity=".55">USCSS NOSTROMO · 180924609</text>
          {/* small WY glyph — two interlocked angles */}
          <g stroke={p.text} strokeWidth="1.6" fill="none" opacity=".85">
            <path d="M18,24 l5,8 l5,-8" />
            <path d="M30,24 l5,8 l5,-8" transform="translate(-4,0)" />
          </g>
        </g>

        {/* status console — three LEDs + a data strip */}
        <g>
          <rect x="18" y="128" width="96" height="26" rx="2" fill={isNightWatch ? '#181E20' : '#FFFFFF'} opacity={isNightWatch ? 1 : .5} stroke={p.seam} strokeWidth="1" />
          <circle cx="30" cy="141" r="3.4" fill="#22CC66" style={{ animation: 'wyBlink 3.4s linear infinite' }} />
          <circle cx="44" cy="141" r="3.4" fill="#E8C020" opacity={weather === 'clear' ? .28 : .95} />
          <circle cx="58" cy="141" r="3.4" fill="#CC2020" opacity={isNightWatch ? .95 : .25} />
          <g fontFamily="'Share Tech Mono', monospace" fontSize="4.6" fill={p.text} opacity=".8">
            <text x="70" y="139">LIFE SUP</text>
            <text x="70" y="147">NOMINAL</text>
          </g>
        </g>

        {/* caution stripe along the bottom */}
        <g opacity={p.stripeOn ? 0.9 : 0.5}>
          <rect x="0" y="188" width="375" height="12" fill="#E8C020" />
          {Array.from({ length: 16 }, (_, i) => (
            <path key={i} d={`M${i * 26 - 10},200 l12,-12 l8,0 l-12,12 Z`} fill="#14140C" />
          ))}
        </g>

        {/* night-watch red wash */}
        {isNightWatch && <rect x="0" y="0" width="375" height="200" fill="#3A0808" opacity=".16" />}

        {/* ── The porthole ──────────────────────────────────────── */}
        {/* deep space */}
        <circle cx="242" cy="100" r="76" fill="url(#wy-space)" />
        <g clipPath="url(#wy-port)">
          {/* stars */}
          {STARS.map((s, i) => (
            <circle
              key={i}
              cx={s.x} cy={s.y} r={s.r}
              fill="#E8F0F4"
              style={s.tw ? { animation: `wyTwinkle ${s.d}s ease-in-out infinite` } : undefined}
              opacity={s.tw ? undefined : 0.8}
            />
          ))}
          {/* nebula haze (cloudy) */}
          {nebula && (
            <g opacity=".22">
              <ellipse cx="215" cy="70" rx="55" ry="22" fill="#4E82E8" />
              <ellipse cx="270" cy="120" rx="48" ry="18" fill="#8A4EE8" />
            </g>
          )}
          {/* dust drift (rain/snow/wind) */}
          {dust && (
            <g opacity=".5" style={{ animation: `wyDrift ${dustSpeed}s linear infinite` }}>
              {Array.from({ length: 14 }, (_, i) => (
                <rect key={i} x={170 + ((i * 47) % 190)} y={30 + ((i * 71) % 140)} width={i % 3 === 0 ? 3 : 1.8} height="0.8" rx=".4" fill="#B8C8D4" />
              ))}
            </g>
          )}
          {/* ringed planet */}
          <g style={{ animation: 'wyPlanet 9s ease-in-out infinite' }}>
            <ellipse cx="222" cy="128" rx="34" ry="7.5" fill="none" stroke="#8FA6C8" strokeWidth="2.2" opacity=".5" transform="rotate(-16 222 128)" />
            <circle cx="222" cy="128" r="19" fill="url(#wy-planet-sh)" />
            {/* ring passes in front */}
            <path d="M188,132 a34,7.5 -16 0 0 68,-4" fill="none" stroke="#AABCD8" strokeWidth="2.2" opacity=".8" transform="rotate(0 222 128)" />
            {/* atmosphere band */}
            <path d="M206,122 q16,-7 31,1" stroke="#6AA0F0" strokeWidth="1.6" fill="none" opacity=".6" />
          </g>
          {/* refresh pulse — a sensor scanline sweeps the viewport */}
          <g key={beamPulseKey}>
            <rect x="166" y="0" width="152" height="2.5" fill="#4EFF9A" style={{ animation: 'wyScan 1.4s ease-in 1 both' }} />
          </g>
        </g>

        {/* porthole ring — heavy bulkhead flange with bolts */}
        <circle cx="242" cy="100" r="76" fill="none" stroke={isNightWatch ? '#3A4448' : '#B8C8C4'} strokeWidth="9" />
        <circle cx="242" cy="100" r="83" fill="none" stroke={isNightWatch ? '#2A3236' : '#98A8A4'} strokeWidth="3.5" />
        <circle cx="242" cy="100" r="70" fill="none" stroke={isNightWatch ? '#141C20' : '#8A9A96'} strokeWidth="1.5" />
        {Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2 - Math.PI / 2
          return (
            <circle
              key={i}
              cx={242 + Math.cos(a) * 76}
              cy={100 + Math.sin(a) * 76}
              r="2.2"
              fill={isNightWatch ? '#1A2226' : '#78888A'}
            />
          )
        })}

        {/* interior accent glow near the console (subtle) */}
        <circle cx="66" cy="141" r="30" fill="url(#wy-glow)" opacity={isNightWatch ? .5 : .25} />
      </svg>
    </div>
  )
}

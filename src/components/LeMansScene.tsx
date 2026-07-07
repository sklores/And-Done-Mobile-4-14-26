import { useEffect, useState } from 'react'
import { getTimeOfDay, type TimeOfDay } from '../theme/timeOfDay'
import type { WeatherCondition } from './CoastalScene'

// Le Mans skin scene — the Sarthe circuit at dawn. Rolling countryside,
// pine trees, a race track sweeping through perspective, one car on track,
// a pit building with a waving checkered flag. Classic, precise.
// Same contract as CoastalScene: 375×200 viewBox, weather + beamPulseKey.

interface Props {
  weather?: WeatherCondition
  beamPulseKey?: number
}

const SKY: Record<TimeOfDay, [string, string, string]> = {
  dawn:      ['#3C1E28', '#C87848', '#F4C888'],  // the signature Sarthe dawn
  morning:   ['#7AB2D4', '#A8CCE0', '#D4E8EE'],
  afternoon: ['#5A9CC8', '#88BCD8', '#BCE0EE'],
  sundown:   ['#5A1E28', '#C84828', '#E8A050'],
  night:     ['#101828', '#182238', '#243048'],
}

const SUN: Record<TimeOfDay, { x: number; y: number; r: number; c: string; halo: string; show: boolean }> = {
  dawn:      { x: 300, y: 66, r: 17, c: '#FFB050', halo: '#FF8830', show: true },
  morning:   { x: 296, y: 30, r: 15, c: '#FFF8D8', halo: '#FFEEA0', show: true },
  afternoon: { x: 240, y: 22, r: 15, c: '#FFF4BC', halo: '#FFF8D8', show: true },
  sundown:   { x: 66,  y: 60, r: 18, c: '#FF7030', halo: '#FF4818', show: true },
  night:     { x: 312, y: 30, r: 13, c: '#EEE8D0', halo: '#C8C2A8', show: true }, // moon
}

// Far hills / near meadow / trees / asphalt, per time of day
const LAND: Record<TimeOfDay, { far: string; near: string; pine: string; pineDark: string; asphalt: string; edge: string; grassLight: string }> = {
  dawn:      { far: '#2E4A32', near: '#38663E', pine: '#1E3824', pineDark: '#16281A', asphalt: '#3A3A30', edge: '#EEE8D0', grassLight: '#4A7A4A' },
  morning:   { far: '#3E6B42', near: '#4E8A50', pine: '#2A5232', pineDark: '#1E3E26', asphalt: '#4A4A40', edge: '#F4F0DC', grassLight: '#66A45E' },
  afternoon: { far: '#3A6540', near: '#4A844C', pine: '#28502F', pineDark: '#1C3C24', asphalt: '#484840', edge: '#F4F0DC', grassLight: '#60A05A' },
  sundown:   { far: '#2A3E2A', near: '#334E34', pine: '#1C2E1E', pineDark: '#142214', asphalt: '#38342C', edge: '#E0D8B8', grassLight: '#40603E' },
  night:     { far: '#16241A', near: '#1C3020', pine: '#101E14', pineDark: '#0A140C', asphalt: '#22221C', edge: '#8A8A70', grassLight: '#243E26' },
}

const CLOUD_OPACITY: Record<TimeOfDay, number> = {
  dawn: .45, morning: .6, afternoon: .5, sundown: .35, night: .14,
}

function Pine({ x, y, s, fill }: { x: number; y: number; s: number; fill: string }) {
  // Simple three-tier pine, scaled by s
  return (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      <rect x="-1.6" y="10" width="3.2" height="5" fill="#4A3826" />
      <path d="M0,-14 L8,2 L-8,2 Z" fill={fill} />
      <path d="M0,-8 L10,7 L-10,7 Z" fill={fill} />
      <path d="M0,-2 L12,12 L-12,12 Z" fill={fill} />
    </g>
  )
}

export function LeMansScene({ weather = 'clear', beamPulseKey = 0 }: Props) {
  const [tod, setTod] = useState<TimeOfDay>(getTimeOfDay())
  useEffect(() => {
    const id = setInterval(() => setTod(getTimeOfDay()), 60_000)
    return () => clearInterval(id)
  }, [])

  const sky = SKY[tod]
  const sun = SUN[tod]
  const land = LAND[tod]
  const isNight = tod === 'night'
  const isDawn = tod === 'dawn'
  const headlightsOn = isNight || isDawn || tod === 'sundown' || weather === 'rain'
  const cloudy = weather === 'cloudy' || weather === 'rain' || weather === 'snow'
  const windy = weather === 'wind'

  return (
    <div className="lemans-scene" style={{ width: '100%', aspectRatio: '375 / 200', overflow: 'hidden', display: 'block', position: 'relative' }}>
      <style>{`
        @keyframes lmCar {
          0%   { transform: translateX(-60px) }
          100% { transform: translateX(420px) }
        }
        @keyframes lmFlag {
          0%, 100% { transform: skewX(0deg) }
          50%      { transform: skewX(-8deg) }
        }
        @keyframes lmCloud {
          from { transform: translateX(0) }
          to   { transform: translateX(-420px) }
        }
        @keyframes lmRain {
          from { transform: translateY(-20px) }
          to   { transform: translateY(220px) }
        }
        @keyframes lmSnow {
          from { transform: translateY(-12px) }
          to   { transform: translateY(212px) }
        }
        @keyframes lmPulse {
          0%   { opacity: 0 }
          25%  { opacity: .9 }
          100% { opacity: 0 }
        }
      `}</style>
      <svg viewBox="0 0 375 200" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={{ display: 'block' }}>
        <defs>
          <linearGradient id="lm-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={sky[0]} />
            <stop offset="55%" stopColor={sky[1]} />
            <stop offset="100%" stopColor={sky[2]} />
          </linearGradient>
          <radialGradient id="lm-halo">
            <stop offset="0%" stopColor={sun.halo} stopOpacity=".8" />
            <stop offset="100%" stopColor={sun.halo} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="lm-head">
            <stop offset="0%" stopColor="#FFF4C0" stopOpacity=".85" />
            <stop offset="100%" stopColor="#FFF4C0" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Sky */}
        <rect x="0" y="0" width="375" height="120" fill="url(#lm-sky)" />

        {/* Sun / moon */}
        {sun.show && (
          <g>
            <circle cx={sun.x} cy={sun.y} r={sun.r * 2.6} fill="url(#lm-halo)" opacity={cloudy ? 0.4 : 1} />
            <circle cx={sun.x} cy={sun.y} r={sun.r} fill={sun.c} opacity={cloudy ? 0.6 : 1} />
          </g>
        )}

        {/* Clouds */}
        <g opacity={CLOUD_OPACITY[tod] * (cloudy ? 1.6 : 1)}>
          <g style={{ animation: `lmCloud ${windy ? 26 : 70}s linear infinite` }}>
            <ellipse cx="90"  cy="30" rx="34" ry="9"  fill="#EDF2EE" />
            <ellipse cx="210" cy="48" rx="26" ry="7"  fill="#EDF2EE" />
            <ellipse cx="330" cy="24" rx="30" ry="8"  fill="#EDF2EE" />
            <ellipse cx="465" cy="36" rx="34" ry="9"  fill="#EDF2EE" />
            <ellipse cx="585" cy="28" rx="26" ry="7"  fill="#EDF2EE" />
          </g>
        </g>

        {/* Far hills */}
        <path d="M0,120 Q60,92 140,110 Q220,126 290,102 Q340,92 375,104 L375,200 L0,200 Z" fill={land.far} />

        {/* Pit building + flag pole, right side on the far hill */}
        <g>
          <rect x="300" y="88" width="46" height="18" rx="1.5" fill={isNight ? '#26261E' : '#EEE8D0'} />
          <rect x="300" y="84" width="46" height="5" fill="#6B1F1F" />
          {/* windows strip */}
          <rect x="304" y="92" width="38" height="4" fill={isNight ? '#C4922A' : '#8B5E3C'} opacity={isNight ? .9 : .5} />
          {/* flag pole + checkered flag */}
          <line x1="352" y1="60" x2="352" y2="88" stroke={land.edge} strokeWidth="1.6" />
          <g style={{ animation: `lmFlag ${windy ? 0.9 : 2.2}s ease-in-out infinite`, transformOrigin: '352px 62px' }}>
            <g>
              <rect x="352" y="60" width="6" height="5" fill="#F4F0DC" />
              <rect x="358" y="60" width="6" height="5" fill="#1A1A14" />
              <rect x="352" y="65" width="6" height="5" fill="#1A1A14" />
              <rect x="358" y="65" width="6" height="5" fill="#F4F0DC" />
            </g>
          </g>
        </g>

        {/* Near meadow */}
        <path d="M0,140 Q80,120 180,134 Q280,148 375,130 L375,200 L0,200 Z" fill={land.near} />

        {/* Pines — left cluster + two on the right */}
        <Pine x={34}  y={116} s={1.15} fill={land.pine} />
        <Pine x={58}  y={122} s={0.9}  fill={land.pineDark} />
        <Pine x={16}  y={124} s={0.8}  fill={land.pineDark} />
        <Pine x={262} y={118} s={0.75} fill={land.pineDark} />
        <Pine x={282} y={122} s={0.95} fill={land.pine} />

        {/* Track — sweeping ribbon, near-left to horizon-right */}
        <path d="M-10,196 C80,168 150,166 200,152 C260,136 320,132 380,136 L380,150 C320,146 264,150 210,164 C158,178 90,184 -10,212 Z" fill={land.asphalt} />
        {/* cream edge lines */}
        <path d="M-10,196 C80,168 150,166 200,152 C260,136 320,132 380,136" stroke={land.edge} strokeWidth="1.4" fill="none" opacity=".85" />
        <path d="M-10,212 C90,184 158,178 210,164 C264,150 320,146 380,150" stroke={land.edge} strokeWidth="1.4" fill="none" opacity=".85" />
        {/* center dashes */}
        <path d="M-10,204 C85,176 154,172 205,158 C262,143 320,139 380,143" stroke={land.edge} strokeWidth="1" fill="none" strokeDasharray="7 9" opacity=".5" />
        {/* red/white curbs at the near corner */}
        <path d="M-10,196 C30,184 60,178 86,173 L88,178 C62,183 32,189 -10,201 Z" fill="#B03030" />
        <path d="M-4,194 l10,-3 M18,188 l10,-3 M40,183 l10,-2.6 M62,178.6 l10,-2.4" stroke="#F4F0DC" strokeWidth="4.5" opacity=".9" />

        {/* The car — BRG racer, loops along the track band */}
        <g style={{ animation: `lmCar ${windy ? 9 : 13}s linear infinite` }}>
          <g transform="translate(0,158)">
            {/* headlight cone */}
            {headlightsOn && <path d="M22,4 L58,-2 L58,12 Z" fill="url(#lm-head)" />}
            {/* body */}
            <path d="M2,6 Q4,0 12,-1 L20,-1 Q26,0 27,4 L27,8 Q27,10 24,10 L5,10 Q2,10 2,8 Z" fill="#1B4D2E" stroke="#12351F" strokeWidth=".6" />
            {/* cockpit */}
            <path d="M12,-1 Q15,-5 19,-1 Z" fill="#2A2A18" />
            {/* number roundel */}
            <circle cx="9" cy="4" r="3.4" fill="#EEE8D0" />
            <text x="9" y="6" textAnchor="middle" fontSize="5" fontFamily="'Barlow Condensed', sans-serif" fontStyle="italic" fontWeight="700" fill="#1B4D2E">22</text>
            {/* wheels */}
            <circle cx="7"  cy="10" r="2.6" fill="#14140E" />
            <circle cx="21" cy="10" r="2.6" fill="#14140E" />
            <circle cx="7"  cy="10" r="1"   fill="#C4922A" />
            <circle cx="21" cy="10" r="1"   fill="#C4922A" />
            {/* taillight */}
            <rect x="2" y="3" width="1.4" height="3" fill={headlightsOn ? '#FF3020' : '#8A2018'} />
          </g>
        </g>

        {/* Refresh pulse — headlight flare sweep, one-shot per beamPulseKey */}
        <g key={beamPulseKey} style={{ animation: 'lmPulse 1.6s ease-out 1 both' }}>
          <circle cx="188" cy="160" r="34" fill="url(#lm-head)" />
        </g>

        {/* Weather overlays */}
        {weather === 'rain' && (
          <g opacity=".5" style={{ animation: 'lmRain 0.7s linear infinite' }}>
            {Array.from({ length: 26 }, (_, i) => (
              <line key={i} x1={(i * 29 + 8) % 375} y1={(i * 53) % 200 - 200} x2={(i * 29 + 4) % 375} y2={(i * 53) % 200 - 186} stroke="#AAC4D8" strokeWidth="1.1" />
            ))}
          </g>
        )}
        {weather === 'snow' && (
          <g opacity=".8" style={{ animation: 'lmSnow 5s linear infinite' }}>
            {Array.from({ length: 20 }, (_, i) => (
              <circle key={i} cx={(i * 37 + 12) % 375} cy={(i * 61) % 200 - 200} r={i % 3 === 0 ? 1.8 : 1.2} fill="#F4F6F8" />
            ))}
          </g>
        )}
      </svg>
    </div>
  )
}

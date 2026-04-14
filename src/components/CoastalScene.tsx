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
  dawn:      ['#E8956A', '#F4C090', '#F8DDB8'],
  morning:   ['#6AAED4', '#94CAE0', '#C0E0EE'],
  afternoon: ['#4A90C8', '#78B4D8', '#AADCEE'],
  sundown:   ['#C84828', '#E87840', '#F4A860'],
  night:     ['#080E1C', '#0C1428', '#101E38'],
}
const HORIZON: Record<TimeOfDay, string> = {
  dawn: '#F0C8A0', morning: '#CCE8F4', afternoon: '#C4E4F4',
  sundown: '#F8C888', night: '#0E1C30',
}
const WATER: Record<TimeOfDay, [string, string, string]> = {
  dawn:      ['#7A8898', '#4A5868', '#2A3848'],
  morning:   ['#4A9AB8', '#2A7898', '#0E4E6E'],
  afternoon: ['#3A88B0', '#1A6090', '#0A3860'],
  sundown:   ['#8A5840', '#5A3828', '#2E1A14'],
  night:     ['#0A1420', '#060C14', '#030608'],
}
const SUN: Record<TimeOfDay, { x: number; y: number; r: number; c: string; g: string; moon: boolean }> = {
  dawn:      { x: 42,  y: 64, r: 18, c: '#FFAA44', g: '#FF8822', moon: false },
  morning:   { x: 290, y: 26, r: 17, c: '#FFFDE0', g: '#FFF0A0', moon: false },
  afternoon: { x: 230, y: 18, r: 16, c: '#FFF8C0', g: '#FFFDE0', moon: false },
  sundown:   { x: 34,  y: 52, r: 20, c: '#FF6622', g: '#FF4400', moon: false },
  night:     { x: 318, y: 22, r: 11, c: '#E8E4D4', g: '#D0CCB8', moon: true  },
}
const CLOUD_OPACITY: Record<TimeOfDay, number> = {
  dawn: .75, morning: .65, afternoon: .52, sundown: .8, night: .12,
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
function wp1(a: number): string {
  const t = 92, c = t - a
  return `M-30,${t} C12,${c} 54,${t+a*.65} 96,${t} C138,${c} 180,${t+a*.65} 222,${t} C264,${c} 306,${t+a*.65} 348,${t} C366,${c+2} 384,${t+a*.4} 410,${t} L410,130 L-30,130Z`
}
function wp2(a: number): string {
  const t = 100, c = t - a * .78
  return `M-30,${t} C18,${c} 66,${t+a*.58} 114,${t} C162,${c} 210,${t+a*.58} 258,${t} C306,${c} 350,${t+a*.58} 395,${t} L410,128 L-30,128Z`
}
function wp3(a: number): string {
  const t = 110, c = t - a * .45
  return `M-30,${t} C25,${c} 80,${t+a*.4} 135,${t} C190,${c} 245,${t+a*.4} 300,${t} C340,${c} 368,${t+a*.3} 410,${t} L410,130 L-30,130Z`
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
@keyframes cs-twink{0%,100%{opacity:.85}50%{opacity:.15}}
@keyframes cs-shark1{0%{transform:translateX(0)}50%{transform:translateX(-28px)}100%{transform:translateX(0)}}
@keyframes cs-shark2{0%{transform:translateX(0)}50%{transform:translateX(22px)}100%{transform:translateX(0)}}
@keyframes cs-rain{0%{transform:translateY(-30px)}100%{transform:translateY(200px) translateX(20px)}}
@keyframes cs-snow{0%{transform:translateY(-10px)}50%{transform:translateY(80px) translateX(8px)}100%{transform:translateY(170px) translateX(-4px)}}
@keyframes cs-wind{0%{opacity:0;transform:translateX(-60px)}40%{opacity:.32}100%{opacity:0;transform:translateX(420px)}}
@keyframes cs-balloon{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
@keyframes cs-spray{0%{opacity:0;transform:translateY(0)}35%{opacity:.75}100%{opacity:0;transform:translateY(-16px) scaleX(1.6)}}
@keyframes cs-spray2{0%{opacity:0}25%{opacity:.55}100%{opacity:0;transform:translateY(-10px) translateX(8px)}}
@keyframes cs-sprayl{0%{opacity:0;transform:translateY(0)}30%{opacity:.5}100%{opacity:0;transform:translateY(-12px) scaleX(1.3)}}
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
const SNOW_FLAKES: [number, number][] = [
  [45,5],[100,12],[160,3],[220,8],[280,14],[335,6],
  [70,20],[130,25],[190,18],[250,22],[305,28],
  [20,35],[85,40],[145,32],[205,38],[265,44],[320,36],
  [50,50],[115,55],[175,48],[235,52],
]

export function CoastalScene({ weather = 'clear' }: CoastalSceneProps) {
  const [tod, setTod] = useState<TimeOfDay>(getTimeOfDay())
  const salesRaw = useKpiStore(s => s.sales)
  const sales = salesRaw?.value ?? 0

  useEffect(() => {
    const id = setInterval(() => setTod(getTimeOfDay()), 60_000)
    return () => clearInterval(id)
  }, [])

  const isWind = weather === 'wind'
  const isNight = tod === 'night'
  const isSundown = tod === 'sundown'
  const isDawn = tod === 'dawn'

  const [s1, s2, s3] = SKY[tod]
  const [w1, w2, w3] = WATER[tod]
  const hz = HORIZON[tod]
  const sun = SUN[tod]
  const cOp = CLOUD_OPACITY[tod]
  const [rC, rM, rD] = ROCK_COLORS[tod]
  const cc = isNight ? '#1A2A3A' : weather === 'cloudy' ? '#8AAABB' : 'white'

  const amp = wAmp(sales) + (isWind ? 8 : 0)
  const spd1 = wSpd(sales, isWind ? 2.1 : 4.4, isWind)
  const spd2 = wSpd(sales, isWind ? 1.6 : 3.4, isWind)
  const spd3 = wSpd(sales, isWind ? 2.7 : 5.5, isWind)
  const sc01 = Math.min(sales / 20000, 1)
  const foamOp = (.06 + sc01 * .3).toFixed(2)
  const spraySpd = (isWind ? 1.0 : Math.max(.7, 2.2 - sc01 * 1.4)).toFixed(1)
  const sprayOp = Math.min(.92, sc01 * .8 + .1).toFixed(2)

  const skyTop = weather === 'cloudy' ? '#5A7888' : s1
  const skyMid = weather === 'cloudy' ? '#7A9AAA' : s2
  const skyBot = weather === 'cloudy' ? '#98B4BE' : s3

  const bx = 195, by = isNight ? 16 : 20
  const lx = 52, lBase = 90

  return (
    <div style={{ width: '100%', height: 160, overflow: 'hidden', display: 'block' }}>
      <style>{SCENE_CSS}</style>
      <svg viewBox="0 0 375 160" width="100%" height="160" style={{ display: 'block' }}>
        <defs>
          <linearGradient id="cs-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skyTop} />
            <stop offset="52%" stopColor={skyMid} />
            <stop offset="100%" stopColor={skyBot} />
          </linearGradient>
          <linearGradient id="cs-haze" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={hz} stopOpacity={0} />
            <stop offset="100%" stopColor={hz} stopOpacity={0.52} />
          </linearGradient>
          <linearGradient id="cs-water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={w1} />
            <stop offset="45%" stopColor={w2} />
            <stop offset="100%" stopColor={w3} />
          </linearGradient>
          <linearGradient id="cs-sheen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity={isWind ? .14 : .07} />
            <stop offset="100%" stopColor="white" stopOpacity={0} />
          </linearGradient>
          <clipPath id="cs-clip"><rect width="375" height="160" /></clipPath>
        </defs>

        <g clipPath="url(#cs-clip)">
          {/* Sky */}
          <rect width="375" height="160" fill="url(#cs-sky)" />

          {/* Stars (night) */}
          {isNight && STARS.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i % 6 === 0 ? 1.2 : .75}
              fill="white" opacity={.5 + .3 * (i % 3) / 2}
              style={{ animation: `cs-twink ${1.8 + (i % 4) * .45}s ease-in-out infinite ${i * .15}s` }} />
          ))}

          {/* Sun / Moon */}
          {sun.moon ? (
            <>
              <circle cx={sun.x} cy={sun.y} r={sun.r} fill={sun.c} opacity={.9} />
              <circle cx={sun.x + 5} cy={sun.y - 3} r={sun.r - 2} fill={s1} />
            </>
          ) : (
            <>
              <circle cx={sun.x} cy={sun.y} r={sun.r + 10} fill={sun.g} opacity={.14} />
              <circle cx={sun.x} cy={sun.y} r={sun.r + 5}  fill={sun.g} opacity={.12} />
              <circle cx={sun.x} cy={sun.y} r={sun.r}      fill={sun.c} opacity={.95} />
            </>
          )}

          {/* Clouds */}
          <g style={{ animation: `cs-drift1 14s ease-in-out infinite` }} opacity={cOp}>
            <ellipse cx="260" cy="24" rx="50" ry="13" fill={cc} opacity={.44} />
            <ellipse cx="244" cy="27" rx="34" ry="9"  fill={cc} opacity={.34} />
            <ellipse cx="280" cy="26" rx="28" ry="8"  fill={cc} opacity={.32} />
          </g>
          <g style={{ animation: `cs-drift2 20s ease-in-out infinite 5s` }} opacity={cOp * .75}>
            <ellipse cx="340" cy="18" rx="38" ry="10" fill={cc} opacity={.36} />
            <ellipse cx="326" cy="20" rx="26" ry="7"  fill={cc} opacity={.28} />
          </g>

          {/* Extra cloudy layer */}
          {weather === 'cloudy' && (
            <>
              <g style={{ animation: `cs-drift1 8s ease-in-out infinite` }} opacity={.82}>
                <ellipse cx="200" cy="30" rx="80" ry="22" fill={cc} opacity={.5} />
                <ellipse cx="178" cy="34" rx="55" ry="16" fill={cc} opacity={.4} />
                <ellipse cx="228" cy="32" rx="50" ry="15" fill={cc} opacity={.36} />
              </g>
              <g style={{ animation: `cs-drift2 12s ease-in-out infinite 2s` }} opacity={.7}>
                <ellipse cx="100" cy="50" rx="65" ry="18" fill={cc} opacity={.4} />
                <ellipse cx="76"  cy="54" rx="42" ry="12" fill={cc} opacity={.33} />
              </g>
            </>
          )}

          {/* Rain */}
          {weather === 'rain' && RAIN_DROPS.map(([x, y], i) => (
            <line key={i} x1={x} y1={y} x2={x+5} y2={y+14}
              stroke="rgba(180,210,240,0.55)" strokeWidth={.8}
              style={{ animation: `cs-rain ${.6 + (i % 4) * .15}s linear infinite ${(i * .11) % 1}s` }} />
          ))}

          {/* Snow */}
          {weather === 'snow' && SNOW_FLAKES.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i % 4 === 0 ? 2.2 : i % 3 === 0 ? 1.6 : 1.1}
              fill="rgba(255,255,255,0.75)"
              style={{ animation: `cs-snow ${2.2 + (i % 5) * .4}s ease-in-out infinite ${(i * .18) % 2}s` }} />
          ))}

          {/* Wind lines */}
          {weather === 'wind' && [[10,38,80],[5,55,60],[8,70,90],[6,48,70],[7,62,50]].map(([h,y,len],i) => (
            <line key={i} x1={-60} y1={y} x2={-60+len} y2={y}
              stroke="rgba(255,255,255,0.22)" strokeWidth={h/4} strokeLinecap="round"
              style={{ animation: `cs-wind ${1.2 + i * .3}s ease-in-out infinite ${i * .4}s` }} />
          ))}

          {/* Hot air balloon */}
          <g style={{ animation: `cs-balloon 5s ease-in-out infinite`, transformOrigin: `${bx}px ${by+28}px` }}
             opacity={isNight ? .4 : .88}>
            <ellipse cx={bx} cy={by+13} rx="19" ry="23" fill="#7BBFAA" />
            <path d={`M${bx-19},${by+13} Q${bx},${by-11} ${bx+19},${by+13}`} fill="#5BA090" opacity={.55} />
            <path d={`M${bx-19},${by+13} Q${bx},${by+37} ${bx+19},${by+13}`} fill="#4A9080" opacity={.38} />
            <line x1={bx-19} y1={by+13} x2={bx+19} y2={by+13} stroke="rgba(44,58,53,0.18)" strokeWidth={.7} />
            <line x1={bx} y1={by-9}  x2={bx}    y2={by+36} stroke="rgba(44,58,53,0.18)" strokeWidth={.7} />
            <line x1={bx-13} y1={by+34} x2={bx-8} y2={by+42} stroke="#8A7A60" strokeWidth={.9} />
            <line x1={bx+13} y1={by+34} x2={bx+8} y2={by+42} stroke="#8A7A60" strokeWidth={.9} />
            <rect x={bx-9} y={by+42} width="18" height="8" rx="2.5" fill="#C09870" />
            <rect x={bx-7} y={by+43} width="14" height="6" rx="2"   fill="#A07848" opacity={.55} />
          </g>

          {/* Birds */}
          {!isNight && (
            <>
              <g style={{ animation: `cs-bfly 22s linear infinite 2s` }} opacity={.45}>
                <path d="M0,40 Q3.5,35 7,40 Q10.5,35 14,40" stroke="#4A6A80" strokeWidth="1.1" fill="none" strokeLinecap="round" />
                <path d="M18,34 Q21,29 24,34 Q27,29 30,34" stroke="#4A6A80" strokeWidth=".9"  fill="none" strokeLinecap="round" />
                <path d="M34,38 Q37,33 40,38 Q43,33 46,38" stroke="#4A6A80" strokeWidth=".9"  fill="none" strokeLinecap="round" />
              </g>
              <g style={{ animation: `cs-bfly2 30s linear infinite 11s` }} opacity={.3}>
                <path d="M0,28 Q3,23 6,28 Q9,23 12,28"   stroke="#4A6A80" strokeWidth=".9" fill="none" strokeLinecap="round" />
                <path d="M16,32 Q19,27 22,32 Q25,27 28,32" stroke="#4A6A80" strokeWidth=".8" fill="none" strokeLinecap="round" />
              </g>
            </>
          )}

          {/* Haze at horizon */}
          <rect x="0" y="74" width="375" height="28" fill="url(#cs-haze)" />

          {/* ROCK — drawn BEFORE water so water covers underwater portion */}
          <path d={`M12,160 L12,92 L18,91 L24,91 L30,90 L38,90 L44,90 L52,90 L60,90 L66,91 L72,91 L78,91 L84,92 L90,91 L94,92 L94,160Z`} fill={rC} />
          <path d={`M16,160 L16,92 L22,92 L28,91 L36,91 L44,91 L52,90 L60,91 L66,91 L72,91 L78,92 L84,92 L90,92 L92,92 L92,160Z`} fill={rM} />
          <path d={`M22,160 L22,92 L30,92 L38,91 L46,91 L52,91 L58,91 L64,91 L70,92 L76,92 L82,92 L86,160Z`} fill={rD} />
          <path d="M14,92 L20,90 L24,91" stroke={rC} strokeWidth=".7" fill="none" opacity={.5} />
          <path d="M80,91 L86,90 L92,91" stroke={rC} strokeWidth=".7" fill="none" opacity={.45} />

          {/* Water — covers underwater rock */}
          <rect x="0" y="92" width="375" height="68" fill="url(#cs-water)" />
          <rect x="0" y="92" width="375" height="24" fill="url(#cs-sheen)" />

          {/* Sun reflection (dawn/sundown) */}
          {(isSundown || isDawn) && !sun.moon && (
            <ellipse cx={isSundown ? sun.x + 30 : sun.x + 20} cy={150} rx={55} ry={8} fill={sun.c} opacity={.1} />
          )}

          {/* Wave layers — amplitude tied to sales */}
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
          <path
            d={`M100,${92-Math.round(amp*.15)} C140,${92-Math.round(amp*.3)} 180,${92+Math.round(amp*.15)} 220,${92-Math.round(amp*.15)} C260,${92-Math.round(amp*.3)} 300,${92+Math.round(amp*.15)} 340,${92-Math.round(amp*.15)} C360,${92-Math.round(amp*.2)} 372,${92+Math.round(amp*.1)} 375,${92}`}
            stroke="white" strokeWidth={.6 + sc01 * .7} fill="none" opacity={foamOp} />
          <path
            d={`M100,${106-Math.round(amp*.1)} C145,${106-Math.round(amp*.2)} 195,${106+Math.round(amp*.12)} 245,${106-Math.round(amp*.1)} C295,${106-Math.round(amp*.2)} 340,${106+Math.round(amp*.12)} 375,${106}`}
            stroke="white" strokeWidth={.6} fill="none" opacity={(parseFloat(foamOp) * .55).toFixed(2)} />

          {/* Sharks — count/visibility tied to expenses (currently fixed, will connect to KPI) */}
          <g style={{ animation: `cs-shark1 9s ease-in-out infinite` }} opacity={isNight ? .38 : .58}>
            <path d="M268,112 L277,103 L286,112" fill={isNight ? '#0A2030' : '#1A3A50'} />
            <ellipse cx="277" cy="113" rx="11" ry="3.5" fill={isNight ? '#0A2030' : '#1A3A50'} opacity={.36} />
          </g>
          <g style={{ animation: `cs-shark2 13s ease-in-out infinite 4s` }} opacity={isNight ? .28 : .4}>
            <path d="M320,118 L327,111 L334,118" fill={isNight ? '#0A2030' : '#1A3A50'} />
            <ellipse cx="327" cy="119" rx="9" ry="3" fill={isNight ? '#0A2030' : '#1A3A50'} opacity={.3} />
          </g>

          {/* Sailboat */}
          <g style={{ animation: `cs-bob 5.5s ease-in-out infinite` }}>
            <rect x="148" y="101" width="24" height="8" rx="3.5" fill="#C09870" opacity={.88} />
            <line x1="159" y1="101" x2="159" y2="82" stroke="#8A6840" strokeWidth="1.3" />
            <path d="M159,84 L174,97 L159,101Z" fill="#F0EDE4" opacity={.9} />
            <path d="M159,87 L146,97 L159,101Z" fill="#E4E0D8" opacity={.65} />
          </g>

          {/* Wave crash spray at rocks */}
          <g style={{ animation: `cs-sprayl ${spraySpd}s ease-in-out infinite` }}>
            <path d={`M8,${96-Math.round(amp*.25)} Q14,${87-Math.round(amp*.45)} 20,${92-Math.round(amp*.2)}`}
              stroke="white" strokeWidth={.8 + sc01 * .9} fill="none" strokeLinecap="round" opacity={sprayOp} />
            <path d={`M6,${98} Q14,${87-Math.round(amp*.4)} 22,${94}Z`}
              fill="white" opacity={(parseFloat(sprayOp) * .6).toFixed(2)} />
            <circle cx="12" cy={86-Math.round(amp*.4)} r={.8 + sc01 * 1.2}
              fill="white" opacity={(parseFloat(sprayOp) * .7).toFixed(2)} />
          </g>
          <g style={{ animation: `cs-spray ${spraySpd}s ease-in-out infinite .7s` }}>
            <path d={`M88,${95-Math.round(amp*.2)} Q94,${87-Math.round(amp*.38)} 100,${92}`}
              stroke="white" strokeWidth={.7 + sc01 * .7} fill="none" strokeLinecap="round"
              opacity={(parseFloat(sprayOp) * .85).toFixed(2)} />
            <circle cx="96" cy={85-Math.round(amp*.35)} r={.7 + sc01}
              fill="white" opacity={(parseFloat(sprayOp) * .6).toFixed(2)} />
          </g>
          <g style={{ animation: `cs-spray2 ${spraySpd}s ease-in-out infinite 1.5s` }}>
            <circle cx="22" cy={90-Math.round(amp*.3)} r={.6 + sc01 * .9}
              fill="white" opacity={(parseFloat(sprayOp) * .5).toFixed(2)} />
            <circle cx="82" cy={91-Math.round(amp*.25)} r={.5 + sc01 * .8}
              fill="white" opacity={(parseFloat(sprayOp) * .45).toFixed(2)} />
          </g>

          {/* Lighthouse */}
          <g>
            <g style={{ transformOrigin: `${lx}px ${lBase}px`, animation: `cs-beam 4s ease-in-out infinite` }}>
              <path d={`M${lx},${lBase} L${lx-36},${lBase-38} L${lx+36},${lBase-38}Z`} fill="#FFFDE0" opacity={.09} />
            </g>
            <path d={`M${lx-8},${lBase} L${lx-6},${lBase-36} L${lx+6},${lBase-36} L${lx+8},${lBase}Z`} fill="#D0C8B0" />
            <rect x={lx-7} y={lBase-7}  width="14" height="8" fill="#C0B8A8" />
            <rect x={lx-6} y={lBase-14} width="12" height="8" fill="#C8C0B0" />
            <rect x={lx-7} y={lBase-8}  width="2"  height="6" fill="#AEA898" opacity={.6} />
            <rect x={lx+5} y={lBase-8}  width="2"  height="6" fill="#AEA898" opacity={.6} />
            <rect x={lx-5} y={lBase-22} width="10" height="9" rx="1" fill="#A8A898" />
            <rect x={lx-6} y={lBase-27} width="12" height="6" rx="1" fill="#C8C0A8" />
            <rect x={lx-7} y={lBase-31} width="14" height="5" rx="1" fill="#B8B0A0" />
            <circle cx={lx} cy={lBase-30} r="4.5" fill="#F5E07A" />
            <circle cx={lx} cy={lBase-30} r="7.5" fill="#FFFDE0" opacity={.24} />
            <rect x={lx-9} y={lBase} width="18" height="3" rx="1" fill="#A8A090" />
          </g>

          {/* Deep water overlay at bottom */}
          <rect x="0" y="150" width="375" height="10" fill={w3} opacity={.5} />
        </g>
      </svg>
    </div>
  )
}

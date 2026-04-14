import { coastal } from "../theme/skins";

type TimeOfDay = "dawn" | "morning" | "afternoon" | "sundown" | "night";

function timeOfDay(d = new Date()): TimeOfDay {
  const h = d.getHours();
  if (h < 6) return "night";
  if (h < 9) return "dawn";
  if (h < 13) return "morning";
  if (h < 17) return "afternoon";
  if (h < 20) return "sundown";
  return "night";
}

export function CoastalScene() {
  const tod = timeOfDay();
  const s = coastal.scene;

  // Base sky tinted slightly by time of day — still using only reference colors.
  const skyOpacity =
    tod === "night" ? 0.55 : tod === "dawn" || tod === "sundown" ? 0.85 : 1;

  return (
    <div style={{ position: "relative", width: "100%", height: 140, background: s.sky, overflow: "hidden" }}>
      <svg viewBox="0 0 280 140" width="100%" height="140" style={{ display: "block" }}>
        {/* Sky overlay for time-of-day */}
        <rect x="0" y="0" width="280" height="140" fill={s.sky} opacity={skyOpacity} />

        {/* Sun */}
        <circle cx={tod === "sundown" ? 40 : 220} cy={tod === "night" ? -20 : 35} r="14" fill={s.sun} />

        {/* Clouds */}
        <ellipse cx="80" cy="30" rx="18" ry="6" fill={s.clouds} />
        <ellipse cx="150" cy="22" rx="14" ry="5" fill={s.clouds} />

        {/* Birds */}
        <path d="M 110 45 q 3 -3 6 0 q 3 -3 6 0" stroke={s.birds} strokeWidth="1" fill="none" />
        <path d="M 180 50 q 3 -3 6 0 q 3 -3 6 0" stroke={s.birds} strokeWidth="1" fill="none" />

        {/* Water */}
        <rect x="0" y="85" width="280" height="55" fill={s.waterBase} opacity={s.waterBaseOpacity} />
        <rect x="0" y="110" width="280" height="30" fill={s.waterDeep} opacity={s.waterDeepOpacity} />
        {/* Foam highlights */}
        <path d="M 0 88 q 20 -2 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0" stroke={s.foam} strokeWidth="1" fill="none" />

        {/* Fish */}
        <path d="M 60 115 q 4 -3 8 0 l -3 3 z" fill={s.fish} />

        {/* Lighthouse */}
        <rect x="215" y="55" width="10" height="40" fill={s.lighthouseBody} />
        <rect x="213" y="52" width="14" height="4" fill={s.lighthouseWalls} />
        <circle cx="220" cy="58" r="3" fill={s.lighthouseLight} />
        <rect x="210" y="95" width="20" height="6" fill={s.lighthouseBase} />

        {/* Palm */}
        <path d="M 30 120 q 2 -30 -2 -55" stroke={s.palmTrunk} strokeWidth="2" fill="none" />
        <path d="M 28 65 q -15 -5 -22 5 M 28 65 q 15 -5 22 5 M 28 65 q -5 -15 -15 -18 M 28 65 q 5 -15 15 -18"
              stroke={s.palmLeaves} strokeWidth="3" fill="none" strokeLinecap="round" />
        <rect x="24" y="120" width="10" height="4" fill={s.palmBase} />

        {/* Beach umbrella */}
        <path d="M 155 105 q 15 -10 30 0 z" fill={s.umbrellaTop} />
        <line x1="170" y1="105" x2="170" y2="122" stroke={s.umbrellaPole} strokeWidth="1.5" />
        <rect x="158" y="120" width="24" height="3" fill={s.umbrellaFabric} />
      </svg>
    </div>
  );
}

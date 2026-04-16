// Coastal skin — all values extracted verbatim from reference HTML.
// No invented colors.
export type TileStop = {
  bg: string;
  label: string;
  value: string;
  status: string;
  statusText: string;
};

export const coastal = {
  // Phone frame
  phoneBg: "#8A8E92",
  sheetBg: "#F4F4F4",
  pageBg: "#f5f5f5",
  phoneBorder: "#ddd",
  phoneShadow: "0 20px 60px rgba(0,0,0,.12)",

  // Status bar
  statusBarBg: "#2E3235",

  // Scene
  scene: {
    sky: "#C8DCE8",
    sun: "#F0D88A",
    sunPalm: "#F4C875",
    clouds: "#DDE8F0",
    birds: "#8A9C9C",
    waterBase: "#7BBFAA",
    waterBaseOpacity: 0.6,
    foam: "#E4EDED",
    waterDeep: "#5BA090",
    waterDeepOpacity: 0.65,
    umbrellaTop: "#C09870",
    umbrellaPole: "#6B4020",
    umbrellaFabric: "#F0EDE4",
    fish: "#5BA090",
    lighthouseBody: "#2C3A35",
    lighthouseLight: "#F5E07A",
    lighthouseWalls: "#E4EDED",
    lighthouseBase: "#8A9C9C",
    palmLeaves: "#F4C875",
    palmTrunk: "#8A7A60",
    palmBase: "#C4922A",
  },

  // Bars — full-width light KPI tiles (same family as grid tiles)
  salesBar: {
    bg: "#DCE6E6",
    label: "#8A9C9C",
    sub: "#5BA090",
    value: "#1A2E28",
  },
  netBar: {
    bg: "#DCE6E6",
    value: "#5BA090",
    sub: "#5BA090",
    label: "#8A9C9C",
  },

  // Tile palettes (kept for reference)
  tiles: {
    green: {
      bg: "#B8E4D0",
      label: "#1A5A38",
      value: "#0E7840",
      status: "#2A6848",
      statusText: "#2A6848",
    } as TileStop,
    yellow: {
      bg: "#FFF2B0",
      label: "#6A4800",
      value: "#A87800",
      status: "#7A5600",
      statusText: "#7A5600",
    } as TileStop,
    red: {
      bg: "#FFCCD4",
      label: "#780A14",
      value: "#C01820",
      status: "#880E18",
      statusText: "#880E18",
    } as TileStop,
  },

  // Marquee — warm cream/driftwood, part of the coastal family
  marquee: {
    bg: "#F0EBDD",
    text: "#5A4A2E",
  },
  toggle: {
    onBg: "#7ED8B4",
    onColor: "#0A4A2A",
    offBg: "transparent",
    offColor: "#8A7A60",
    offBorder: "#C8B898",
  },

  // Bottom tabs
  tabs: {
    bg: "#E8EDEC",
    inactive: "#8A9C9C",
    activeGizmo: "#1A8C6B",
  },

  // Skin selector
  selector: {
    bg: "#8ABFB0",
    color: "#1A2E28",
  },

  // Fonts
  fonts: {
    manrope: "'Manrope', sans-serif",
    condensed: "'Barlow Condensed', sans-serif",
    mono: "'Share Tech Mono', monospace",
    bebas: "'Bebas Neue', sans-serif",
  },

  // Marquee animation
  marqueeDuration: "22s",

  // Phone frame dims
  phoneWidth: 280,
  phoneHeight: 568,
  phoneRadius: 36,
};

// Full 8-stop gradient: score 1 (worst/red) → 8 (best/deep teal-green)
// Each stop is visually distinct — no two adjacent scores share the same hue.
const TILE_GRADIENT: TileStop[] = [
  // 1 — Worst (deep coral-red)
  { bg: "#FF8888", label: "#5C0010", value: "#720012", status: "#620010", statusText: "#620010" },
  // 2 — Critical (salmon)
  { bg: "#FFAAA0", label: "#780A14", value: "#920E1A", status: "#880E18", statusText: "#880E18" },
  // 3 — Bad (warm amber-orange)
  { bg: "#FFBC72", label: "#7A3200", value: "#8A3C00", status: "#7A3200", statusText: "#7A3200" },
  // 4 — Alert (golden yellow)
  { bg: "#FFE070", label: "#6A4800", value: "#7A5200", status: "#6A4800", statusText: "#6A4800" },
  // 5 — Caution (pale yellow-green, neutral transition)
  { bg: "#E8F5A8", label: "#4A5C10", value: "#526618", status: "#4A5C10", statusText: "#4A5C10" },
  // 6 — Watch (light seafoam)
  { bg: "#B8EDD4", label: "#1A6040", value: "#147248", status: "#1A6840", statusText: "#1A6840" },
  // 7 — Good (medium coastal mint)
  { bg: "#7ED8B4", label: "#0A4A2A", value: "#0C5832", status: "#0A5230", statusText: "#0A5230" },
  // 8 — Excellent (rich deep teal-green)
  { bg: "#4EC89A", label: "#083820", value: "#0A4828", status: "#084020", statusText: "#084020" },
];

export function tileForScore(score: number): TileStop {
  const idx = Math.min(8, Math.max(1, Math.round(score))) - 1;
  return TILE_GRADIENT[idx];
}

export const spectrum: TileStop[] = TILE_GRADIENT;
 

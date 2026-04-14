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
  phoneBg: "#E4EDED",
  pageBg: "#f5f5f5",
  phoneBorder: "#ddd",
  phoneShadow: "0 20px 60px rgba(0,0,0,.12)",

  // Status bar
  statusBarBg: "#2C3A35",

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

  // Bars
  salesBar: {
    bg: "#2C3A35",
    label: "rgba(255,255,255,.5)",
    sub: "#7BBFAA",
    value: "#fff",
  },
  netBar: {
    bg: "#1A2E28",
    value: "#7BBFAA",
    sub: "#7BBFAA",
    label: "rgba(255,255,255,.45)",
  },

  // Tile palettes — only 3 stops exist in the reference:
  // GREEN (Excellent/Good), YELLOW (Caution/Watch), RED (Critical).
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

  // Marquee
  marquee: {
    bg: "#2C3A35",
    text: "rgba(255,255,255,.6)",
  },
  toggle: {
    onBg: "#7BBFAA",
    onColor: "#1A2E28",
    offBg: "rgba(255,255,255,.1)",
    offColor: "rgba(255,255,255,.3)",
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

// 8-stop score mapping — uses only the 3 reference palettes.
// 1–2 = red (Critical), 3–5 = yellow (Caution/Watch), 6–8 = green (Good/Excellent).
export function tileForScore(score: number): TileStop {
  if (score <= 2) return coastal.tiles.red;
  if (score <= 5) return coastal.tiles.yellow;
  return coastal.tiles.green;
}

export const spectrum: TileStop[] = [
  coastal.tiles.red,    // 1
  coastal.tiles.red,    // 2
  coastal.tiles.yellow, // 3
  coastal.tiles.yellow, // 4
  coastal.tiles.yellow, // 5
  coastal.tiles.green,  // 6
  coastal.tiles.green,  // 7
  coastal.tiles.green,  // 8
];

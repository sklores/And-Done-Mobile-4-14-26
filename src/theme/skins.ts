// And Done mobile — skin system.
//
// Four skins per the master brief: Coastal (default), Le Mans, Nostromo,
// New York. A skin controls the animated scene (separate components),
// typography, palette, KPI tile ramp, and app chrome. Coastal's values are
// verbatim from the original reference HTML — untouched by the skin refactor.
//
// Sources: "And Done — Mobile Skins Reference" (operator doc, 2026-07-07).
// Palettes are from that doc; the 8-stop ramps for the three new skins are
// derived from each skin's documented good/caution/critical tile colors
// (the exact original ramps live in a claude.ai artifact — operator chose
// "build from the doc and iterate on preview").

import { create } from "zustand";

export type TileStop = {
  bg: string;
  label: string;
  value: string;
  status: string;
  statusText: string;
  /** Optional 1px tile border — the "dark with borders" skins (Nostromo,
   *  New York) carry their state color here; pastel skins leave it unset. */
  border?: string;
};

export type SkinId = "coastal" | "lemans" | "nostromo" | "newyork";

type SkinFonts = {
  /** Body/text font for the skin. */
  body: string;
  /** Display font — KPI values, headers, big numbers. */
  display: string;
  /** Render the display font italic (Le Mans = Barlow Condensed Italic). */
  displayItalic?: boolean;
  // Legacy family keys — kept on every skin so any un-swept reference
  // still resolves. Same strings on all skins.
  manrope: string;
  condensed: string;
  mono: string;
  bebas: string;
};

/** Day/dusk/night chrome colors App.tsx threads through the frame,
 *  nameplate, page + phone backgrounds and the PWA theme-color sync. */
type SkinChrome = {
  frame: string;          // scene frame + bottom-tab strip (day)
  frameDusk: string;
  frameSeam: string;
  frameSeamDusk: string;
  namePlateBg: string;
  namePlateBgDusk: string; // matches THIS skin's scene at night (seam trick)
  namePlateText: string;
  namePlateTextDusk: string;
  pageBgDusk: string;
  phoneBgDusk: string;
  phoneBgNight: string;
  /** Coastal/Le Mans pastel chrome gets dimmed after dark; the always-dark
   *  skins (Nostromo, New York) must NOT be — they're already night-tuned. */
  dimAtNight: boolean;
};

export type Skin = {
  id: SkinId;
  name: string;
  tagline?: string;

  phoneBg: string;
  sheetBg: string;
  pageBg: string;
  phoneBorder: string;
  phoneShadow: string;
  statusBarBg: string;

  salesBar: { bg: string; label: string; sub: string; value: string };
  netBar: { bg: string; value: string; sub: string; label: string };

  tiles: { green: TileStop; yellow: TileStop; red: TileStop };

  marquee: { bg: string; text: string };
  toggle: {
    onBg: string;
    onColor: string;
    offBg: string;
    offColor: string;
    offBorder: string;
  };
  tabs: { bg: string; inactive: string; activeGizmo: string };
  selector: { bg: string; color: string };

  fonts: SkinFonts;
  chrome: SkinChrome;
  spectrum: TileStop[];

  marqueeDuration: string;
  phoneWidth: number;
  phoneHeight: number;
  phoneRadius: number;

  /** Coastal keeps its original scene color block (unused by components —
   *  scenes are self-contained — but preserved verbatim). */
  scene?: Record<string, string | number>;
};

const FONT_FAMILIES = {
  manrope: "'Manrope', sans-serif",
  condensed: "'Barlow Condensed', sans-serif",
  mono: "'Share Tech Mono', monospace",
  bebas: "'Bebas Neue', sans-serif",
};

// ─────────────────────────────────────────────────────────────────────────────
// COASTAL — default. All values verbatim from the original reference HTML.
// ─────────────────────────────────────────────────────────────────────────────

// Full 8-stop gradient: score 1 (worst/red) → 8 (best/deep teal-green)
// Each stop is visually distinct — no two adjacent scores share the same hue.
const COASTAL_GRADIENT: TileStop[] = [
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

export const coastal: Skin = {
  id: "coastal",
  name: "Coastal",

  // Phone frame
  phoneBg: "#F0EBDD",
  sheetBg: "#F4F4F4",
  pageBg: "#F0EBDD",
  phoneBorder: "#ddd",
  phoneShadow: "0 20px 60px rgba(0,0,0,.12)",

  // Status bar
  statusBarBg: "#2E3235",

  // Scene (kept verbatim — CoastalScene is self-contained and doesn't read
  // this, but it's the documented reference palette)
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
      bg: "#B8E4D0", label: "#1A5A38", value: "#0E7840", status: "#2A6848", statusText: "#2A6848",
    },
    yellow: {
      bg: "#FFF2B0", label: "#6A4800", value: "#A87800", status: "#7A5600", statusText: "#7A5600",
    },
    red: {
      bg: "#FFCCD4", label: "#780A14", value: "#C01820", status: "#880E18", statusText: "#880E18",
    },
  },

  // Marquee — warm cream/driftwood, part of the coastal family
  marquee: { bg: "#F0EBDD", text: "#5A4A2E" },
  toggle: {
    onBg: "#7ED8B4",
    onColor: "#0A4A2A",
    offBg: "transparent",
    offColor: "#8A7A60",
    offBorder: "#C8B898",
  },

  // Bottom tabs
  tabs: { bg: "#C4B090", inactive: "#8A9C9C", activeGizmo: "#1A8C6B" },

  // Skin selector
  selector: { bg: "#8ABFB0", color: "#1A2E28" },

  fonts: {
    body: FONT_FAMILIES.manrope,
    display: FONT_FAMILIES.condensed,
    displayItalic: false,
    ...FONT_FAMILIES,
  },

  chrome: {
    frame: "#C4B090",
    frameDusk: "#1A2438",
    frameSeam: "#A89070",
    frameSeamDusk: "#101828",
    namePlateBg: "#C4B090",
    namePlateBgDusk: "#132437", // sampled from the live night ocean — seam trick
    namePlateText: "#3A2A10",
    namePlateTextDusk: "#D8E0F0",
    pageBgDusk: "#1E1A17",
    phoneBgDusk: "#2A2320",
    phoneBgNight: "#1E1A17",
    dimAtNight: true,
  },

  spectrum: COASTAL_GRADIENT,

  marqueeDuration: "22s",
  phoneWidth: 280,
  phoneHeight: 568,
  phoneRadius: 36,
};

// ─────────────────────────────────────────────────────────────────────────────
// LE MANS — Sarthe circuit at dawn. Classic, precise.
// Palette: British Racing Green #1B4D2E, Cream #EEE8D0, Tobacco gold #C4922A,
// Oxblood #6B1F1F, Leather #8B5E3C, Asphalt #2A2A18. Barlow Condensed Italic.
// Tiles: dark, rich — racing green (good), dark amber (caution), oxblood (critical).
// ─────────────────────────────────────────────────────────────────────────────

const LEMANS_GRADIENT: TileStop[] = [
  // 1 — Worst (deep oxblood)
  { bg: "#5A1616", label: "#E8B0A8", value: "#F5D8D2", status: "#E0B8B0", statusText: "#E0B8B0" },
  // 2 — Critical (oxblood)
  { bg: "#6B1F1F", label: "#ECB8B0", value: "#F8DCD6", status: "#E4C0B8", statusText: "#E4C0B8" },
  // 3 — Bad (burnt sienna)
  { bg: "#8A4014", label: "#F0C8A8", value: "#FAE4CC", status: "#ECCFB0", statusText: "#ECCFB0" },
  // 4 — Alert (dark amber)
  { bg: "#A87818", label: "#FBE8B8", value: "#FFF4D6", status: "#F6E2B0", statusText: "#F6E2B0" },
  // 5 — Caution (olive transition)
  { bg: "#8A7A28", label: "#EEE8C0", value: "#FAF6DC", status: "#E6E0B8", statusText: "#E6E0B8" },
  // 6 — Watch (muted green)
  { bg: "#3E6B42", label: "#C4DCC0", value: "#EAF2E0", status: "#CCE0C4", statusText: "#CCE0C4" },
  // 7 — Good (deep green)
  { bg: "#2A5E3A", label: "#B4D4B4", value: "#F0EAD6", status: "#BFD9BC", statusText: "#BFD9BC" },
  // 8 — Excellent (British Racing Green)
  { bg: "#1B4D2E", label: "#A8CCA8", value: "#EEE8D0", status: "#B8D4B0", statusText: "#B8D4B0" },
];

export const lemans: Skin = {
  id: "lemans",
  name: "Le Mans",

  phoneBg: "#EEE8D0",
  sheetBg: "#F4F0E2",
  pageBg: "#EEE8D0",
  phoneBorder: "#ddd",
  phoneShadow: "0 20px 60px rgba(0,0,0,.12)",
  statusBarBg: "#2A2A18",

  salesBar: { bg: "#1B4D2E", label: "#A8CCA8", sub: "#C4922A", value: "#EEE8D0" },
  netBar:   { bg: "#16371F", value: "#C4922A", sub: "#8FAE8F", label: "#A8CCA8" },

  tiles: {
    green:  LEMANS_GRADIENT[7],
    yellow: LEMANS_GRADIENT[3],
    red:    LEMANS_GRADIENT[1],
  },

  marquee: { bg: "#2A2A18", text: "#D8D2B8" },
  toggle: {
    onBg: "#C4922A",
    onColor: "#241C08",
    offBg: "transparent",
    offColor: "#9A9478",
    offBorder: "#5A5A40",
  },

  tabs: { bg: "#8B5E3C", inactive: "#D8C8B0", activeGizmo: "#F5E8C8" },
  selector: { bg: "#1B4D2E", color: "#EEE8D0" },

  fonts: {
    body: FONT_FAMILIES.manrope,
    display: FONT_FAMILIES.condensed,
    displayItalic: true, // Barlow Condensed Italic — the skin's signature
    ...FONT_FAMILIES,
  },

  chrome: {
    frame: "#8B5E3C",          // leather
    frameDusk: "#241E12",
    frameSeam: "#6E4A2E",
    frameSeamDusk: "#181408",
    namePlateBg: "#8B5E3C",
    namePlateBgDusk: "#1A1A10", // night asphalt — matches LeMansScene ground
    namePlateText: "#F2E8D0",
    namePlateTextDusk: "#D8D2B8",
    pageBgDusk: "#181810",
    phoneBgDusk: "#201F14",
    phoneBgNight: "#181810",
    dimAtNight: true,
  },

  spectrum: LEMANS_GRADIENT,

  marqueeDuration: "22s",
  phoneWidth: 280,
  phoneHeight: 568,
  phoneRadius: 36,
};

// ─────────────────────────────────────────────────────────────────────────────
// NOSTROMO — Weyland-Yutani corporate. Clean institutional surface over dark
// reality. Palette: WY Blue #1658CC, Institutional white #F0F4F2, Deep space
// #0A0A18, Bulkhead grey #B8C8C4, Alert red #CC0000, Caution yellow #E8C020.
// Share Tech Mono. Tiles: dark with borders — phosphor green / yellow / red.
// ─────────────────────────────────────────────────────────────────────────────

const NOSTROMO_GRADIENT: TileStop[] = [
  // 1 — Danger (alert red)
  { bg: "#1A0505", label: "#B8C8C4", value: "#FF3838", status: "#E05050", statusText: "#E05050", border: "#CC0000" },
  // 2 — Critical
  { bg: "#1C0808", label: "#B8C8C4", value: "#FF5850", status: "#D85858", statusText: "#D85858", border: "#B81414" },
  // 3 — Bad (hot amber)
  { bg: "#1A1005", label: "#B8C8C4", value: "#F09040", status: "#D08850", statusText: "#D08850", border: "#C06818" },
  // 4 — Alert (caution yellow, hot)
  { bg: "#181405", label: "#B8C8C4", value: "#F0BC30", status: "#D0A840", statusText: "#D0A840", border: "#C89818" },
  // 5 — Caution (caution yellow)
  { bg: "#161505", label: "#B8C8C4", value: "#E8C020", status: "#C8AC38", statusText: "#C8AC38", border: "#B8A020" },
  // 6 — Watch (phosphor, dim)
  { bg: "#0A1810", label: "#B8C8C4", value: "#38C878", status: "#48A868", statusText: "#48A868", border: "#1A8A4A" },
  // 7 — Good (phosphor)
  { bg: "#08180E", label: "#B8C8C4", value: "#3EE88A", status: "#42BC6E", statusText: "#42BC6E", border: "#1FA858" },
  // 8 — Nominal (phosphor green, full)
  { bg: "#06180C", label: "#B8C8C4", value: "#4EFF9A", status: "#3ED47A", statusText: "#3ED47A", border: "#22CC66" },
];

export const nostromo: Skin = {
  id: "nostromo",
  name: "Nostromo",
  tagline: "BUILDING BETTER WORLDS",

  phoneBg: "#0A0A18",
  sheetBg: "#F0F4F2", // institutional white sheets over the dark hull
  pageBg: "#0A0A18",
  phoneBorder: "#222",
  phoneShadow: "0 20px 60px rgba(0,0,0,.4)",
  statusBarBg: "#0A0A18",

  salesBar: { bg: "#0E1626", label: "#8FA6C8", sub: "#4E82E8", value: "#F0F4F2" },
  netBar:   { bg: "#0A1220", value: "#4E82E8", sub: "#8FA6C8", label: "#8FA6C8" },

  tiles: {
    green:  NOSTROMO_GRADIENT[7],
    yellow: NOSTROMO_GRADIENT[4],
    red:    NOSTROMO_GRADIENT[0],
  },

  marquee: { bg: "#0A0A18", text: "#8FA6C8" },
  toggle: {
    onBg: "#1658CC",
    onColor: "#F0F4F2",
    offBg: "transparent",
    offColor: "#5A6A88",
    offBorder: "#2A3A58",
  },

  tabs: { bg: "#B8C8C4", inactive: "#5A6A68", activeGizmo: "#1658CC" },
  selector: { bg: "#1658CC", color: "#FFFFFF" },

  fonts: {
    body: FONT_FAMILIES.mono,
    display: FONT_FAMILIES.mono,
    displayItalic: false,
    ...FONT_FAMILIES,
  },

  chrome: {
    frame: "#B8C8C4",           // bulkhead grey — institutional trim
    frameDusk: "#8A9A96",
    frameSeam: "#98A8A4",
    frameSeamDusk: "#788884",
    namePlateBg: "#B8C8C4",
    namePlateBgDusk: "#0E1626", // deep space — matches the porthole view
    namePlateText: "#12203A",
    namePlateTextDusk: "#8FA6C8",
    pageBgDusk: "#0A0A18",
    phoneBgDusk: "#0A0A18",
    phoneBgNight: "#0A0A18",
    dimAtNight: false, // already night-tuned — dimming would crush it
  },

  spectrum: NOSTROMO_GRADIENT,

  marqueeDuration: "22s",
  phoneWidth: 280,
  phoneHeight: 568,
  phoneRadius: 36,
};

// ─────────────────────────────────────────────────────────────────────────────
// NEW YORK — Manhattan at night. Relentless, alive.
// Palette: Cab yellow #F7C948, Tungsten #C17F24, Asphalt #1C1C2A, Concrete
// #2A2A3C, Steam #E8E0D0, Neon blue #4169E1. Bebas Neue.
// Tiles: dark with borders — neon green / cab yellow / neon red.
// ─────────────────────────────────────────────────────────────────────────────

const NEWYORK_GRADIENT: TileStop[] = [
  // 1 — Critical (neon red)
  { bg: "#240A10", label: "#C8C0D0", value: "#FF4060", status: "#E85870", statusText: "#E85870", border: "#FF2850" },
  // 2 — Bad
  { bg: "#220C12", label: "#C8C0D0", value: "#FF5468", status: "#DC6078", statusText: "#DC6078", border: "#E82848" },
  // 3 — Poor (hot orange)
  { bg: "#241408", label: "#C8C0D0", value: "#FF9838", status: "#E08A48", statusText: "#E08A48", border: "#E07820" },
  // 4 — Caution (cab yellow)
  { bg: "#242008", label: "#C8C0D0", value: "#F7C948", status: "#DCBA50", statusText: "#DCBA50", border: "#F7C948" },
  // 5 — Watch (yellow-green transition)
  { bg: "#20220C", label: "#C8C0D0", value: "#D8DC48", status: "#BEC454", statusText: "#BEC454", border: "#C8C838" },
  // 6 — Decent (neon green, dim)
  { bg: "#0E2014", label: "#C8C0D0", value: "#40D078", status: "#4CB86A", statusText: "#4CB86A", border: "#28A858" },
  // 7 — Good (neon green)
  { bg: "#0E2216", label: "#C8C0D0", value: "#38E884", status: "#3ECC72", statusText: "#3ECC72", border: "#22C868" },
  // 8 — Excellent (neon green, full)
  { bg: "#0C2414", label: "#C8C0D0", value: "#3CFF8C", status: "#36E078", statusText: "#36E078", border: "#22E06A" },
];

export const newyork: Skin = {
  id: "newyork",
  name: "New York",

  phoneBg: "#1C1C2A",
  sheetBg: "#E8E0D0", // steam — warm paper over the asphalt night
  pageBg: "#1C1C2A",
  phoneBorder: "#222",
  phoneShadow: "0 20px 60px rgba(0,0,0,.4)",
  statusBarBg: "#14141E",

  salesBar: { bg: "#26263A", label: "#A8A0B8", sub: "#F7C948", value: "#F7C948" },
  netBar:   { bg: "#1C1C2A", value: "#F7C948", sub: "#A8A0B8", label: "#A8A0B8" },

  tiles: {
    green:  NEWYORK_GRADIENT[7],
    yellow: NEWYORK_GRADIENT[3],
    red:    NEWYORK_GRADIENT[0],
  },

  marquee: { bg: "#14141E", text: "#E8E0D0" },
  toggle: {
    onBg: "#F7C948",
    onColor: "#1C1C2A",
    offBg: "transparent",
    offColor: "#8A8298",
    offBorder: "#3A3A50",
  },

  tabs: { bg: "#14141E", inactive: "#6A6478", activeGizmo: "#F7C948" },
  selector: { bg: "#F7C948", color: "#111118" },

  fonts: {
    body: FONT_FAMILIES.manrope,   // Bebas has no lowercase — display only
    display: FONT_FAMILIES.bebas,
    displayItalic: false,
    ...FONT_FAMILIES,
  },

  chrome: {
    frame: "#2A2A3C",           // concrete
    frameDusk: "#14141E",
    frameSeam: "#3A3A50",
    frameSeamDusk: "#0E0E16",
    namePlateBg: "#2A2A3C",
    namePlateBgDusk: "#10101A", // night asphalt below the window
    namePlateText: "#E8E0D0",
    namePlateTextDusk: "#C8C0D0",
    pageBgDusk: "#14141E",
    phoneBgDusk: "#1C1C2A",
    phoneBgNight: "#14141E",
    dimAtNight: false, // Manhattan at night IS the skin — don't dim it
  },

  spectrum: NEWYORK_GRADIENT,

  marqueeDuration: "22s",
  phoneWidth: 280,
  phoneHeight: 568,
  phoneRadius: 36,
};

// ─────────────────────────────────────────────────────────────────────────────
// Registry + active-skin store (persisted per device)
// ─────────────────────────────────────────────────────────────────────────────

export const SKINS: Record<SkinId, Skin> = { coastal, lemans, nostromo, newyork };
export const SKIN_IDS: SkinId[] = ["coastal", "lemans", "nostromo", "newyork"];

const STORAGE_KEY = "and-done-skin";

function loadStoredSkinId(): SkinId {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && raw in SKINS) return raw as SkinId;
  } catch { /* private mode / SSR — fall through */ }
  return "coastal";
}

type SkinState = {
  skinId: SkinId;
  setSkin: (id: SkinId) => void;
};

export const useSkinStore = create<SkinState>((set) => ({
  skinId: loadStoredSkinId(),
  setSkin: (id) => {
    try { window.localStorage.setItem(STORAGE_KEY, id); } catch { /* ignore */ }
    set({ skinId: id });
  },
}));

/** Reactive hook — components re-render when the skin changes. */
export function useSkin(): Skin {
  return SKINS[useSkinStore((s) => s.skinId)];
}

/** Non-reactive getter for rare non-component reads. */
export function getActiveSkin(): Skin {
  return SKINS[useSkinStore.getState().skinId];
}

/** Tile color for a 1–8 KPI score, from the ACTIVE skin's ramp. Existing
 *  call sites keep their bare tileForScore(score) signature — callers are
 *  components that also read useSkin(), so they re-render on skin change. */
export function tileForScore(score: number): TileStop {
  const idx = Math.min(8, Math.max(1, Math.round(score))) - 1;
  return getActiveSkin().spectrum[idx];
}

/** Legacy export — Coastal's ramp (kept for compatibility). */
export const spectrum: TileStop[] = COASTAL_GRADIENT;

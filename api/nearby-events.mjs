// Vercel serverless: GET /api/nearby-events
// Pulls foot-traffic signals for GCDC (1730 Penn Ave NW, DC 20006) from:
//   1. NWS alerts  — free, no key       (weather events)
//   2. Firecrawl   — $FIRECRAWL_API_KEY  (competitor/trend/venue events)
// Returns { events: NearbyEvent[] } matching the shape the mobile adapter expects.
// Cached 30 min at the edge — keeps Firecrawl spend small.

const FIRECRAWL_URL = "https://api.firecrawl.dev/v1/scrape";

// ── Source list (tweak freely) ─────────────────────────────────────────────
// Each entry is one Firecrawl scrape. We keep it short for v1; more can be
// added without schema changes. `kind` drives category + default severity.
const FIRECRAWL_SOURCES = [
  {
    name: "eater-dc",
    url: "https://dc.eater.com/",
    category: "competitor",
    severity: 5,
    impactHint: "neutral",
    venueName: "Eater DC",
    urlMustInclude: "dc.eater.com/",     // article URLs only
  },
  {
    name: "washingtonian-food",
    url: "https://www.washingtonian.com/sections/food-drink/",
    category: "trend",
    severity: 5,
    impactHint: "neutral",
    venueName: "Washingtonian",
    urlMustInclude: "washingtonian.com/",
  },
  {
    name: "capital-one-arena",
    url: "https://www.capitalonearena.com/events",
    category: "venue",
    severity: 7,
    impactHint: "increases foot traffic",
    venueName: "Capital One Arena",
    distanceM: 1300,
    urlMustInclude: "capitalonearena.com/",
  },
];

// ── NWS: weather alerts for DC zone DCZ001 ─────────────────────────────────
async function fetchNwsAlerts() {
  try {
    const res = await fetch(
      "https://api.weather.gov/alerts/active?zone=DCZ001",
      { headers: { "user-agent": "and-done-mobile (ops@and-done.app)" } },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const feats = Array.isArray(data.features) ? data.features : [];
    return feats.map((f, i) => {
      const p = f.properties || {};
      const sev = mapNwsSeverity(p.severity);
      return {
        id: `nws-${p.id || i}`,
        source: "nws",
        category: "weather",
        title: p.headline || p.event || "Weather alert",
        description: truncate(p.description || p.instruction || "", 220),
        startsAt: p.onset || p.effective || new Date().toISOString(),
        endsAt: p.ends || p.expires || null,
        allDay: false,
        venueName: p.areaDesc || "Washington DC",
        distanceM: null,
        severity: sev.score,
        impactHint: sev.hint,
        url: `https://www.weather.gov/`,
      };
    });
  } catch {
    return [];
  }
}

function mapNwsSeverity(raw) {
  switch ((raw || "").toLowerCase()) {
    case "extreme":  return { score: 1, hint: "decreases foot traffic" };
    case "severe":   return { score: 2, hint: "decreases foot traffic" };
    case "moderate": return { score: 3, hint: "decreases foot traffic" };
    case "minor":    return { score: 4, hint: "decreases foot traffic" };
    default:         return { score: 5, hint: "neutral" };
  }
}

// ── Firecrawl: scrape a URL, return markdown ──────────────────────────────
async function firecrawlScrape(url, key) {
  try {
    const res = await fetch(FIRECRAWL_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: true,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.markdown || null;
  } catch {
    return null;
  }
}

// Extract up to N article-like [headline](url) links from markdown.
// Filters out nav chrome, logos, "skip to content", login/subscribe, etc.
function extractHeadlineLinks(md, limit = 6, mustInclude = "") {
  if (!md) return [];
  const out = [];
  const seen = new Set();
  const seenTitles = new Set();

  // Junk-text filter — anything a headline would never actually say
  const JUNK_RE = /^(skip|app\s*icon|home|menu|search|subscribe|log\s*in|sign\s*(in|up)|contact|more|view\s+all|next|previous|return|share|comment|follow|save|read\s+more|get\s+our|download|the\s+homepage|logo|icon|back\s+to\s+top|show\s+more|\d+)\b/i;
  const GARBAGE_RE = /(logo|icon)$/i;
  const NON_ARTICLE_PATHS = /\/(tag|tags|author|authors|category|categories|about|contact|privacy|terms|rss|feed|login|signin|signup|subscribe|newsletter)\/?($|\/|#|\?)/i;
  const FILE_EXT = /\.(svg|png|jpe?g|ico|webp|gif|css|js|pdf)($|\?)/i;

  // Markdown links: [text](url) — require at least 12 chars of text
  const re = /\[([^\]\n]{12,200})\]\((https?:\/\/[^\s)]+)\)/g;
  let m;
  while ((m = re.exec(md)) !== null && out.length < limit) {
    // Clean text: strip markdown escape backslashes, collapse whitespace
    const text = m[1]
      .replace(/\\\\/g, "")
      .replace(/\\/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const href = m[2].trim().split("#")[0];

    // Word count ≥ 3 — headlines always have several words
    const wordCount = text.split(/\s+/).filter((w) => w.length > 1).length;
    if (wordCount < 3) continue;
    if (JUNK_RE.test(text)) continue;
    if (GARBAGE_RE.test(text)) continue;

    // URL must be an article-looking path
    if (FILE_EXT.test(href)) continue;
    if (NON_ARTICLE_PATHS.test(href)) continue;
    if (mustInclude && !href.includes(mustInclude)) continue;

    // Prefer paths with a dated or slugged article shape (≥ 2 path segs with hyphens)
    const path = href.replace(/^https?:\/\/[^/]+/, "");
    const segs = path.split("/").filter(Boolean);
    if (segs.length < 2) continue;
    const lastSeg = segs[segs.length - 1];
    if (!/[a-z].*-.*[a-z]/i.test(lastSeg)) continue; // slug must have hyphens + letters

    if (seen.has(href)) continue;
    const titleKey = text.toLowerCase();
    if (seenTitles.has(titleKey)) continue;

    seen.add(href);
    seenTitles.add(titleKey);
    out.push({ title: text, url: href });
  }
  return out;
}

async function fetchFirecrawlEvents(key) {
  if (!key) return [];
  const now = new Date().toISOString();
  const results = await Promise.all(
    FIRECRAWL_SOURCES.map(async (src) => {
      const md = await firecrawlScrape(src.url, key);
      const links = extractHeadlineLinks(md, 6, src.urlMustInclude || "");
      return links.map((l, i) => ({
        id: `${src.name}-${hash(l.url)}-${i}`,
        source: `firecrawl:${src.name}`,
        category: src.category,
        title: l.title,
        description: null,
        startsAt: now,        // news-style entries anchor to now
        endsAt: null,
        allDay: false,
        venueName: src.venueName,
        distanceM: src.distanceM ?? null,
        severity: src.severity,
        impactHint: src.impactHint,
        url: l.url,
      }));
    }),
  );
  return results.flat();
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

function truncate(s, n) {
  if (!s) return "";
  // strip HTML-ish and collapse whitespace
  const clean = String(s).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return clean.length > n ? clean.slice(0, n - 1) + "…" : clean;
}

// ── Handler ────────────────────────────────────────────────────────────────
export default async function handler(_req, res) {
  res.setHeader("content-type", "application/json");
  // 30 min edge cache, allow stale while revalidating
  res.setHeader("cache-control", "s-maxage=1800, stale-while-revalidate=3600");

  try {
    const key = process.env.FIRECRAWL_API_KEY || "";

    const [nws, fc] = await Promise.all([
      fetchNwsAlerts(),
      fetchFirecrawlEvents(key),
    ]);

    const events = [...nws, ...fc].sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );

    res.statusCode = 200;
    res.end(JSON.stringify({
      events,
      sources: {
        nws: nws.length,
        firecrawl: fc.length,
        firecrawlConfigured: !!key,
      },
      fetchedAt: new Date().toISOString(),
    }));
  } catch (e) {
    res.statusCode = 200;
    res.end(JSON.stringify({
      events: [],
      error: e instanceof Error ? e.message : String(e),
      fetchedAt: new Date().toISOString(),
    }));
  }
}

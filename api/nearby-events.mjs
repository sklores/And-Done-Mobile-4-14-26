// Vercel serverless: GET /api/nearby-events
// Pulls foot-traffic signals for GCDC (1730 Penn Ave NW, DC 20006) from:
//   1. NWS alerts — free JSON API, no key           (weather)
//   2. RSS feeds  — Eater DC, Washingtonian, DCist  (competitor + trend + community)
// No Firecrawl, no external keys. Cached 30 min at the edge.

// ── RSS sources ────────────────────────────────────────────────────────────
const RSS_SOURCES = [
  {
    name: "eater-dc",
    url: "https://dc.eater.com/rss/index.xml",
    category: "competitor",
    severity: 5,
    impactHint: "neutral",
    venueName: "Eater DC",
  },
  {
    name: "washingtonian-food",
    url: "https://www.washingtonian.com/sections/food-drink/feed/",
    category: "trend",
    severity: 5,
    impactHint: "neutral",
    venueName: "Washingtonian",
  },
  {
    name: "dcist",
    url: "https://dcist.com/feed/",
    category: "community",
    severity: 5,
    impactHint: "neutral",
    venueName: "DCist",
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

// ── RSS fetch + minimal XML parse ──────────────────────────────────────────
// Deliberately regex-based so we don't need an XML dep in the serverless bundle.
async function fetchRssItems(url) {
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": "and-done-mobile/1.0 (+https://and-done-mobile.vercel.app)",
        accept: "application/rss+xml, application/xml, text/xml, */*",
      },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRss(xml);
  } catch {
    return [];
  }
}

function parseRss(xml) {
  if (!xml) return [];
  const items = [];
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml)) !== null && items.length < 8) {
    const block = m[1];
    const title = cdataField(block, "title");
    const link = cdataField(block, "link");
    const description = cdataField(block, "description");
    const pubDate = cdataField(block, "pubDate");
    if (!title) continue;
    items.push({ title, link, description, pubDate });
  }
  return items;
}

function cdataField(block, tag) {
  const re = new RegExp(
    `<${tag}[^>]*>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*<\\/${tag}>`,
  );
  const m = block.match(re);
  if (!m) return "";
  return stripHtml(m[1]).trim();
}

function stripHtml(s) {
  return String(s)
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

function truncate(s, n) {
  const clean = stripHtml(s).trim();
  return clean.length > n ? clean.slice(0, n - 1) + "…" : clean;
}

async function fetchRssEvents() {
  const results = await Promise.all(
    RSS_SOURCES.map(async (src) => {
      const items = await fetchRssItems(src.url);
      return items.map((it, i) => {
        const startsAt = parseRssDate(it.pubDate) || new Date().toISOString();
        return {
          id: `${src.name}-${hash(it.link || it.title)}-${i}`,
          source: `rss:${src.name}`,
          category: src.category,
          title: it.title,
          description: truncate(it.description, 180) || null,
          startsAt,
          endsAt: null,
          allDay: false,
          venueName: src.venueName,
          distanceM: null,
          severity: src.severity,
          impactHint: src.impactHint,
          url: it.link || null,
        };
      });
    }),
  );
  return results.flat();
}

function parseRssDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < (s || "").length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

// ── Handler ────────────────────────────────────────────────────────────────
export default async function handler(_req, res) {
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "s-maxage=1800, stale-while-revalidate=3600");

  try {
    const [nws, rss] = await Promise.all([
      fetchNwsAlerts(),
      fetchRssEvents(),
    ]);

    const events = [...nws, ...rss].sort(
      (a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
    );

    res.statusCode = 200;
    res.end(JSON.stringify({
      events,
      sources: {
        nws: nws.length,
        rss: rss.length,
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

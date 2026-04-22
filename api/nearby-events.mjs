// Vercel serverless: GET /api/nearby-events
// Pulls foot-traffic signals for GCDC (1730 Penn Ave NW, DC 20006) from:
//   1. NWS alerts — free JSON API, no key           (weather)
//   2. RSS feeds  — Eater DC, Washingtonian, DCist  (competitor + trend + community)
// No Firecrawl, no external keys. Cached 30 min at the edge.

// ── RSS sources ────────────────────────────────────────────────────────────
// Format "auto" handles both RSS 2.0 (<item>) and Atom (<entry>).
const RSS_SOURCES = [
  {
    name: "eater-dc",
    url: "https://dc.eater.com/rss/index.xml",   // Atom
    category: "competitor",
    severity: 5,
    impactHint: "neutral",
    venueName: "Eater DC",
  },
  {
    name: "washingtonian",
    url: "https://washingtonian.com/feed/",      // RSS 2.0 (bare domain — www. 301s)
    category: "trend",
    severity: 5,
    impactHint: "neutral",
    venueName: "Washingtonian",
  },
  {
    name: "popville",
    url: "https://www.popville.com/feed/",       // RSS 2.0 — DC neighborhood
    category: "community",
    severity: 5,
    impactHint: "neutral",
    venueName: "PoPville",
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
        "user-agent": "Mozilla/5.0 (compatible; and-done-mobile/1.0; +https://and-done-mobile.vercel.app)",
        accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
      redirect: "follow",
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseFeed(xml);
  } catch {
    return [];
  }
}

// Handles RSS 2.0 (<item>) and Atom (<entry>) in a single pass.
function parseFeed(xml) {
  if (!xml) return [];
  const isAtom = /<feed[\s>]/i.test(xml) && /xmlns=["']http:\/\/www\.w3\.org\/2005\/Atom/i.test(xml);
  return isAtom ? parseAtom(xml) : parseRss(xml);
}

function parseRss(xml) {
  const items = [];
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml)) !== null && items.length < 8) {
    const block = m[1];
    const title = cdataField(block, "title");
    const link = cdataField(block, "link");
    const description =
      cdataField(block, "description") || cdataField(block, "content:encoded");
    const pubDate = cdataField(block, "pubDate") || cdataField(block, "dc:date");
    if (!title) continue;
    items.push({ title, link, description, pubDate });
  }
  return items;
}

function parseAtom(xml) {
  const items = [];
  const entryRe = /<entry[\s>][\s\S]*?<\/entry>/g;
  let m;
  while ((m = entryRe.exec(xml)) !== null && items.length < 8) {
    const block = m[0];
    const title = cdataField(block, "title");
    // Atom link: <link rel="alternate" href="..."/> — prefer rel=alternate, fall back to first.
    const link = atomLink(block);
    const description =
      cdataField(block, "summary") || cdataField(block, "content");
    const pubDate =
      cdataField(block, "published") || cdataField(block, "updated");
    if (!title) continue;
    items.push({ title, link, description, pubDate });
  }
  return items;
}

function atomLink(block) {
  // Prefer <link rel="alternate" ... href="..."/>
  const alt = block.match(
    /<link\b[^>]*\brel=["']alternate["'][^>]*\bhref=["']([^"']+)["']/i,
  );
  if (alt) return alt[1];
  // Or the href comes before rel
  const alt2 = block.match(
    /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["']alternate["']/i,
  );
  if (alt2) return alt2[1];
  // Fallback: first <link href="..."/>
  const any = block.match(/<link\b[^>]*\bhref=["']([^"']+)["']/i);
  return any ? any[1] : "";
}

function cdataField(block, tag) {
  // Escape ":" in tag names (e.g. content:encoded, dc:date) for the regex.
  const safeTag = tag.replace(/:/g, "\\:");
  const re = new RegExp(
    `<${safeTag}(?:\\s[^>]*)?>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*<\\/${safeTag}>`,
  );
  const m = block.match(re);
  if (!m) return "";
  return stripHtml(m[1]).trim();
}

function stripHtml(s) {
  return String(s)
    .replace(/<[^>]+>/g, "")
    // Numeric entities: &#038; &#8217; &#8220; etc.
    .replace(/&#(\d+);/g, (_, d) => {
      const n = parseInt(d, 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : "";
    })
    // Hex entities: &#x2019;
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const n = parseInt(h, 16);
      return Number.isFinite(n) ? String.fromCodePoint(n) : "";
    })
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&hellip;/g, "…")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, "\u201D")
    .replace(/&ldquo;/g, "\u201C")
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

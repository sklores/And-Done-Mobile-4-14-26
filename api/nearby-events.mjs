// Vercel serverless: GET /api/nearby-events
// Pulls foot-traffic-relevant signals for GCDC (1730 Pennsylvania Ave NW, DC 20006):
//   1. NWS daily forecast (free, no key)              — weather
//   2. NWS active alerts (free, no key)               — weather (when severe)
//   3. Eater DC RSS                                   — DC restaurant editorial
//   4. Google News RSS searches                       — competitors / WH / closures / protests
//   5. PoPville RSS, filtered to 20006-relevant posts — community
//
// All sources free, no external API keys. Cached 30 min at the edge.

// ── Tuning constants ──────────────────────────────────────────────────────
const COMPETITOR_DAYS  = 7;
const COMPETITOR_LIMIT = 3;
const POLICY_DAYS      = 14;
const POLICY_LIMIT     = 5;
const POPVILLE_DAYS    = 7;
const POPVILLE_LIMIT   = 5;
const EATER_LIMIT      = 5;

// GCDC location
const GCDC_LAT = 38.8987;
const GCDC_LON = -77.0418;

// ── Whitelist of trusted publication domains ─────────────────────────────
// Applied to Google News results only — Eater/PoPville/whitehouse.gov fetched directly.
const ALLOWED_DOMAINS = [
  "eater.com", "washingtonian.com", "washingtonpost.com", "nytimes.com",
  "politico.com", "apnews.com", "reuters.com", "nbcwashington.com",
  "wusa9.com", "wjla.com", "wamu.org", "axios.com", "bloomberg.com",
  "wsj.com", "dcist.com", "bizjournals.com",
];

// Locations that mean "this story is about a different metro" — de-priority bias.
// Covers DMV suburbs (chain story but wrong location), nearby metros, and
// faraway US states (national chain news that's not about DC).
const NON_DC_LOCATIONS = [
  // DMV suburbs — most likely false-positive source
  "Reston", "Bethesda", "Tysons", "Rockville", "Arlington", "Alexandria",
  "Silver Spring", "McLean", "Fairfax", "Annapolis", "Baltimore",
  "Gaithersburg", "Frederick", "Vienna", "Falls Church", "Herndon",
  // Other US metros where chains often expand
  "Atlanta", "Miami", "Orlando", "Tampa", "Jacksonville", "Charlotte",
  "Raleigh", "Nashville", "Memphis", "Houston", "Dallas", "Austin",
  "San Antonio", "Phoenix", "Denver", "Seattle", "Portland",
  "San Francisco", "Los Angeles", "San Diego", "Chicago", "Philadelphia",
  "Boston", "Pittsburgh", "Cleveland", "Detroit", "Minneapolis",
  "St. Louis", "Kansas City", "New York", "Brooklyn", "Manhattan",
  "Las Vegas", "Salt Lake City", "Indianapolis", "Columbus",
  // US states (catches "first Florida location" etc.)
  "Florida", "California", "Texas", "Georgia", "North Carolina",
  "South Carolina", "Tennessee", "Alabama", "Mississippi", "Louisiana",
  "Ohio", "Michigan", "Illinois", "Pennsylvania", "Massachusetts",
  "Washington state", "Oregon", "Colorado", "Arizona", "Nevada",
  "New Jersey", "Connecticut", "Indiana", "Missouri", "Kentucky",
  "Wisconsin", "Minnesota",
];

// PoPville keyword filter — only keep posts mentioning the GCDC/20006 area.
const POPVILLE_20006_KEYWORDS = [
  "foggy bottom", "20006", "pennsylvania ave", "george washington",
  "gw university", "gw hospital", "farragut", "federal triangle",
  "world bank", "state department", "k street", "k st nw",
  "17th street", "17th st", "i street nw", "h street nw downtown",
];

// ── Source configuration ──────────────────────────────────────────────────

// Competitor restaurants — named list (closest location to GCDC)
const COMPETITORS = [
  { name: "founding-farmers",   query: '"Founding Farmers" DC',                  venueName: "Founding Farmers (1924 Penn Ave NW)" },
  { name: "potbelly",           query: '"Potbelly" Washington DC',               venueName: "Potbelly (DC)" },
  { name: "immigrant-food",     query: '"Immigrant Food at the White House"',    venueName: "Immigrant Food at the WH" },
  { name: "the-exchange",       query: '"The Exchange" 1719 G Street DC',        venueName: "The Exchange (1719 G St)" },
  { name: "mcdonalds-dc",       query: "McDonald's Washington DC restaurant",    venueName: "McDonald's (DC)" },
];

// Category / neighborhood feeds
const TREND_QUERIES = [
  { name: "grilled-cheese-dc",  query: '"grilled cheese" Washington DC',         venueName: "DC grilled-cheese scene" },
  { name: "foggy-bottom-rest",  query: '"Foggy Bottom" restaurant',              venueName: "Foggy Bottom restaurants" },
  { name: "fast-casual-sand",   query: '"fast casual sandwich" DC',              venueName: "Fast-casual sandwich" },
];

// White House / closures / planned protests
const POLICY_QUERIES = [
  { name: "wh-road-closure",    query: '"Pennsylvania Avenue" "White House" closure',  venueName: "White House area",       category: "government" },
  { name: "wh-news",            query: '"White House" announcement Washington',         venueName: "White House",            category: "government" },
  { name: "smithsonian-closure",query: 'Smithsonian closed OR closure Washington',      venueName: "Smithsonian",            category: "civic" },
  { name: "dc-protest-planned", query: 'protest planned Washington DC',                 venueName: "DC protest",             category: "civic" },
  { name: "dc-march-rally",     query: 'march OR rally "Washington DC" planned',        venueName: "DC rally / march",       category: "civic" },
];

// ── HTML / XML utilities ──────────────────────────────────────────────────

function stripHtml(s) {
  return String(s)
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, d) => {
      const n = parseInt(d, 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : "";
    })
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

function cdataField(block, tag) {
  const safeTag = tag.replace(/:/g, "\\:");
  const re = new RegExp(
    `<${safeTag}(?:\\s[^>]*)?>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*<\\/${safeTag}>`,
  );
  const m = block.match(re);
  if (!m) return "";
  return stripHtml(m[1]).trim();
}

function rawField(block, tag) {
  // Like cdataField but doesn't strip HTML — for getting raw <description> with source link.
  const safeTag = tag.replace(/:/g, "\\:");
  const re = new RegExp(
    `<${safeTag}(?:\\s[^>]*)?>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*<\\/${safeTag}>`,
  );
  const m = block.match(re);
  return m ? m[1] : "";
}

function atomLink(block) {
  const alt = block.match(/<link\b[^>]*\brel=["']alternate["'][^>]*\bhref=["']([^"']+)["']/i);
  if (alt) return alt[1];
  const alt2 = block.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["']alternate["']/i);
  if (alt2) return alt2[1];
  const any = block.match(/<link\b[^>]*\bhref=["']([^"']+)["']/i);
  return any ? any[1] : "";
}

function googleNewsSourceUrl(block) {
  // Google News RSS: <source url="https://www.washingtonpost.com">Washington Post</source>
  const m = block.match(/<source\b[^>]*\burl=["']([^"']+)["'][^>]*>([\s\S]*?)<\/source>/i);
  return m ? { url: m[1], name: stripHtml(m[2]).trim() } : null;
}

function googleNewsItemSourceFromDescription(block) {
  // Fallback: pull the first <a href="..."> from the description body.
  const desc = rawField(block, "description");
  if (!desc) return null;
  const m = desc.match(/<a\b[^>]*\bhref=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

function extractDomain(url) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function isAllowedDomain(domain) {
  if (!domain) return false;
  return ALLOWED_DOMAINS.some((d) => domain === d || domain.endsWith("." + d));
}

// ── Feed parsing (RSS 2.0 + Atom) ─────────────────────────────────────────

async function fetchFeed(url) {
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

function parseFeed(xml) {
  if (!xml) return [];
  const isAtom = /<feed[\s>]/i.test(xml) && /xmlns=["']http:\/\/www\.w3\.org\/2005\/Atom/i.test(xml);
  return isAtom ? parseAtom(xml) : parseRss(xml);
}

function parseRss(xml) {
  const items = [];
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const title = cdataField(block, "title");
    const link = cdataField(block, "link");
    const description =
      cdataField(block, "description") || cdataField(block, "content:encoded");
    const pubDate = cdataField(block, "pubDate") || cdataField(block, "dc:date");
    if (!title) continue;
    // Google News–specific source extraction
    const gnSource = googleNewsSourceUrl(block);
    const fallbackSourceUrl = !gnSource ? googleNewsItemSourceFromDescription(block) : null;
    items.push({
      title,
      link,
      description,
      pubDate,
      sourceUrl: gnSource?.url || fallbackSourceUrl || null,
      sourceName: gnSource?.name || null,
    });
  }
  return items;
}

function parseAtom(xml) {
  const items = [];
  const entryRe = /<entry[\s>][\s\S]*?<\/entry>/g;
  let m;
  while ((m = entryRe.exec(xml)) !== null) {
    const block = m[0];
    const title = cdataField(block, "title");
    const link = atomLink(block);
    const description =
      cdataField(block, "summary") || cdataField(block, "content");
    const pubDate =
      cdataField(block, "published") || cdataField(block, "updated");
    if (!title) continue;
    items.push({ title, link, description, pubDate, sourceUrl: null, sourceName: null });
  }
  return items;
}

function parseDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function withinDays(pubDate, days) {
  const d = parseDate(pubDate);
  if (!d) return true; // no date → don't filter out
  const cutoff = Date.now() - days * 24 * 3600 * 1000;
  return d.getTime() >= cutoff;
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < (s || "").length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

// ── Severity heuristics ───────────────────────────────────────────────────

function mentionsNonDC(title, description) {
  const hay = (title + " " + (description || "")).toLowerCase();
  return NON_DC_LOCATIONS.some((loc) => hay.includes(loc.toLowerCase()));
}

function severityForCompetitor(title, isNonDC) {
  if (isNonDC) return 6; // chain news for a different city — less actionable
  const t = title.toLowerCase();
  if (/\b(close[sd]?|closing|shutter(s|ed|ing)?|shut down|going out of business)\b/.test(t)) return 6;
  if (/\b(open(s|ed|ing)?|debut|launch(es|ed|ing)?|expand(s|ed|ing)?|new location)\b/.test(t)) return 3;
  return 5;
}

function severityForPolicy(title, category) {
  const t = title.toLowerCase();
  // Closures / shutdowns
  if (/\b(closure|closed|shutdown|barricade|blocked|cordon)\b/.test(t)) return 2;
  // Reopenings
  if (/\b(reopen|reopens|reopening)\b/.test(t)) return 6;
  // Crowd-drawing events
  if (/\b(thousands|massive|major)\b/.test(t) && /\b(rally|protest|march|demonstration|crowd)\b/.test(t)) return 2;
  if (/\b(motorcade|state visit|head of state|summit)\b/.test(t)) return 3;
  if (category === "civic" && /\b(rally|protest|demonstration|march)\b/.test(t)) return 4;
  return 5;
}

function severityForWeather({ windMph, precipPct, isAlert, alertSev }) {
  if (isAlert) {
    switch ((alertSev || "").toLowerCase()) {
      case "extreme":  return 1;
      case "severe":   return 2;
      case "moderate": return 3;
      case "minor":    return 4;
      default:         return 4;
    }
  }
  if (windMph != null && windMph >= 25) return 3;
  if (precipPct != null && precipPct >= 70) return 4;
  return 5;
}

function impactHintFor(severity) {
  if (severity <= 3) return "decreases foot traffic";
  if (severity >= 6) return "increases foot traffic";
  return "neutral";
}

// ── Google News RSS ───────────────────────────────────────────────────────

function googleNewsUrl(query) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

async function fetchGoogleNews(query, opts) {
  const { days, limit, category, venueName, sourceName, severityFn } = opts;
  const items = await fetchFeed(googleNewsUrl(query));
  const out = [];
  for (const it of items) {
    if (!it.sourceUrl) continue;
    const domain = extractDomain(it.sourceUrl);
    if (!isAllowedDomain(domain)) continue;
    if (!withinDays(it.pubDate, days)) continue;

    const isNonDC = mentionsNonDC(it.title, it.description);
    const startsAt = parseDate(it.pubDate)?.toISOString() || new Date().toISOString();
    const sev = severityFn(it.title, isNonDC);

    const titleClean = it.title.replace(/\s*-\s*[^-]+$/, "").trim(); // drop " - Source Name" tail
    out.push({
      id: `${sourceName}-${hash(it.sourceUrl || it.title)}`,
      source: `gnews:${sourceName}`,
      category,
      title: titleClean,
      description: truncate(it.description || "", 180) || null,
      startsAt,
      endsAt: null,
      allDay: false,
      venueName: isNonDC ? `${venueName} · non-DC location` : venueName,
      distanceM: null,
      severity: sev,
      impactHint: impactHintFor(sev),
      url: it.sourceUrl,
    });
    if (out.length >= limit) break;
  }
  return out;
}

// ── Eater DC (Atom feed, kept as-is — editorial competitor signal) ────────

async function fetchEaterDc() {
  const items = await fetchFeed("https://dc.eater.com/rss/index.xml");
  return items.slice(0, EATER_LIMIT).map((it) => {
    const startsAt = parseDate(it.pubDate)?.toISOString() || new Date().toISOString();
    const isNonDC = mentionsNonDC(it.title, it.description);
    const sev = severityForCompetitor(it.title, isNonDC);
    return {
      id: `eater-dc-${hash(it.link || it.title)}`,
      source: "rss:eater-dc",
      category: "competitor",
      title: it.title,
      description: truncate(it.description || "", 180) || null,
      startsAt,
      endsAt: null,
      allDay: false,
      venueName: "Eater DC",
      distanceM: null,
      severity: sev,
      impactHint: impactHintFor(sev),
      url: it.link || null,
    };
  });
}

// ── PoPville (RSS 2.0, hard-filtered to 20006-relevant posts) ─────────────

async function fetchPopville20006() {
  const items = await fetchFeed("https://www.popville.com/feed/");
  const out = [];
  for (const it of items) {
    const hay = (it.title + " " + (it.description || "")).toLowerCase();
    const matches = POPVILLE_20006_KEYWORDS.some((kw) => hay.includes(kw));
    if (!matches) continue;
    if (!withinDays(it.pubDate, POPVILLE_DAYS)) continue;

    const startsAt = parseDate(it.pubDate)?.toISOString() || new Date().toISOString();
    out.push({
      id: `popville-${hash(it.link || it.title)}`,
      source: "rss:popville-20006",
      category: "community",
      title: it.title,
      description: truncate(it.description || "", 180) || null,
      startsAt,
      endsAt: null,
      allDay: false,
      venueName: "PoPville · 20006",
      distanceM: null,
      severity: 5,
      impactHint: "neutral",
      url: it.link || null,
    });
    if (out.length >= POPVILLE_LIMIT) break;
  }
  return out;
}

// ── NWS daily forecast + alerts ───────────────────────────────────────────

async function fetchNwsForecast() {
  try {
    // Step 1: lat/lon → office + gridX/Y + forecast URL
    const pointsRes = await fetch(
      `https://api.weather.gov/points/${GCDC_LAT},${GCDC_LON}`,
      { headers: { "user-agent": "and-done-mobile (ops@and-done.app)", accept: "application/geo+json" } },
    );
    if (!pointsRes.ok) return [];
    const points = await pointsRes.json();
    const forecastUrl = points?.properties?.forecast;
    if (!forecastUrl) return [];

    // Step 2: forecast → take the first period (current "Today"/"Tonight"/"Tomorrow morning")
    const fcRes = await fetch(forecastUrl, {
      headers: { "user-agent": "and-done-mobile (ops@and-done.app)", accept: "application/geo+json" },
    });
    if (!fcRes.ok) return [];
    const fc = await fcRes.json();
    const periods = fc?.properties?.periods;
    if (!Array.isArray(periods) || periods.length === 0) return [];

    const p = periods[0];
    const windMph = parseWindMax(p.windSpeed);
    const precipPct = p.probabilityOfPrecipitation?.value ?? null;
    const sev = severityForWeather({ windMph, precipPct, isAlert: false });

    const tempStr = p.temperature != null ? `${p.temperature}°${p.temperatureUnit || "F"}` : "";
    const windStr = p.windSpeed ? `${p.windSpeed} ${p.windDirection || ""}`.trim() : "";
    const precipStr = precipPct != null ? `${precipPct}% precip` : "";
    const subParts = [windStr && `Wind ${windStr}`, precipStr].filter(Boolean).join(" · ");

    return [{
      id: `nws-fc-${hash(p.startTime || p.name || "")}`,
      source: "nws:forecast",
      category: "weather",
      title: `${p.name}: ${p.shortForecast || "Forecast"}${tempStr ? `, ${tempStr}` : ""}`,
      description: subParts || truncate(p.detailedForecast || "", 180) || null,
      startsAt: p.startTime || new Date().toISOString(),
      endsAt: p.endTime || null,
      allDay: false,
      venueName: "Washington DC",
      distanceM: null,
      severity: sev,
      impactHint: impactHintFor(sev),
      url: "https://www.weather.gov/",
    }];
  } catch {
    return [];
  }
}

function parseWindMax(s) {
  if (!s) return null;
  // "10 mph", "10 to 15 mph", "5 to 10 mph"
  const nums = String(s).match(/\d+/g);
  if (!nums || nums.length === 0) return null;
  return Math.max(...nums.map(Number));
}

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
      const sev = severityForWeather({ isAlert: true, alertSev: p.severity });
      return {
        id: `nws-alert-${p.id || i}`,
        source: "nws:alert",
        category: "weather",
        title: p.headline || p.event || "Weather alert",
        description: truncate(p.description || p.instruction || "", 220),
        startsAt: p.onset || p.effective || new Date().toISOString(),
        endsAt: p.ends || p.expires || null,
        allDay: false,
        venueName: p.areaDesc || "Washington DC",
        distanceM: null,
        severity: sev,
        impactHint: impactHintFor(sev),
        url: "https://www.weather.gov/",
      };
    });
  } catch {
    return [];
  }
}

// ── Handler ────────────────────────────────────────────────────────────────

export default async function handler(_req, res) {
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "s-maxage=1800, stale-while-revalidate=3600");

  try {
    // Build the parallel fetch list
    const competitorFetches = COMPETITORS.map((c) =>
      fetchGoogleNews(c.query, {
        days: COMPETITOR_DAYS,
        limit: COMPETITOR_LIMIT,
        category: "competitor",
        venueName: c.venueName,
        sourceName: c.name,
        severityFn: severityForCompetitor,
      }),
    );
    const trendFetches = TREND_QUERIES.map((c) =>
      fetchGoogleNews(c.query, {
        days: COMPETITOR_DAYS,
        limit: COMPETITOR_LIMIT,
        category: "trend",
        venueName: c.venueName,
        sourceName: c.name,
        severityFn: severityForCompetitor,
      }),
    );
    const policyFetches = POLICY_QUERIES.map((c) =>
      fetchGoogleNews(c.query, {
        days: POLICY_DAYS,
        limit: POLICY_LIMIT,
        category: c.category,
        venueName: c.venueName,
        sourceName: c.name,
        severityFn: (title) => severityForPolicy(title, c.category),
      }),
    );

    const all = await Promise.all([
      fetchNwsForecast(),
      fetchNwsAlerts(),
      fetchEaterDc(),
      fetchPopville20006(),
      ...competitorFetches,
      ...trendFetches,
      ...policyFetches,
    ]);

    // Flatten + dedupe by URL (Google News across queries can repeat)
    const seen = new Set();
    const events = [];
    for (const arr of all) {
      for (const e of arr) {
        const key = e.url || e.id;
        if (seen.has(key)) continue;
        seen.add(key);
        events.push(e);
      }
    }

    // Sort: severity ascending (most actionable first), then date desc
    events.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity - b.severity;
      return new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime();
    });

    // Source counts for telemetry
    const sources = {};
    for (const e of events) {
      sources[e.source] = (sources[e.source] || 0) + 1;
    }

    res.statusCode = 200;
    res.end(JSON.stringify({
      events,
      sources,
      total: events.length,
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

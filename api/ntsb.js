// api/ntsb.js — NTSB Aviation Accident Database (replaces ASRS)
// Source: NTSB Aviation Query monthly lists
// URL: https://www.ntsb.gov/_layouts/15/ntsb.aviation/AccList.aspx?month=M&year=YYYY
// Updated daily, covers all investigated US civil aviation accidents.
// Data latency: preliminary reports typically within a few days of accident.

const STATE_COORDS = {
  AL:[32.8,-86.8],AK:[64.2,-153.4],AZ:[34.3,-111.1],AR:[34.8,-92.2],
  CA:[36.8,-119.4],CO:[39.0,-105.5],CT:[41.6,-72.7],DE:[39.0,-75.5],
  FL:[27.8,-81.6],GA:[32.2,-83.4],HI:[20.2,-156.7],ID:[44.4,-114.6],
  IL:[40.0,-89.2],IN:[39.9,-86.3],IA:[42.0,-93.2],KS:[38.5,-98.4],
  KY:[37.5,-85.3],LA:[31.1,-91.9],ME:[45.3,-69.0],MD:[39.0,-76.8],
  MA:[42.2,-71.6],MI:[44.3,-85.6],MN:[46.4,-93.1],MS:[32.6,-89.7],
  MO:[38.5,-92.5],MT:[47.0,-110.5],NE:[41.5,-99.9],NV:[39.3,-116.6],
  NH:[43.7,-71.6],NJ:[40.2,-74.7],NM:[34.5,-106.1],NY:[42.9,-75.5],
  NC:[35.6,-79.4],ND:[47.5,-100.5],OH:[40.4,-82.8],OK:[35.6,-97.5],
  OR:[44.6,-122.1],PA:[40.9,-77.8],RI:[41.7,-71.5],SC:[33.8,-80.9],
  SD:[44.4,-100.2],TN:[35.9,-86.4],TX:[31.5,-99.3],UT:[39.4,-111.1],
  VT:[44.0,-72.7],VA:[37.5,-79.5],WA:[47.4,-120.6],WV:[38.6,-80.6],
  WI:[44.3,-89.8],WY:[43.0,-107.6],DC:[38.9,-77.0],PR:[18.2,-66.5],
  GU:[13.4,144.8],VI:[17.7,-64.8],
};

function coordsForState(state) {
  if (!state) return [null, null];
  const abbr = state.trim().toUpperCase().slice(0, 2);
  return STATE_COORDS[abbr] ? STATE_COORDS[abbr] : [null, null];
}

function severityFromInjuries(fatal, serious, minor) {
  if (fatal > 0)   return "critical";
  if (serious > 0) return "high";
  if (minor > 0)   return "medium";
  return "low";
}

function categoryFromAircraft(make) {
  const m = (make || "").toUpperCase();
  if (/BOEING|AIRBUS|EMBRAER|BOMBARDIER|MCDONNELL/.test(m)) return "Commercial Jet";
  if (/BELL|ROBINSON|SIKORSKY|EUROCOPTER|ENSTROM|HILLER/.test(m)) return "Helicopter";
  return "Private/GA";
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const fromParam = req.query?.from;
  const toParam   = req.query?.to;
  const endDate   = toParam   ? new Date(toParam)   : new Date();
  const startDate = fromParam ? new Date(fromParam)
                              : new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);

  console.log(`[NTSB] Querying ${startDate.toISOString().slice(0,10)} → ${endDate.toISOString().slice(0,10)}`);

  // Build list of year/month combos to fetch
  const months = [];
  const cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  while (cur <= end) {
    months.push({ year: cur.getFullYear(), month: cur.getMonth() + 1 });
    cur.setMonth(cur.getMonth() + 1);
  }
  console.log(`[NTSB] Fetching ${months.length} monthly list(s): ${months.map(m=>`${m.year}/${m.month}`).join(", ")}`);

  const allEvents = [];

  for (const { year, month } of months) {
    const url = `https://www.ntsb.gov/_layouts/15/ntsb.aviation/AccList.aspx?month=${month}&year=${year}`;
    try {
      console.log(`[NTSB] Fetching: ${url}`);
      const resp = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept":     "text/html,application/xhtml+xml,*/*",
          "Referer":    "https://www.ntsb.gov/safety/data/Pages/Data_Stats.aspx",
        },
        signal: AbortSignal.timeout(15000),
      });

      console.log(`[NTSB] ${year}/${month}: status=${resp.status}, type=${resp.headers.get("content-type")}`);
      const html = await resp.text();
      console.log(`[NTSB] ${year}/${month}: length=${html.length}, snippet=${html.slice(0,300).replace(/\s+/g," ")}`);

      if (!resp.ok || html.length < 200) continue;

      const events = parseNtsbMonthlyList(html, year, month);
      console.log(`[NTSB] ${year}/${month}: parsed ${events.length} events`);
      allEvents.push(...events);

    } catch (err) {
      console.error(`[NTSB] ${year}/${month} error: ${err.message}`);
    }
  }

  // Filter to requested date range
  const fromStr = startDate.toISOString().slice(0, 10);
  const toStr   = endDate.toISOString().slice(0, 10);
  const filtered = allEvents.filter(e => e.date >= fromStr && e.date <= toStr);
  console.log(`[NTSB] Total: ${allEvents.length}, in range: ${filtered.length}`);

  res.setHeader("Cache-Control", "max-age=3600");
  return res.status(200).json({ events: filtered, count: filtered.length, source: "NTSB" });
}

function parseNtsbMonthlyList(html, year, month) {
  const events = [];

  // NTSB monthly list is an HTML table with columns:
  // Date | Location | Aircraft Make/Model | Registration | Fatal | Serious | Minor | None | Status
  const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/gi) || [];
  console.log(`[NTSB] Tables found: ${tableMatch.length}`);

  // Find largest table (the data table)
  const dataTable = tableMatch.sort((a, b) => b.length - a.length)[0] || "";
  if (!dataTable) {
    console.log(`[NTSB] No tables in ${year}/${month}`);
    return events;
  }

  const rows = dataTable.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
  console.log(`[NTSB] Rows in data table: ${rows.length}`);

  let headers = [];
  let headerFound = false;

  for (const row of rows) {
    const cells = (row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || [])
      .map(c => {
        // Extract link text and href if present
        const linkMatch = c.match(/href="([^"]+)"/i);
        const text = c.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#\d+;/g, "").trim();
        return { text, href: linkMatch ? linkMatch[1] : null };
      });

    if (cells.length < 3) continue;
    const textCells = cells.map(c => c.text);

    // Detect header
    if (!headerFound && /date|location|make|model|reg|fatal|injur|status/i.test(textCells.join(" "))) {
      headers = textCells;
      headerFound = true;
      console.log(`[NTSB] Headers: ${textCells.slice(0, 9).join(" | ")}`);
      continue;
    }
    if (!headerFound || textCells.join("").trim() === "") continue;

    // Log first few data rows
    if (events.length < 3) {
      console.log(`[NTSB] Row: ${textCells.slice(0, 8).join(" | ")}`);
    }

    const get = (...names) => {
      for (const n of names) {
        const idx = headers.findIndex(h => new RegExp(n, "i").test(h));
        if (idx >= 0 && textCells[idx]) return textCells[idx];
      }
      return "";
    };
    const getHref = (...names) => {
      for (const n of names) {
        const idx = headers.findIndex(h => new RegExp(n, "i").test(h));
        if (idx >= 0 && cells[idx]?.href) return cells[idx].href;
      }
      return null;
    };

    const dateRaw  = get("date", "Date", "EVENT");
    const location = get("location", "city", "state", "Location");
    const make     = get("make", "model", "aircraft", "Make");
    const reg      = get("reg", "registration", "n-number", "tail");
    const fatal    = parseInt(get("fatal", "Fatal") || "0", 10) || 0;
    const serious  = parseInt(get("serious", "Serious") || "0", 10) || 0;
    const minor    = parseInt(get("minor", "Minor") || "0", 10) || 0;
    const status   = get("status", "investigation", "Status");
    const reportHref = getHref("date", "location", "make", "reg") || "";

    // Parse date - NTSB format typically MM/DD/YYYY or YYYY-MM-DD
    let isoDate = `${year}-${String(month).padStart(2,"0")}-01`;
    const dm1 = dateRaw.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    const dm2 = dateRaw.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (dm2) isoDate = `${dm2[1]}-${dm2[2]}-${dm2[3]}`;
    else if (dm1) {
      const yr = dm1[3].length === 2 ? `20${dm1[3]}` : dm1[3];
      isoDate = `${yr}-${dm1[1].padStart(2,"0")}-${dm1[2].padStart(2,"0")}`;
    }

    if (!make && !location) continue;

    // Extract state from location (usually "City, ST" format)
    const stateMatch = location.match(/,\s*([A-Z]{2})$/);
    const stateAbbr  = stateMatch ? stateMatch[1] : "";
    const [lat, lon] = coordsForState(stateAbbr);

    const injuries = fatal > 0 ? `${fatal} fatal` : serious > 0 ? `${serious} serious` : minor > 0 ? `${minor} minor` : "None";
    const reportUrl = reportHref
      ? (reportHref.startsWith("http") ? reportHref : `https://www.ntsb.gov${reportHref}`)
      : "https://www.ntsb.gov/safety/data/Pages/Data_Stats.aspx";

    events.push({
      id:          `NTSB-${isoDate}-${events.length}`,
      type:        "accident",
      severity:    severityFromInjuries(fatal, serious, minor),
      date:        isoDate,
      aircraft:    make.slice(0, 60) || "Unknown",
      category:    categoryFromAircraft(make),
      reg:         reg || null,
      carrier:     null,
      location:    location || "Not reported",
      lat, lon,
      injuries,
      fatalities:  fatal,
      phase:       "Unknown",
      description: `NTSB investigated accident. ${make} in ${location}. ${injuries} injuries. Investigation status: ${status || "Pending"}.`,
      source:      "NTSB",
      url:         reportUrl,
    });
  }
  return events;
}

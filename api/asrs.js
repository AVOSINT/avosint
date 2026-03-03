// api/asrs.js — NASA Aviation Safety Reporting System
// Uses the ASRS public search form at asrs.arc.nasa.gov

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const fromParam = req.query?.from;
  const toParam   = req.query?.to;

  const endDate   = toParam   ? new Date(toParam)   : new Date();
  const startDate = fromParam ? new Date(fromParam)
                              : new Date(endDate.getTime() - 730 * 24 * 60 * 60 * 1000);

  // Format as MM/YYYY for ASRS form
  const fmt = d => `${(d.getMonth()+1).toString().padStart(2,"0")}/${d.getFullYear()}`;
  const startFmt = fmt(startDate);
  const endFmt   = fmt(endDate);

  console.log(`[ASRS] Querying ${startFmt} → ${endFmt}`);

  try {
    // ASRS search form — POST with form-encoded body
    const body = new URLSearchParams({
      StartDate:  startFmt,
      EndDate:    endFmt,
      numRecords: "50",
      db:         "ASRS",
    }).toString();

    const resp = await fetch("https://asrs.arc.nasa.gov/search/cfquery.html", {
      method: "POST",
      headers: {
        "Content-Type":  "application/x-www-form-urlencoded",
        "User-Agent":    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept":        "text/html,application/xhtml+xml",
        "Origin":        "https://asrs.arc.nasa.gov",
        "Referer":       "https://asrs.arc.nasa.gov/search/cfquery.html",
      },
      signal: AbortSignal.timeout(20000),
    });

    console.log(`[ASRS] Response status: ${resp.status}`);
    const html = await resp.text();
    console.log(`[ASRS] Response length: ${html.length} chars`);
    console.log(`[ASRS] First 500 chars: ${html.slice(0, 500).replace(/\s+/g, " ")}`);

    const events = parseAsrsHtml(html);
    console.log(`[ASRS] Parsed ${events.length} events`);

    res.setHeader("Cache-Control", "max-age=1800");
    return res.status(200).json({ events, count: events.length, source: "ASRS" });

  } catch (err) {
    console.error(`[ASRS] Error: ${err.message}`);
    return res.status(200).json({ events: [], error: err.message, source: "ASRS" });
  }
}

// ── Coordinate lookups ────────────────────────────────────────────────────────
const AIRPORT_COORDS = {
  ATL:[33.64,-84.43],LAX:[33.94,-118.41],ORD:[41.97,-87.91],DFW:[32.90,-97.04],
  DEN:[39.86,-104.67],JFK:[40.64,-73.78],SFO:[37.62,-122.38],LAS:[36.08,-115.15],
  MCO:[28.43,-81.31],CLT:[35.21,-80.94],LGA:[40.78,-73.87],EWR:[40.69,-74.17],
  PHX:[33.44,-112.01],SEA:[47.45,-122.31],MIA:[25.80,-80.29],BOS:[42.37,-71.01],
  MSP:[44.88,-93.22],DTW:[42.22,-83.36],IAH:[29.99,-95.34],IAD:[38.95,-77.46],
  DCA:[38.85,-77.04],SLC:[40.79,-111.98],PDX:[45.59,-122.60],MDW:[41.79,-87.75],
  TPA:[27.98,-82.53],BNA:[36.13,-86.68],AUS:[30.20,-97.67],MEM:[35.04,-90.00],
  MSY:[29.99,-90.26],PHL:[39.87,-75.24],SAN:[32.73,-117.19],BWI:[39.18,-76.67],
  STL:[38.75,-90.37],MCI:[39.30,-94.71],CLE:[41.41,-81.85],CVG:[39.05,-84.67],
  CMH:[40.00,-82.89],IND:[39.72,-86.29],MKE:[42.95,-87.90],OMA:[41.30,-95.89],
  OKC:[35.39,-97.60],ABQ:[35.04,-106.61],TUS:[32.12,-110.94],ELP:[31.81,-106.38],
  BOI:[43.56,-116.22],FAI:[64.82,-147.86],HNL:[21.32,-157.93],ANC:[61.17,-149.99],
  ORF:[36.90,-76.03],RIC:[37.51,-77.32],ROA:[37.33,-79.97],CHO:[38.14,-78.45],
  SBN:[41.71,-86.32],FSD:[43.58,-96.74],BIL:[45.81,-108.54],GEG:[47.62,-117.53],
  MFR:[42.37,-122.87],EUG:[44.12,-123.22],SMF:[38.70,-121.59],SJC:[37.36,-121.93],
  SNA:[33.68,-117.87],BUR:[34.20,-118.36],LGB:[33.82,-118.15],ONT:[34.06,-117.60],
};

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
};

function coordsFor(location) {
  if (!location) return [null, null];
  const up = location.toUpperCase();
  // Try 3-letter airport code
  const codes = up.match(/\b([A-Z]{3})\b/g) || [];
  for (const c of codes) {
    if (AIRPORT_COORDS[c]) return AIRPORT_COORDS[c];
  }
  // Try 4-letter ICAO (strip K prefix for US)
  const icao = up.match(/\b(K[A-Z]{3})\b/g) || [];
  for (const c of icao) {
    const iata = c.slice(1);
    if (AIRPORT_COORDS[iata]) return AIRPORT_COORDS[iata];
  }
  // Try 2-letter state
  const stm = up.match(/\b([A-Z]{2})\b/g) || [];
  for (const s of stm) {
    if (STATE_COORDS[s]) return STATE_COORDS[s];
  }
  return [null, null];
}

function parseAsrsHtml(html) {
  const events = [];

  // ASRS returns a table with results — try multiple table parsing strategies

  // Strategy 1: look for <tr> rows with <td> cells containing report data
  // Each report typically has: Report#, Date, Local Time, Place, Aircraft, ...
  const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/gi) || [];
  console.log(`[ASRS] Found ${tableMatch.length} tables in response`);

  // Log table sizes to find the data table
  tableMatch.forEach((t, i) => {
    const rows = (t.match(/<tr/gi) || []).length;
    console.log(`[ASRS] Table ${i}: ${rows} rows, ${t.length} chars`);
  });

  // Find the largest table — most likely the data table
  const dataTable = tableMatch.sort((a, b) => b.length - a.length)[0] || "";

  if (!dataTable) {
    console.log("[ASRS] No tables found — checking for 'no records' message");
    if (/no records|no results|0 records/i.test(html)) {
      console.log("[ASRS] Source returned no records for this date range");
    }
    return events;
  }

  // Extract rows
  const rows = dataTable.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
  console.log(`[ASRS] Data table has ${rows.length} rows`);

  // Skip header row(s) — look for rows with multiple <td> cells
  let headerSkipped = false;
  for (const row of rows) {
    const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [])
      .map(td => td.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim());

    if (cells.length < 3) continue;

    // Skip header row (contains "Report" or "Date" as text, not numbers)
    if (!headerSkipped && /report|date|time|place|aircraft/i.test(cells.join(" "))) {
      headerSkipped = true;
      console.log(`[ASRS] Header row: ${cells.slice(0,5).join(" | ")}`);
      continue;
    }

    // Parse a data row — log first few for debugging
    if (events.length < 3) {
      console.log(`[ASRS] Data row cells: ${cells.slice(0,6).join(" | ")}`);
    }

    // Try to extract fields — ASRS table columns vary but usually:
    // Col 0-1: Report # or ACN
    // Col 1-2: Date (MM/DD/YYYY or similar)
    // Col 3-4: Aircraft type
    // Col 5+: Location/description

    // Find date cell
    const dateCell = cells.find(c => /\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}/.test(c)) || "";
    let isoDate = new Date().toISOString().slice(0, 10);
    const dm = dateCell.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dm) isoDate = `${dm[3]}-${dm[1].padStart(2,"0")}-${dm[2].padStart(2,"0")}`;

    const aircraft = cells.find(c => /cessna|piper|boeing|airbus|beech|cirrus|embraer|robinson|bell|sikorsky|mooney|piston|turboprop|jet/i.test(c)) || cells[3] || "Unknown";
    const location = cells.find(c => /airport|arpt|field|afb|apt|[A-Z]{3}/.test(c) && c.length < 40) || cells[4] || "";
    const description = cells.find(c => c.length > 50) || cells.slice(-1)[0] || "";

    const [lat, lon] = coordsFor(location);

    events.push({
      id:          `ASRS-${isoDate}-${events.length}`,
      type:        "incident",
      severity:    description.toLowerCase().includes("emergency") ? "high" : "medium",
      date:        isoDate,
      aircraft:    aircraft.slice(0, 60),
      category:    "Private/GA",
      reg:         null,
      carrier:     null,
      location:    location || "Location not reported",
      lat, lon,
      injuries:    "Not reported",
      fatalities:  0,
      phase:       "Unknown",
      description: description.slice(0, 600) || `ASRS report ${isoDate}`,
      source:      "ASRS",
      url:         "https://asrs.arc.nasa.gov",
    });
  }

  return events;
}

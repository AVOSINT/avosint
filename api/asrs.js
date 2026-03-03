// api/asrs.js — Proxy for NASA Aviation Safety Reporting System (ASRS)
// Public access — no API key required.
// Queries ASRS CALLBACK data and their search interface.
// NOTE: ASRS has no official JSON API. This proxy scrapes their HTML
// search results. If NASA changes their page structure, parsing may break.

// Airport code → coordinates lookup (subset of common airports)
const AIRPORT_COORDS = {
  ATL:[33.6407,-84.4277],LAX:[33.9425,-118.4081],ORD:[41.9742,-87.9073],
  DFW:[32.8998,-97.0403],DEN:[39.8561,-104.6737],JFK:[40.6413,-73.7781],
  SFO:[37.6213,-122.379],LAS:[36.084,-115.1537],MCO:[28.4294,-81.3089],
  CLT:[35.214,-80.9431],LGA:[40.7772,-73.8726],EWR:[40.6895,-74.1745],
  PHX:[33.4373,-112.0078],SEA:[47.4502,-122.3088],MIA:[25.7959,-80.287],
  BOS:[42.3656,-71.0096],MSP:[44.8848,-93.2223],DTW:[42.2162,-83.3554],
  IAH:[29.9902,-95.3368],BWI:[39.1754,-76.6682],IAD:[38.9531,-77.4565],
  DCA:[38.8512,-77.0402],SLC:[40.7884,-111.9778],PDX:[45.5887,-122.5975],
  MDW:[41.7868,-87.7522],PHL:[39.8729,-75.2437],SAN:[32.7336,-117.1897],
  TPA:[27.9755,-82.5332],STL:[38.7487,-90.37],MCI:[39.2976,-94.7139],
  BNA:[36.1263,-86.6774],AUS:[30.1975,-97.6664],MEM:[35.0421,-90.0032],
  MSY:[29.9934,-90.258],CVG:[39.0488,-84.6678],CLE:[41.4117,-81.8498],
  LHR:[51.4775,-0.4614],LGW:[51.1537,-0.1821],CDG:[49.0097,2.5479],
  FRA:[50.0379,8.5622],AMS:[52.3086,4.7639],MAD:[40.4936,-3.5668],
  FCO:[41.8003,12.2389],DXB:[25.2528,55.3644],DOH:[25.2731,51.608],
  SIN:[1.3644,103.9915],NRT:[35.7647,140.3864],HND:[35.5494,139.7798],
  HKG:[22.308,113.9185],ICN:[37.4602,126.4407],SYD:[-33.9399,151.1753],
  MEL:[-37.669,144.841],YYZ:[43.6777,-79.6248],YVR:[49.1947,-123.1839],
};

function coordsForLocation(locStr) {
  if (!locStr) return null;
  const upper = locStr.toUpperCase();
  // Try 3-4 letter ICAO/IATA code
  const codes = upper.match(/\b[A-Z]{3,4}\b/g) || [];
  for (const code of codes) {
    const iata = code.length === 4 && code.startsWith("K") ? code.slice(1) : code;
    if (AIRPORT_COORDS[iata]) return AIRPORT_COORDS[iata];
    if (AIRPORT_COORDS[code]) return AIRPORT_COORDS[code];
  }
  return null;
}

function severityFromText(text) {
  const t = (text || "").toLowerCase();
  if (/fatal|collision|crash|hull loss|destroyed|fire|emergency/i.test(t)) return "critical";
  if (/injury|injur|serious|near miss|close call|runway incursion/i.test(t)) return "high";
  if (/precautionary|go.?around|tcas ra|gpws|wind.?shear|bird.?strike/i.test(t)) return "medium";
  return "low";
}

function phaseFromText(text) {
  const t = (text || "").toLowerCase();
  if (/landing|touchdown|rollout|final approach/i.test(t)) return "Landing";
  if (/takeoff|take.off|departure|rotation/i.test(t)) return "Takeoff";
  if (/approach|ils|ils|localizer|glide/i.test(t)) return "Approach";
  if (/climb|initial climb/i.test(t)) return "Climb";
  if (/descent|descending/i.test(t)) return "Descent";
  if (/cruise|en.route|enroute/i.test(t)) return "En Route";
  if (/ground|taxi|pushback|gate/i.test(t)) return "Ground";
  return "Unknown";
}

function categoryFromText(text) {
  const t = (text || "").toLowerCase();
  if (/b7[0-9]{2}|a3[0-9]{2}|wide.?body|heavy/i.test(t)) return "Widebody Heavy";
  if (/b7[0-2][0-9]|a3[12][0-9]|narrow.?body/i.test(t)) return "Narrowbody";
  if (/turboprop|prop|atr|dash.?8|king.?air/i.test(t)) return "Turboprop";
  if (/helicopter|rotor|h60|ec.?[0-9]/i.test(t)) return "Helicopter";
  if (/cargo|freighter/i.test(t)) return "Cargo";
  if (/cessna|piper|beech|cirrus|private|ga|general\s+avia/i.test(t)) return "Private/GA";
  if (/military|c-17|c-130|f-16/i.test(t)) return "Military";
  return "Commercial Jet";
}

// Parse ASRS HTML search results table into normalized events
function parseASRSHtml(html, fetchedAt) {
  const events = [];
  // ASRS results are in an HTML table. Extract rows using regex.
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;

  let rowMatch;
  let rowIndex = 0;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    rowIndex++;
    if (rowIndex < 3) continue; // skip header rows

    const cells = [];
    let cellMatch;
    const cellSource = rowMatch[1];
    while ((cellMatch = cellRegex.exec(cellSource)) !== null) {
      cells.push(cellMatch[1].replace(/<[^>]+>/g, "").trim());
    }
    if (cells.length < 4) continue;

    // Typical ASRS columns: Report#, Date, Aircraft, Problem, Anomaly/Description
    const reportNum = cells[0]?.replace(/\s+/g, "") || "";
    if (!reportNum || !/\d{5,}/.test(reportNum)) continue;

    const dateStr = cells[1] || "";
    const aircraft = cells[2] || "Unknown Aircraft";
    const problem  = cells[3] || "";
    const desc     = cells[4] || problem;
    const location = cells[5] || "";

    // Parse date (ASRS uses MM/YYYY or MM/DD/YYYY)
    let isoDate = fetchedAt.slice(0, 10);
    const dm = dateStr.match(/(\d{1,2})\/(\d{4})/);
    if (dm) isoDate = `${dm[2]}-${dm[1].padStart(2,"0")}-01`;

    const coords = coordsForLocation(location);

    events.push({
      id:          `ASRS-${reportNum}`,
      type:        "incident",
      severity:    severityFromText(desc + " " + problem),
      date:        isoDate,
      aircraft:    aircraft.slice(0, 60),
      category:    categoryFromText(aircraft + " " + desc),
      reg:         null,
      carrier:     null,
      location:    location || "See ASRS report",
      lat:         coords ? coords[0] : null,
      lon:         coords ? coords[1] : null,
      injuries:    /injur/i.test(desc) ? "Reported" : "None reported",
      fatalities:  /fatal/i.test(desc) ? 1 : 0,
      phase:       phaseFromText(desc),
      description: desc.slice(0, 600),
      source:      "ASRS",
      url:         `https://asrs.arc.nasa.gov/search/cfquery.html`,
    });
  }
  return events;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const fetchedAt = new Date().toISOString();

  // Query last 90 days
  const endDate   = new Date();
  const startDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);

  const fmt = d => `${(d.getMonth()+1).toString().padStart(2,"0")}/${d.getFullYear()}`;

  try {
    // ASRS Database Online query form (POST)
    const params = new URLSearchParams({
      StartDate:  fmt(startDate),
      EndDate:    fmt(endDate),
      numRecords: "50",
      queryType:  "SQL",
      Submit:     "Query Database",
    });

    const resp = await fetch("https://asrs.arc.nasa.gov/search/cfquery.html", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (compatible; AIRWIRE/1.0)",
        "Accept": "text/html",
      },
      body: params.toString(),
      signal: AbortSignal.timeout(20000),
    });

    const html = await resp.text();
    const events = parseASRSHtml(html, fetchedAt);

    res.setHeader("Cache-Control", "max-age=1800"); // 30 min cache
    return res.status(200).json({
      events,
      fetchedAt,
      source: "ASRS",
      count: events.length,
    });

  } catch (err) {
    console.error("ASRS fetch error:", err.message);
    // Return empty rather than crashing the dashboard
    return res.status(200).json({
      events: [],
      fetchedAt,
      source: "ASRS",
      error: `ASRS unavailable: ${err.message}`,
    });
  }
}

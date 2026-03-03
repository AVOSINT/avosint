// api/asias.js — FAA ASIAS Preliminary Accident & Incident Reports
// Source: https://www.asias.faa.gov/apex/f?p=100:93:::NO:::
// Data window: last 10 BUSINESS DAYS only — this is a hard FAA constraint,
// not a limitation of this proxy. Historical data beyond ~14 calendar days
// is not available through this page.
//
// Strategy:
//  1. GET the main APEX page to obtain a session cookie
//  2. Use that cookie to request the CSV export
//  3. Parse CSV rows into normalized event objects

const BASE = "https://www.asias.faa.gov/apex";

// Rough lat/lon for US states — used when only a state is listed
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
  GU:[13.4,144.8],
};

// Airport IATA → coords (extended subset)
const AIRPORT_COORDS = {
  ATL:[33.6407,-84.4277],LAX:[33.9425,-118.4081],ORD:[41.9742,-87.9073],
  DFW:[32.8998,-97.0403],DEN:[39.8561,-104.6737],JFK:[40.6413,-73.7781],
  SFO:[37.6213,-122.379],LAS:[36.084,-115.1537],MCO:[28.4294,-81.3089],
  CLT:[35.214,-80.9431],LGA:[40.7772,-73.8726],EWR:[40.6895,-74.1745],
  PHX:[33.4373,-112.0078],SEA:[47.4502,-122.3088],MIA:[25.7959,-80.287],
  BOS:[42.3656,-71.0096],MSP:[44.8848,-93.2223],DTW:[42.2162,-83.3554],
  IAH:[29.9902,-95.3368],IAD:[38.9531,-77.4565],DCA:[38.8512,-77.0402],
  SLC:[40.7884,-111.9778],PDX:[45.5887,-122.5975],MDW:[41.7868,-87.7522],
  TPA:[27.9755,-82.5332],BNA:[36.1263,-86.6774],AUS:[30.1975,-97.6664],
  MEM:[35.0421,-90.0032],MSY:[29.9934,-90.258],PHL:[39.8729,-75.2437],
  SAN:[32.7336,-117.1897],BWI:[39.1754,-76.6682],STL:[38.7487,-90.37],
  MCI:[39.2976,-94.7139],CLE:[41.4117,-81.8498],CVG:[39.0488,-84.6678],
  CMH:[39.998,-82.8919],IND:[39.7173,-86.2944],MKE:[42.9472,-87.8966],
  OMA:[41.3032,-95.894],OKC:[35.3931,-97.6007],ABQ:[35.0402,-106.609],
  TUS:[32.1161,-110.941],ELP:[31.8072,-106.3779],BOI:[43.5644,-116.2228],
  FAI:[64.8151,-147.8561],HNL:[21.3245,-157.9251],ANC:[61.1743,-149.9963],
};

function coordsFor(city, state) {
  // Try airport code in city name (e.g. "KATL" or "ATL")
  if (city) {
    const codes = city.toUpperCase().match(/\b[A-Z]{3,4}\b/g) || [];
    for (const code of codes) {
      const iata = code.length === 4 && code.startsWith("K") ? code.slice(1) : code;
      if (AIRPORT_COORDS[iata]) return AIRPORT_COORDS[iata];
    }
  }
  // Fall back to state centroid
  if (state) {
    const st = state.trim().toUpperCase().slice(0, 2);
    if (STATE_COORDS[st]) return STATE_COORDS[st];
  }
  return null;
}

function categoryFromMake(make) {
  const m = (make || "").toUpperCase();
  if (/BOEING|AIRBUS|EMBRAER|BOMBARDIER|COMAC/.test(m)) return "Commercial Jet";
  if (/BELL|ROBINSON|SIKORSKY|AIRBUS.HEL|EUROCOPTER|SCHWEIZER|ENSTROM|HILLER/.test(m)) return "Helicopter";
  if (/CESSNA|PIPER|BEECH|CIRRUS|MOONEY|SOCATA|GLASAIR|LANCAIR|VANS|KITFOX|ZENITH|GLASTAR|KITFOX|RV-|SONEX|BELLANCA|AMERICAN CHAMP|ERCOUPE/.test(m)) return "Private/GA";
  if (/AIR TRACTOR|GRUMMAN AGRIC|WEATHERLY/.test(m)) return "Private/GA"; // ag aircraft
  if (/GULFSTREAM|LEARJET|DASSAULT|CESSNA CITAT|HAWKER|TEXTRON|PILATUS|EPIC/.test(m)) return "Private/GA";
  return "Private/GA"; // ASIAS is ~90% GA
}

// Parse CSV text — handles quoted fields and embedded commas
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  // Find header row
  const header = lines[0].split(",").map(h => h.replace(/"/g, "").trim().toUpperCase());

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    // Simple CSV parse — handle quoted fields
    const fields = [];
    let field = "";
    let inQuote = false;
    for (const ch of lines[i]) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === "," && !inQuote) { fields.push(field.trim()); field = ""; continue; }
      field += ch;
    }
    fields.push(field.trim());

    const row = {};
    header.forEach((h, idx) => { row[h] = fields[idx] || ""; });
    rows.push(row);
  }
  return rows;
}

// Convert a parsed CSV row into our normalized event schema
function rowToEvent(row, idx) {
  // ASIAS CSV column names (observed): 
  // ENTRY DATE, EVENT DATE, STATE, CITY, MAKE, MODEL, REGISTRATION, 
  // FATAL FLAG, INJURY, EVENT TYPE, REMARK
  // Column names may vary — we try multiple aliases

  const get = (...keys) => {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== "") return row[k];
    }
    return "";
  };

  const entryDateRaw = get("ENTRY DATE","ENTRY_DATE","DATE ENTERED","ENTRYDATE");
  const eventDateRaw = get("EVENT DATE","EVENT_DATE","ACCIDENT DATE","EVENTDATE","DATE OF ACCIDENT","DATE");
  const state        = get("STATE","ST");
  const city         = get("CITY","LOCATION","CITY/STATE");
  const make         = get("MAKE","AIRCRAFT MAKE","MANUFACTURER");
  const model        = get("MODEL","AIRCRAFT MODEL");
  const reg          = get("REGISTRATION","REG","TAIL NUMBER","TAIL NO","N-NUMBER");
  const fatalFlag    = get("FATAL FLAG","FATAL","FATALITIES FLAG","IS FATAL");
  const injuryRaw    = get("INJURY","INJURIES","INJURY TYPE","INJURY LEVEL");
  const eventType    = get("EVENT TYPE","TYPE","ACCIDENT/INCIDENT");
  const remark       = get("REMARK","REMARKS","NARRATIVE","DESCRIPTION","PRELIMINARY DESCRIPTION");

  // Parse event date — try MM/DD/YYYY, DD-MON-YY, YYYY-MM-DD
  let isoDate = new Date().toISOString().slice(0, 10);
  const useDate = eventDateRaw || entryDateRaw;
  const dm1 = useDate.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  const dm2 = useDate.match(/(\d{1,2})-([A-Z]{3})-(\d{2,4})/i);
  const dm3 = useDate.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (dm3) {
    isoDate = `${dm3[1]}-${dm3[2]}-${dm3[3]}`;
  } else if (dm1) {
    const yr = dm1[3].length === 2 ? `20${dm1[3]}` : dm1[3];
    isoDate = `${yr}-${dm1[1].padStart(2,"0")}-${dm1[2].padStart(2,"0")}`;
  } else if (dm2) {
    const MONTHS = {JAN:"01",FEB:"02",MAR:"03",APR:"04",MAY:"05",JUN:"06",
                   JUL:"07",AUG:"08",SEP:"09",OCT:"10",NOV:"11",DEC:"12"};
    const yr = dm2[3].length === 2 ? `20${dm2[3]}` : dm2[3];
    isoDate = `${yr}-${MONTHS[dm2[2].toUpperCase()]||"01"}-${dm2[1].padStart(2,"0")}`;
  }

  const isFatal   = /yes|fatal|y/i.test(fatalFlag);
  const fatalities = isFatal ? 1 : 0;
  const aircraft  = [make, model].filter(Boolean).join(" ").trim() || "Unknown Aircraft";
  const location  = [city, state].filter(Boolean).join(", ") || "Location not reported";
  const coords    = coordsFor(city, state);

  // Severity
  let severity = "low";
  if (isFatal) severity = "critical";
  else if (/serious|major|destroyed|hull/i.test(injuryRaw)) severity = "high";
  else if (/minor|subst/i.test(injuryRaw)) severity = "medium";

  // Type
  const type = /accident/i.test(eventType) ? "accident" : "incident";

  const description = remark
    ? remark.slice(0, 600)
    : `${type === "accident" ? "Accident" : "Incident"} involving ${aircraft} in ${location}. See FAA ASIAS for full preliminary report.`;

  return {
    id:          `ASIAS-${isoDate}-${idx}`,
    type,
    severity,
    date:        isoDate,
    aircraft:    aircraft.slice(0, 60),
    category:    categoryFromMake(make),
    reg:         reg || null,
    carrier:     null,
    location,
    lat:         coords ? coords[0] : null,
    lon:         coords ? coords[1] : null,
    injuries:    injuryRaw || (isFatal ? "Fatal" : "Not reported"),
    fatalities,
    phase:       "Unknown", // ASIAS preliminary data doesn't include phase
    description,
    source:      "ASIAS",
    url:         "https://www.asias.faa.gov/apex/f?p=100:93:::NO:::",
    entryDate:   entryDateRaw, // keep raw entry date for display
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const fetchedAt = new Date().toISOString();

  try {
    // Step 1 — Load main page to get session cookie from Oracle APEX
    const mainResp = await fetch(`${BASE}/f?p=100:93:::NO:::`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(15000),
    });

    // Capture session cookie from response
    const rawCookies = mainResp.headers.get("set-cookie") || "";
    // APEX session cookie is typically ORA_WWV_APP_100 or similar
    const cookieHeader = rawCookies.split(",")
      .map(c => c.split(";")[0].trim())
      .filter(c => c.includes("="))
      .join("; ");

    // Also extract the APEX session ID from the page HTML if present
    const mainHtml = await mainResp.text();
    const sessionMatch = mainHtml.match(/f\?p=100:93:(\d+)/);
    const sessionId = sessionMatch ? sessionMatch[1] : "";

    // Step 2 — Request the CSV export
    // Try both with and without session ID
    const csvUrls = [
      sessionId
        ? `${BASE}/f?p=100:93:${sessionId}:FLOW_EXCEL_OUTPUT_R16070756597770675_en`
        : null,
      `${BASE}/f?p=100:93::FLOW_EXCEL_OUTPUT_R16070756597770675_en`,
    ].filter(Boolean);

    let csvText = "";
    let csvFetched = false;

    for (const csvUrl of csvUrls) {
      try {
        const csvResp = await fetch(csvUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Accept": "text/csv,application/csv,text/plain,*/*",
            "Referer": `${BASE}/f?p=100:93:::NO:::`,
            "Cookie": cookieHeader,
          },
          signal: AbortSignal.timeout(20000),
        });

        if (csvResp.ok) {
          const contentType = csvResp.headers.get("content-type") || "";
          const body = await csvResp.text();
          // Confirm it looks like CSV data (has commas and newlines)
          if (body.includes(",") && body.includes("\n") && body.length > 100) {
            csvText = body;
            csvFetched = true;
            break;
          }
        }
      } catch (e) {
        // Try next URL
        continue;
      }
    }

    // Step 3 — If CSV fetch failed, try parsing the HTML table directly
    if (!csvFetched) {
      // Parse the summary HTML table as fallback — gives counts by date and make,
      // not individual records, but better than nothing
      const events = parseAsiasSummaryHtml(mainHtml, fetchedAt);
      res.setHeader("Cache-Control", "max-age=3600");
      return res.status(200).json({
        events,
        fetchedAt,
        source: "ASIAS",
        count: events.length,
        dataWindow: "10 business days",
        method: "html-summary", // indicates reduced fidelity
        note: "CSV export unavailable — summary data only. Individual report details require FAA ASIAS login.",
      });
    }

    // Step 4 — Parse CSV and normalize
    const rows   = parseCSV(csvText);
    const events = rows
      .map((row, i) => rowToEvent(row, i))
      .filter(ev => ev.aircraft !== "Unknown Aircraft" || ev.location !== "Location not reported");

    res.setHeader("Cache-Control", "max-age=3600"); // 1hr cache — data updates daily
    return res.status(200).json({
      events,
      fetchedAt,
      source: "ASIAS",
      count: events.length,
      dataWindow: "10 business days",
      method: "csv",
    });

  } catch (err) {
    console.error("ASIAS handler error:", err.message);
    return res.status(200).json({
      events: [],
      fetchedAt,
      source: "ASIAS",
      error: `ASIAS unavailable: ${err.message}`,
      dataWindow: "10 business days",
    });
  }
}

// Fallback: parse the HTML summary table into approximate events
// This creates one event record per date+make combination (lower fidelity)
function parseAsiasSummaryHtml(html, fetchedAt) {
  const events = [];
  // Extract date columns from header row
  const dateMatches = [...html.matchAll(/P94_ENTRY_DATE:(\d{2}-[A-Z]{3}-\d{2})/g)];
  const dates = dateMatches.map(m => m[1]);

  // Extract make+count cells
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch, rowIdx = 0;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    rowIdx++;
    if (rowIdx < 4) continue; // skip header rows
    const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      .map(m => m[1].replace(/<[^>]+>/g, "").trim());
    if (cells.length < 2 || !cells[0]) continue;
    const make = cells[0];
    if (/Categories|Aircraft|All Aircraft|Fatal|^\s*$/.test(make)) continue;

    cells.slice(1).forEach((cell, colIdx) => {
      const count = parseInt(cell.replace(/\*/g, ""), 10);
      if (!count || isNaN(count)) return;
      const entryDateRaw = dates[colIdx] || "";
      // Convert DD-MON-YY to ISO
      const dm = entryDateRaw.match(/(\d{2})-([A-Z]{3})-(\d{2})/i);
      const MONTHS = {JAN:"01",FEB:"02",MAR:"03",APR:"04",MAY:"05",JUN:"06",
                     JUL:"07",AUG:"08",SEP:"09",OCT:"10",NOV:"11",DEC:"12"};
      const isoDate = dm
        ? `20${dm[3]}-${MONTHS[dm[2].toUpperCase()]||"01"}-${dm[1]}`
        : fetchedAt.slice(0, 10);

      for (let i = 0; i < Math.min(count, 5); i++) {
        const coords = coordsFor("", ""); // no state info in summary
        events.push({
          id:          `ASIAS-sum-${isoDate}-${make}-${i}`,
          type:        "accident",
          severity:    "medium",
          date:        isoDate,
          aircraft:    make,
          category:    categoryFromMake(make),
          reg:         null,
          carrier:     null,
          location:    "See FAA ASIAS (summary data)",
          lat:         null,
          lon:         null,
          injuries:    "Not reported",
          fatalities:  0,
          phase:       "Unknown",
          description: `Preliminary report: ${count} ${make} aircraft event${count>1?"s":""} entered ${entryDateRaw}. Individual details available at FAA ASIAS. All information is preliminary and subject to change.`,
          source:      "ASIAS",
          url:         "https://www.asias.faa.gov/apex/f?p=100:93:::NO:::",
          entryDate:   entryDateRaw,
        });
      }
    });
  }
  return events;
}

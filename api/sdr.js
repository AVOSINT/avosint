// api/sdr.js — Proxy for FAA Service Difficulty Reports (SDR)
// Public access — no API key required.
// Data: https://av-info.faa.gov/sdrx/
// SDRs are filed by operators when aircraft parts fail or have defects in service.
// Useful for tracking recurring airworthiness issues across fleets.

const AIRPORT_COORDS = {
  ATL:[33.6407,-84.4277],LAX:[33.9425,-118.4081],ORD:[41.9742,-87.9073],
  DFW:[32.8998,-97.0403],DEN:[39.8561,-104.6737],JFK:[40.6413,-73.7781],
  SFO:[37.6213,-122.379],LAS:[36.084,-115.1537],MCO:[28.4294,-81.3089],
  CLT:[35.214,-80.9431],LGA:[40.7772,-73.8726],EWR:[40.6895,-74.1745],
  PHX:[33.4373,-112.0078],SEA:[47.4502,-122.3088],MIA:[25.7959,-80.287],
  BOS:[42.3656,-71.0096],MSP:[44.8848,-93.2223],DTW:[42.2162,-83.3554],
  IAH:[29.9902,-95.3368],IAD:[38.9531,-77.4565],DCA:[38.8512,-77.0402],
  SLC:[40.7884,-111.9778],PDX:[45.5887,-122.5975],TPA:[27.9755,-82.5332],
  BNA:[36.1263,-86.6774],AUS:[30.1975,-97.6664],MEM:[35.0421,-90.0032],
};

function coordsForLocation(locStr) {
  if (!locStr) return null;
  const codes = (locStr || "").toUpperCase().match(/\b[A-Z]{3,4}\b/g) || [];
  for (const code of codes) {
    const iata = code.length === 4 && code.startsWith("K") ? code.slice(1) : code;
    if (AIRPORT_COORDS[iata]) return AIRPORT_COORDS[iata];
    if (AIRPORT_COORDS[code]) return AIRPORT_COORDS[code];
  }
  return null;
}

function severityFromSDR(difficultyType, description) {
  const t = `${difficultyType} ${description}`.toLowerCase();
  if (/fire|structural|crack|fail|fracture|separation|collapse/i.test(t)) return "high";
  if (/malfunction|uncontained|bleed|hydraulic|smoke|fume/i.test(t)) return "medium";
  return "low";
}

function phaseFromSDR(stage) {
  const s = (stage || "").toLowerCase();
  if (/land/i.test(s)) return "Landing";
  if (/take.?off|depart/i.test(s)) return "Takeoff";
  if (/approach/i.test(s)) return "Approach";
  if (/climb/i.test(s)) return "Climb";
  if (/cruise|cruise/i.test(s)) return "En Route";
  if (/ground|taxi|park|main/i.test(s)) return "Ground";
  return "Unknown";
}

// Parse SDR XML/HTML response
function parseSDRResponse(text, fetchedAt) {
  const events = [];

  // SDR system can return XML — try to parse structured data
  // Look for SDR record patterns in the response
  const recordMatches = text.match(/<sdr[\s\S]*?<\/sdr>/gi) ||
                        text.match(/<record[\s\S]*?<\/record>/gi) || [];

  for (const rec of recordMatches) {
    const get = (tag) => {
      const m = rec.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
      return m ? m[1].replace(/<[^>]+>/g, "").trim() : "";
    };

    const reportNum  = get("rpt_no") || get("report_number") || get("id");
    const dateStr    = get("sdr_date") || get("report_date") || get("date");
    const acMake     = get("ac_make") || get("aircraft_make") || "";
    const acModel    = get("ac_model") || get("aircraft_model") || "";
    const reg        = get("reg_no") || get("registration") || null;
    const operator   = get("operator") || get("air_carrier") || null;
    const difficulty = get("diff_type") || get("difficulty_type") || "Mechanical Defect";
    const stage      = get("stage_of_ops") || get("flight_stage") || "";
    const airport    = get("airport") || get("location") || "";
    const narrative  = get("narr") || get("narrative") || get("description") || difficulty;

    if (!reportNum && !narrative) continue;

    let isoDate = fetchedAt.slice(0, 10);
    const dm = dateStr.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
    if (dm) {
      const yr = dm[3].length === 2 ? `20${dm[3]}` : dm[3];
      isoDate = `${yr}-${dm[1].padStart(2,"0")}-${dm[2].padStart(2,"0")}`;
    }

    const coords = coordsForLocation(airport);
    const aircraft = [acMake, acModel].filter(Boolean).join(" ") || "Unknown Aircraft";

    events.push({
      id:          `SDR-${reportNum || Date.now()}`,
      type:        "incident",
      severity:    severityFromSDR(difficulty, narrative),
      date:        isoDate,
      aircraft:    aircraft.slice(0, 60),
      category:    /helicopter|rotor/i.test(aircraft) ? "Helicopter" :
                   /turboprop|prop/i.test(aircraft) ? "Turboprop" : "Commercial Jet",
      reg:         reg || null,
      carrier:     operator || null,
      location:    airport || "FAA SDR Report",
      lat:         coords ? coords[0] : null,
      lon:         coords ? coords[1] : null,
      injuries:    "None reported",
      fatalities:  0,
      phase:       phaseFromSDR(stage),
      description: narrative.slice(0, 600),
      source:      "SDR",
      url:         "https://av-info.faa.gov/sdrx/",
    });
  }

  // Fallback: try HTML table parsing if no XML records found
  if (events.length === 0 && text.includes("<table")) {
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let rowMatch, rowIdx = 0;

    while ((rowMatch = rowRegex.exec(text)) !== null) {
      rowIdx++;
      if (rowIdx < 3) continue;
      const cells = [];
      let cm;
      while ((cm = cellRegex.exec(rowMatch[1])) !== null) {
        cells.push(cm[1].replace(/<[^>]+>/g, "").trim());
      }
      if (cells.length < 4 || !cells[0]) continue;
      if (!/\d{4,}/.test(cells[0])) continue;

      const coords = coordsForLocation(cells[4] || "");
      events.push({
        id:          `SDR-${cells[0]}`,
        type:        "incident",
        severity:    severityFromSDR(cells[3] || "", cells[5] || ""),
        date:        fetchedAt.slice(0, 10),
        aircraft:    (cells[2] || "Unknown").slice(0, 60),
        category:    "Commercial Jet",
        reg:         null,
        carrier:     null,
        location:    cells[4] || "FAA SDR Report",
        lat:         coords ? coords[0] : null,
        lon:         coords ? coords[1] : null,
        injuries:    "None reported",
        fatalities:  0,
        phase:       "Unknown",
        description: (cells[5] || cells[3] || "Service difficulty reported").slice(0, 600),
        source:      "SDR",
        url:         "https://av-info.faa.gov/sdrx/",
      });
    }
  }

  return events;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const fetchedAt = new Date().toISOString();

  // Accept optional ?from=YYYY-MM-DD&to=YYYY-MM-DD for historical queries
  // Default: last 365 days (SDR has good historical depth)
  const fromParam = req.query?.from || req.query?.startDate;
  const toParam   = req.query?.to   || req.query?.endDate;

  let end   = toParam   ? new Date(toParam)   : new Date();
  let start = fromParam ? new Date(fromParam)
                        : new Date(end.getTime() - 365 * 24 * 60 * 60 * 1000);

  if (isNaN(start.getTime())) start = new Date(end.getTime() - 365 * 24 * 60 * 60 * 1000);
  if (isNaN(end.getTime()))   end   = new Date();

  const fmt = d =>
    `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,"0")}-${d.getDate().toString().padStart(2,"0")}`;

  try {
    // FAA SDR query endpoint
    const queryUrl = new URL("https://av-info.faa.gov/sdrx/service.do");
    queryUrl.searchParams.set("action",    "fetchReports");
    queryUrl.searchParams.set("startDate", fmt(start));
    queryUrl.searchParams.set("endDate",   fmt(end));
    queryUrl.searchParams.set("maxRows",   "50");
    queryUrl.searchParams.set("format",    "xml");

    const resp = await fetch(queryUrl.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AIRWIRE/1.0)",
        "Accept": "application/xml, text/html",
      },
      signal: AbortSignal.timeout(18000),
    });

    const text = await resp.text();
    const events = parseSDRResponse(text, fetchedAt);

    res.setHeader("Cache-Control", "max-age=1800"); // 30 min cache
    return res.status(200).json({
      events,
      fetchedAt,
      source: "SDR",
      count: events.length,
    });

  } catch (err) {
    console.error("SDR fetch error:", err.message);
    return res.status(200).json({
      events: [],
      fetchedAt,
      source: "SDR",
      error: `FAA SDR unavailable: ${err.message}`,
    });
  }
}

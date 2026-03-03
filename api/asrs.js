// api/asrs.js — NASA Aviation Safety Reporting System
// Correct search URL: https://akama.arc.nasa.gov/ASRSDBOnline/QueryWizard_Filter.aspx
// This is an ASP.NET ASPX app requiring ViewState — we GET the form first,
// extract ViewState, then POST the search.

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const fromParam = req.query?.from;
  const toParam   = req.query?.to;
  const endDate   = toParam   ? new Date(toParam)   : new Date();
  const startDate = fromParam ? new Date(fromParam)
                              : new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000);

  // ASRS date format: MM/DD/YYYY
  const fmt = d => `${(d.getMonth()+1).toString().padStart(2,"0")}/${d.getDate().toString().padStart(2,"0")}/${d.getFullYear()}`;
  console.log(`[ASRS] Querying ${fmt(startDate)} → ${fmt(endDate)}`);

  const BASE = "https://akama.arc.nasa.gov/ASRSDBOnline";
  const FORM_URL = `${BASE}/QueryWizard_Filter.aspx`;

  try {
    // Step 1: GET the search form to obtain ASP.NET ViewState and cookies
    console.log(`[ASRS] Fetching form: ${FORM_URL}`);
    const formResp = await fetch(FORM_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept":     "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });

    console.log(`[ASRS] Form status: ${formResp.status}, type: ${formResp.headers.get("content-type")}`);
    const setCookie = formResp.headers.get("set-cookie") || "";
    const cookies = setCookie.split(/,(?=[^;]+=[^;]+;|[^;]+=)/)
      .map(c => c.split(";")[0].trim()).filter(c => c.includes("=")).join("; ");
    console.log(`[ASRS] Cookies: ${cookies.slice(0,150)}`);

    const formHtml = await formResp.text();
    console.log(`[ASRS] Form HTML length: ${formHtml.length}`);
    console.log(`[ASRS] Form HTML snippet: ${formHtml.slice(0,600).replace(/\s+/g," ")}`);

    // Extract ViewState and other hidden fields
    const viewstate      = (formHtml.match(/id="__VIEWSTATE"[^>]*value="([^"]*)"/) || [])[1] || "";
    const eventvalidation = (formHtml.match(/id="__EVENTVALIDATION"[^>]*value="([^"]*)"/) || [])[1] || "";
    const viewstategen   = (formHtml.match(/id="__VIEWSTATEGENERATOR"[^>]*value="([^"]*)"/) || [])[1] || "";
    console.log(`[ASRS] ViewState length: ${viewstate.length}`);
    console.log(`[ASRS] EventValidation length: ${eventvalidation.length}`);

    // Log all form input names to understand the form structure
    const inputs = [...formHtml.matchAll(/<input[^>]+name="([^"]+)"[^>]*>/gi)]
      .map(m => m[1]).filter(n => !n.startsWith("__"));
    const selects = [...formHtml.matchAll(/<select[^>]+name="([^"]+)"/gi)].map(m=>m[1]);
    console.log(`[ASRS] Form inputs: ${inputs.slice(0,20).join(", ")}`);
    console.log(`[ASRS] Form selects: ${selects.slice(0,10).join(", ")}`);
    const formActions = [...formHtml.matchAll(/<form[^>]+action="([^"]+)"/gi)].map(m=>m[1]);
    console.log(`[ASRS] Form actions: ${formActions.join(", ")}`);

    if (!formResp.ok || formHtml.length < 100) {
      console.log("[ASRS] Form fetch failed — trying direct search URL");
      throw new Error(`Form fetch failed: ${formResp.status}`);
    }

    // Step 2: POST the search
    // Use the form action URL if available, otherwise use the same URL
    const submitUrl = formActions[0]
      ? (formActions[0].startsWith("http") ? formActions[0] : `${BASE}/${formActions[0].replace(/^\//,"")}`)
      : FORM_URL;
    console.log(`[ASRS] Submitting to: ${submitUrl}`);

    const postBody = new URLSearchParams({
      __VIEWSTATE:          viewstate,
      __EVENTVALIDATION:    eventvalidation,
      __VIEWSTATEGENERATOR: viewstategen,
      // Date range fields — try multiple possible field names
      "ctl00$ContentPlaceHolder1$StartDate": fmt(startDate),
      "ctl00$ContentPlaceHolder1$EndDate":   fmt(endDate),
      "StartDate": fmt(startDate),
      "EndDate":   fmt(endDate),
      "txtStartDate": fmt(startDate),
      "txtEndDate":   fmt(endDate),
      "NumRecords": "50",
      "ctl00$ContentPlaceHolder1$NumRecords": "50",
      // Submit button — common ASPX patterns
      "ctl00$ContentPlaceHolder1$btnSearch": "Search",
      "btnSearch": "Search",
      "Submit":    "Submit",
    });

    const searchResp = await fetch(submitUrl, {
      method: "POST",
      headers: {
        "User-Agent":   "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept":       "text/html,application/xhtml+xml,*/*",
        "Referer":      FORM_URL,
        "Cookie":       cookies,
        "Origin":       BASE,
      },
      body: postBody.toString(),
      signal: AbortSignal.timeout(25000),
    });

    console.log(`[ASRS] Search response: ${searchResp.status}, type: ${searchResp.headers.get("content-type")}`);
    const resultHtml = await searchResp.text();
    console.log(`[ASRS] Result length: ${resultHtml.length}`);
    console.log(`[ASRS] Result snippet: ${resultHtml.slice(0,600).replace(/\s+/g," ")}`);

    // Log table structure in results
    const tables = resultHtml.match(/<table[^>]*>[\s\S]*?<\/table>/gi)||[];
    console.log(`[ASRS] Tables in result: ${tables.length}`);
    tables.forEach((t,i)=>{
      const rows=(t.match(/<tr/gi)||[]).length;
      if(rows>2) console.log(`[ASRS] Table ${i}: ${rows} rows, ${t.length} chars, header: ${(t.match(/<th[^>]*>([\s\S]*?)<\/th>/gi)||[]).map(h=>h.replace(/<[^>]+>/g,"").trim()).slice(0,6).join("|")}`);
    });

    const events = parseAsrsResults(resultHtml);
    console.log(`[ASRS] Parsed: ${events.length} events`);

    res.setHeader("Cache-Control","max-age=1800");
    return res.status(200).json({ events, count: events.length, source: "ASRS" });

  } catch(err) {
    console.error(`[ASRS] Error: ${err.message}`);
    return res.status(200).json({ events:[], source:"ASRS", error: err.message });
  }
}

// ── Coordinate lookup ────────────────────────────────────────────────────────
const AIRPORT_COORDS = {
  ATL:[33.64,-84.43],LAX:[33.94,-118.41],ORD:[41.97,-87.91],DFW:[32.90,-97.04],
  DEN:[39.86,-104.67],JFK:[40.64,-73.78],SFO:[37.62,-122.38],LAS:[36.08,-115.15],
  MCO:[28.43,-81.31],CLT:[35.21,-80.94],PHX:[33.44,-112.01],SEA:[47.45,-122.31],
  MIA:[25.80,-80.29],BOS:[42.37,-71.01],MSP:[44.88,-93.22],DTW:[42.22,-83.36],
  IAH:[29.99,-95.34],IAD:[38.95,-77.46],DCA:[38.85,-77.04],SLC:[40.79,-111.98],
  TPA:[27.98,-82.53],BNA:[36.13,-86.68],AUS:[30.20,-97.67],MCI:[39.30,-94.71],
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
function coordsFor(text) {
  if (!text) return [null,null];
  const up = text.toUpperCase();
  for (const [k,v] of Object.entries(AIRPORT_COORDS)) { if(up.includes(k)) return v; }
  for (const [k,v] of Object.entries(STATE_COORDS)) { if(up.includes(` ${k}`) || up.endsWith(k) || up.startsWith(k)) return v; }
  return [null,null];
}

function parseAsrsResults(html) {
  const events = [];
  // Try to find results table — ASRS typically shows a grid
  const tables = (html.match(/<table[^>]*>([\s\S]*?)<\/table>/gi)||[]).sort((a,b)=>b.length-a.length);
  if (!tables[0]) return events;

  const rows = tables[0].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)||[];
  let headerCells = [];
  let headerFound = false;

  for (const row of rows) {
    const cells = (row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)||[])
      .map(c=>c.replace(/<[^>]+>/g,"").replace(/&nbsp;/g," ").replace(/&#\d+;/g,"").trim());
    if (cells.length < 2) continue;

    // Detect header row
    if (!headerFound && /date|time|aircraft|location|type|report/i.test(cells.join(" "))) {
      headerCells = cells;
      headerFound = true;
      console.log(`[ASRS] Header cells: ${cells.slice(0,8).join(" | ")}`);
      continue;
    }

    if (!headerFound || cells.length < 3) continue;
    if (events.length < 3) console.log(`[ASRS] Data row: ${cells.slice(0,6).join(" | ")}`);

    const get = (...names) => {
      for (const n of names) {
        const idx = headerCells.findIndex(h => new RegExp(n,"i").test(h));
        if (idx>=0 && cells[idx]) return cells[idx];
      }
      return cells[names[0]] || ""; // numeric index fallback
    };

    const dateRaw  = get("date","Date","TIME") || "";
    const aircraft = get("aircraft","make","model","Aircraft") || cells[2] || "Unknown";
    const location = get("location","place","city","state","Location") || cells[3] || "";
    const type_    = get("type","anomaly","event","Type") || "incident";
    const narr     = get("synopsis","narrative","description","Synopsis") || cells.slice(-1)[0] || "";

    let isoDate = new Date().toISOString().slice(0,10);
    const dm = dateRaw.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
    if (dm) {
      const yr = dm[3].length===2 ? `20${dm[3]}` : dm[3];
      isoDate = `${yr}-${dm[1].padStart(2,"0")}-${dm[2].padStart(2,"0")}`;
    }

    const [lat,lon] = coordsFor(location);
    events.push({
      id:`ASRS-${isoDate}-${events.length}`,
      type: /accident/i.test(type_) ? "accident" : "incident",
      severity: /emergency|mayday|crash|collision/i.test(narr) ? "high" : "medium",
      date: isoDate, aircraft: aircraft.slice(0,60), category:"Private/GA",
      reg:null, carrier:null, location: location||"Not reported", lat, lon,
      injuries:"Not reported", fatalities:0, phase:"Unknown",
      description: narr.slice(0,600)||`ASRS report ${isoDate}`,
      source:"ASRS", url:"https://asrs.arc.nasa.gov",
    });
  }
  return events;
}

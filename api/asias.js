// api/asias.js — FAA ASIAS Preliminary Accident & Incident Reports
// Source: https://www.asias.faa.gov/apex/f?p=100:93:::NO:::
// Data window: last 10 BUSINESS DAYS only — FAA constraint.

const BASE = "https://www.asias.faa.gov/apex";

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

function coordsFor(city, state) {
  if (state) {
    const st = state.trim().toUpperCase().slice(0,2);
    if (STATE_COORDS[st]) return STATE_COORDS[st];
  }
  if (city) {
    const up = city.toUpperCase();
    for (const [abbr, coords] of Object.entries(STATE_COORDS)) {
      if (up.includes(` ${abbr}`) || up.endsWith(abbr)) return coords;
    }
  }
  return [null, null];
}

function categoryFromMake(make) {
  const m = (make||"").toUpperCase();
  if (/BOEING|AIRBUS|EMBRAER|BOMBARDIER/.test(m)) return "Commercial Jet";
  if (/BELL|ROBINSON|SIKORSKY|EUROCOPTER|AIRBUS HEL/.test(m)) return "Helicopter";
  return "Private/GA";
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  console.log("[ASIAS] Starting fetch");

  try {
    // Step 1: GET main page to obtain session
    const mainResp = await fetch(`${BASE}/f?p=100:93:::NO:::`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept":     "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });

    console.log(`[ASIAS] Main page status: ${mainResp.status}`);
    const setCookie = mainResp.headers.get("set-cookie") || "";
    console.log(`[ASIAS] Set-Cookie: ${setCookie.slice(0,200)}`);

    // Build cookie string from set-cookie header
    const cookies = setCookie.split(/,(?=[^;]+=[^;]+;|[^;]+=)/)
      .map(c => c.split(";")[0].trim())
      .filter(c => c.includes("="))
      .join("; ");
    console.log(`[ASIAS] Cookie to send: ${cookies.slice(0,200)}`);

    const mainHtml = await mainResp.text();
    console.log(`[ASIAS] Main HTML length: ${mainHtml.length}`);
    console.log(`[ASIAS] Main HTML snippet: ${mainHtml.slice(0,500).replace(/\s+/g," ")}`);

    // Extract APEX session ID from page links/forms
    const sessionMatch = mainHtml.match(/f\?p=100:93:(\d{10,})/);
    const sessionId = sessionMatch ? sessionMatch[1] : "";
    console.log(`[ASIAS] Session ID extracted: ${sessionId}`);

    // Also look for the CSV export link directly in the page
    const csvLinkMatch = mainHtml.match(/href="([^"]*EXCEL[^"]*|[^"]*csv[^"]*|[^"]*CSV[^"]*)"/i);
    console.log(`[ASIAS] CSV link in page: ${csvLinkMatch ? csvLinkMatch[1] : "none found"}`);

    // Step 2: Try CSV export with multiple URL patterns
    const csvUrls = [
      sessionId ? `${BASE}/f?p=100:93:${sessionId}:FLOW_EXCEL_OUTPUT_R16070756597770675_en` : null,
      `${BASE}/f?p=100:93::FLOW_EXCEL_OUTPUT_R16070756597770675_en`,
      csvLinkMatch ? `${BASE}/${csvLinkMatch[1].replace(/^\/apex\//,"")}` : null,
    ].filter(Boolean);

    for (const csvUrl of csvUrls) {
      console.log(`[ASIAS] Trying CSV URL: ${csvUrl}`);
      try {
        const csvResp = await fetch(csvUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Accept":     "text/csv,application/csv,text/plain,*/*",
            "Referer":    `${BASE}/f?p=100:93:::NO:::`,
            "Cookie":     cookies,
          },
          signal: AbortSignal.timeout(20000),
        });

        console.log(`[ASIAS] CSV response status: ${csvResp.status}`);
        console.log(`[ASIAS] CSV content-type: ${csvResp.headers.get("content-type")}`);
        const body = await csvResp.text();
        console.log(`[ASIAS] CSV body length: ${body.length}`);
        console.log(`[ASIAS] CSV body first 300: ${body.slice(0,300).replace(/\s+/g," ")}`);

        // Check if it looks like CSV data
        if (body.length > 200 && body.includes(",") && body.split("\n").length > 2) {
          const events = parseCsv(body);
          if (events.length > 0) {
            console.log(`[ASIAS] Parsed ${events.length} events from CSV`);
            res.setHeader("Cache-Control", "max-age=3600");
            return res.status(200).json({
              events, count: events.length, source: "ASIAS",
              dataWindow: "10 business days", method: "csv",
            });
          }
        }
      } catch(e) {
        console.log(`[ASIAS] CSV URL failed: ${e.message}`);
      }
    }

    // Step 3: Fall back to parsing the HTML summary table
    console.log("[ASIAS] CSV unavailable — parsing HTML summary table");
    const events = parseHtmlSummary(mainHtml);
    console.log(`[ASIAS] HTML summary parsed ${events.length} events`);

    res.setHeader("Cache-Control", "max-age=3600");
    return res.status(200).json({
      events, count: events.length, source: "ASIAS",
      dataWindow: "10 business days", method: "html-summary",
    });

  } catch (err) {
    console.error(`[ASIAS] Fatal error: ${err.message}`);
    return res.status(200).json({
      events: [], source: "ASIAS", error: err.message,
      dataWindow: "10 business days",
    });
  }
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.replace(/"/g,"").trim().toUpperCase());
  console.log(`[ASIAS] CSV headers: ${headers.join(", ")}`);
  const events = [];
  for (let i = 1; i < lines.length; i++) {
    const fields=[]; let f="",inQ=false;
    for(const ch of lines[i]){
      if(ch==='"'){inQ=!inQ;continue;}
      if(ch===','&&!inQ){fields.push(f.trim());f="";continue;}
      f+=ch;
    }
    fields.push(f.trim());
    const row={};
    headers.forEach((h,idx)=>{row[h]=fields[idx]||"";});
    const get=(...keys)=>{for(const k of keys)if(row[k])return row[k];return "";};
    const make    = get("MAKE","AIRCRAFT MAKE","MANUFACTURER","MFR");
    const model   = get("MODEL","AIRCRAFT MODEL");
    const date    = get("EVENT DATE","EVENT_DATE","DATE","ACCIDENT DATE","DATE OF ACCIDENT");
    const entDate = get("ENTRY DATE","ENTRY_DATE","DATE ENTERED");
    const state   = get("STATE","ST");
    const city    = get("CITY","LOCATION","CITY/STATE");
    const fatal   = get("FATAL FLAG","FATAL","IS FATAL","FATALITIES FLAG");
    const injury  = get("INJURY","INJURIES","INJURY TYPE","INJURY LEVEL");
    const evType  = get("EVENT TYPE","TYPE","ACCIDENT/INCIDENT");
    const remark  = get("REMARK","REMARKS","NARRATIVE","DESCRIPTION","PRELIMINARY DESCRIPTION");
    if (!make && !remark) continue;
    let isoDate = new Date().toISOString().slice(0,10);
    const useDate = date || entDate;
    const dm = useDate.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
    const dm2 = useDate.match(/(\d{4})-(\d{2})-(\d{2})/);
    if(dm2) isoDate=`${dm2[1]}-${dm2[2]}-${dm2[3]}`;
    else if(dm){const yr=dm[3].length===2?`20${dm[3]}`:dm[3];isoDate=`${yr}-${dm[1].padStart(2,"0")}-${dm[2].padStart(2,"0")}`;}
    const isFatal = /yes|fatal|y/i.test(fatal);
    const [lat,lon] = coordsFor(city, state);
    events.push({
      id:`ASIAS-${isoDate}-${events.length}`,
      type:/accident/i.test(evType)?"accident":"incident",
      severity:isFatal?"critical":/serious|major/i.test(injury)?"high":"medium",
      date:isoDate,
      aircraft:`${make} ${model}`.trim().slice(0,60)||"Unknown",
      category:categoryFromMake(make),
      reg:null, carrier:null,
      location:[city,state].filter(Boolean).join(", ")||"Not reported",
      lat, lon,
      injuries:injury||(isFatal?"Fatal":"Not reported"),
      fatalities:isFatal?1:0,
      phase:"Unknown",
      description:(remark||`${evType||"Accident/Incident"} involving ${make} in ${state}`).slice(0,600),
      source:"ASIAS",
      url:"https://www.asias.faa.gov/apex/f?p=100:93:::NO:::",
      entryDate: entDate,
    });
  }
  return events;
}

function parseHtmlSummary(html) {
  const events = [];
  // Extract date column headers — format like "Feb-06" or "DD-MON-YY"
  const dateMatches = [...html.matchAll(/P94_ENTRY_DATE:(\d{2}-[A-Z]{3}-\d{2})/gi)];
  const dates = [...new Set(dateMatches.map(m => m[1]))];
  console.log(`[ASIAS] Summary dates found: ${dates.join(", ")}`);

  if (dates.length === 0) {
    console.log("[ASIAS] No date columns found in HTML — structure may have changed");
    console.log(`[ASIAS] HTML contains 'P94_ENTRY_DATE': ${html.includes("P94_ENTRY_DATE")}`);
    console.log(`[ASIAS] HTML contains 'ENTRY_DATE': ${html.includes("ENTRY_DATE")}`);
    return events;
  }

  const MONTHS = {JAN:"01",FEB:"02",MAR:"03",APR:"04",MAY:"05",JUN:"06",
                  JUL:"07",AUG:"08",SEP:"09",OCT:"10",NOV:"11",DEC:"12"};

  // Parse tbody rows — each manufacturer row has counts per date column
  // Find all table rows with make names and counts
  const rowMatches = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  console.log(`[ASIAS] Total TR rows in HTML: ${rowMatches.length}`);

  let dataRowCount = 0;
  for (const [,row] of rowMatches) {
    // Extract text from all cells
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      .map(m => m[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g," ").replace(/\*/g,"").trim());

    if (cells.length < 2) continue;
    const make = cells[0];
    if (!make || /categories|aircraft|fatal|all aircraft|^\s*$|\|/i.test(make)) continue;
    if (make.length > 50) continue; // skip non-make cells

    dataRowCount++;
    cells.slice(1).forEach((cell, colIdx) => {
      const count = parseInt(cell, 10);
      if (!count || isNaN(count) || count < 1) return;
      const entryDateRaw = dates[colIdx] || "";
      const dm = entryDateRaw.match(/(\d{2})-([A-Z]{3})-(\d{2})/i);
      const isoDate = dm
        ? `20${dm[3]}-${MONTHS[dm[2].toUpperCase()]||"01"}-${dm[1]}`
        : new Date().toISOString().slice(0,10);
      // Create one summary event per manufacturer+date (not per individual report)
      events.push({
        id:`ASIAS-sum-${isoDate}-${make.replace(/\s/g,"-")}-${colIdx}`,
        type:"accident",
        severity:"medium",
        date:isoDate,
        aircraft:make,
        category:categoryFromMake(make),
        reg:null, carrier:null,
        location:"United States (see FAA ASIAS for details)",
        lat:null, lon:null,
        injuries:"Not reported",
        fatalities:0,
        phase:"Unknown",
        description:`${count} preliminary ${make} aircraft event${count>1?"s":""} entered ${entryDateRaw}. All information is preliminary and subject to change. Individual details at FAA ASIAS.`,
        source:"ASIAS",
        url:"https://www.asias.faa.gov/apex/f?p=100:93:::NO:::",
        entryDate:entryDateRaw,
      });
    });
  }
  console.log(`[ASIAS] Processed ${dataRowCount} manufacturer data rows → ${events.length} events`);
  return events;
}

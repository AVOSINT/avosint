// api/asias.js — FAA ASIAS Preliminary Accident & Incident Reports
// CSV column names confirmed from live response 2026-03-03:
// UPDATED, ENTRY_DATE, EVENT_LCL_DATE, EVENT_LCL_TIME, LOC_CITY_NAME,
// LOC_STATE_NAME, LOC_CNTRY_NAME, RMK_TEXT, EVENT_TYPE_DESC, FSDO_DESC,
// REGIST_NBR, FLT_NBR, ACFT_OPRTR, ACFT_MAKE_NAME, ACFT_MODEL_NAME,
// ACFT_MISSING_FLAG, ACFT_DMG_DESC, FLT_ACTIVITY, FLT_PHASE, FAR_PART,
// MAX_INJ_LVL, FATAL_FLAG, FLT_CRW_INJ_NONE/MINOR/SERIOUS/FATAL/UNK,
// CBN_CRW_INJ_*, PAX_INJ_*, GRND_INJ_*, UNK INJ *
// Data window: last 10 BUSINESS DAYS — FAA constraint, not a proxy limitation.

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
  GU:[13.4,144.8],
};

// Full state name → abbreviation for LOC_STATE_NAME field (which uses full names)
const STATE_NAME_MAP = {
  "ALABAMA":"AL","ALASKA":"AK","ARIZONA":"AZ","ARKANSAS":"AR","CALIFORNIA":"CA",
  "COLORADO":"CO","CONNECTICUT":"CT","DELAWARE":"DE","FLORIDA":"FL","GEORGIA":"GA",
  "HAWAII":"HI","IDAHO":"ID","ILLINOIS":"IL","INDIANA":"IN","IOWA":"IA",
  "KANSAS":"KS","KENTUCKY":"KY","LOUISIANA":"LA","MAINE":"ME","MARYLAND":"MD",
  "MASSACHUSETTS":"MA","MICHIGAN":"MI","MINNESOTA":"MN","MISSISSIPPI":"MS",
  "MISSOURI":"MO","MONTANA":"MT","NEBRASKA":"NE","NEVADA":"NV",
  "NEW HAMPSHIRE":"NH","NEW JERSEY":"NJ","NEW MEXICO":"NM","NEW YORK":"NY",
  "NORTH CAROLINA":"NC","NORTH DAKOTA":"ND","OHIO":"OH","OKLAHOMA":"OK",
  "OREGON":"OR","PENNSYLVANIA":"PA","RHODE ISLAND":"RI","SOUTH CAROLINA":"SC",
  "SOUTH DAKOTA":"SD","TENNESSEE":"TN","TEXAS":"TX","UTAH":"UT","VERMONT":"VT",
  "VIRGINIA":"VA","WASHINGTON":"WA","WEST VIRGINIA":"WV","WISCONSIN":"WI",
  "WYOMING":"WY","DISTRICT OF COLUMBIA":"DC","PUERTO RICO":"PR","GUAM":"GU",
};

function coordsFor(city, stateName) {
  // LOC_STATE_NAME is a full name like "TEXAS" — convert to abbr first
  const abbr = stateName ? (STATE_NAME_MAP[stateName.toUpperCase()] || stateName.toUpperCase().slice(0,2)) : null;
  if (abbr && STATE_COORDS[abbr]) return STATE_COORDS[abbr];
  return [null, null];
}

function categoryFromMake(make) {
  const m = (make||"").toUpperCase();
  if (/BOEING|AIRBUS|EMBRAER|BOMBARDIER|COMAC/.test(m)) return "Commercial Jet";
  if (/BELL|ROBINSON|SIKORSKY|EUROCOPTER|ENSTROM|HILLER|SCHWEIZER/.test(m)) return "Helicopter";
  if (/CESSNA|PIPER|BEECH|CIRRUS|MOONEY|SOCATA|GLASAIR|LANCAIR|VANS|SONEX|BELLANCA/.test(m)) return "Private/GA";
  if (/GULFSTREAM|LEARJET|DASSAULT|HAWKER|PILATUS/.test(m)) return "Private/GA";
  return "Private/GA";
}

function severityFromInjury(injLvl, fatalFlag) {
  if (/yes|y/i.test(fatalFlag)) return "critical";
  if (!injLvl) return "low";
  const lvl = injLvl.toUpperCase();
  if (lvl === "FATAL")   return "critical";
  if (lvl === "SERIOUS") return "high";
  if (lvl === "MINOR")   return "medium";
  return "low";
}

function parseInjurySummary(row) {
  // Sum up injury counts across all categories
  const fields = ["FLT_CRW_INJ_MINOR","FLT_CRW_INJ_SERIOUS","FLT_CRW_INJ_FATAL",
                  "CBN_CRW_INJ_MINOR","CBN_CRW_INJ_SERIOUS","CBN_CRW_INJ_FATAL",
                  "PAX_INJ_MINOR","PAX_INJ_SERIOUS","PAX_INJ_FATAL"];
  const fatFields = ["FLT_CRW_INJ_FATAL","CBN_CRW_INJ_FATAL","PAX_INJ_FATAL","GRND_INJ_FATAL"];
  const fatal = fatFields.reduce((s,f) => s + (parseInt(row[f])||0), 0);
  const injured = fields.filter(f=>!f.includes("FATAL")).reduce((s,f) => s + (parseInt(row[f])||0), 0);
  if (fatal > 0) return `${fatal} fatal`;
  if (injured > 0) return `${injured} injured`;
  return "None reported";
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  // Parse header row — strip quotes
  const headers = lines[0].split(",").map(h => h.replace(/"/g,"").trim());
  console.log(`[ASIAS] CSV row count: ${lines.length - 1}`);

  const events = [];
  for (let i = 1; i < lines.length; i++) {
    // Parse quoted CSV
    const fields = [];
    let field = "", inQuote = false;
    for (const ch of lines[i]) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { fields.push(field.trim()); field = ""; continue; }
      field += ch;
    }
    fields.push(field.trim());

    const row = {};
    headers.forEach((h, idx) => { row[h] = fields[idx] || ""; });

    // ── Use confirmed column names from live CSV ──────────────────────────
    const make      = row["ACFT_MAKE_NAME"] || "";
    const model     = row["ACFT_MODEL_NAME"] || "";
    const eventDate = row["EVENT_LCL_DATE"]  || "";
    const entryDate = row["ENTRY_DATE"]      || "";
    const city      = row["LOC_CITY_NAME"]   || "";
    const stateName = row["LOC_STATE_NAME"]  || "";
    const country   = row["LOC_CNTRY_NAME"]  || "";
    const remark    = row["RMK_TEXT"]        || "";
    const evType    = row["EVENT_TYPE_DESC"] || "";
    const reg       = row["REGIST_NBR"]      || "";
    const carrier   = row["ACFT_OPRTR"]      || "";
    const phase     = row["FLT_PHASE"]       || "";
    const damage    = row["ACFT_DMG_DESC"]   || "";
    const injLvl    = row["MAX_INJ_LVL"]     || "";
    const fatalFlag = row["FATAL_FLAG"]      || "";

    if (!make && !remark) continue;

    // Parse event date — ASIAS format is typically MM/DD/YYYY or YYYY-MM-DD
    let isoDate = new Date().toISOString().slice(0, 10);
    const useDate = eventDate || entryDate;
    const dm1 = useDate.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
    const dm2 = useDate.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (dm2) {
      isoDate = `${dm2[1]}-${dm2[2]}-${dm2[3]}`;
    } else if (dm1) {
      const yr = dm1[3].length === 2 ? `20${dm1[3]}` : dm1[3];
      isoDate = `${yr}-${dm1[1].padStart(2,"0")}-${dm1[2].padStart(2,"0")}`;
    }

    const isUS = !country || country.toUpperCase() === "USA" || country.toUpperCase() === "UNITED STATES";
    const [lat, lon] = isUS ? coordsFor(city, stateName) : [null, null];
    const isFatal = /yes|y/i.test(fatalFlag);
    const fatalities = isFatal ? (parseInt(row["FLT_CRW_INJ_FATAL"]||0) + parseInt(row["CBN_CRW_INJ_FATAL"]||0) + parseInt(row["PAX_INJ_FATAL"]||0) || 1) : 0;
    const location = [city, stateName, isUS ? null : country].filter(Boolean).join(", ") || "Location not reported";

    const description = remark
      ? `${remark.slice(0, 500)}${damage ? ` Aircraft damage: ${damage}.` : ""}`
      : `${evType||"Event"} involving ${make} ${model} in ${location}. Phase: ${phase||"unknown"}. All information is preliminary.`;

    events.push({
      id:          `ASIAS-${isoDate}-${i}`,
      type:        /accident/i.test(evType) ? "accident" : "incident",
      severity:    severityFromInjury(injLvl, fatalFlag),
      date:        isoDate,
      aircraft:    `${make} ${model}`.trim().slice(0, 60) || "Unknown",
      category:    categoryFromMake(make),
      reg:         reg || null,
      carrier:     carrier || null,
      location,
      lat, lon,
      injuries:    parseInjurySummary(row),
      fatalities,
      phase:       phase || "Unknown",
      description: description.slice(0, 600),
      source:      "ASIAS",
      url:         "https://www.asias.faa.gov/apex/f?p=100:93:::NO:::",
      entryDate,
    });
  }

  console.log(`[ASIAS] CSV parsed: ${events.length} events`);
  return events;
}

// ── HTML summary fallback (used when CSV parse fails) ─────────────────────────
function parseHtmlSummary(html) {
  const events = [];
  const dateMatches = [...html.matchAll(/P94_ENTRY_DATE:(\d{2}-[A-Z]{3}-\d{2})/gi)];
  const dates = [...new Set(dateMatches.map(m => m[1]))];
  if (dates.length === 0) return events;

  const MONTHS = {JAN:"01",FEB:"02",MAR:"03",APR:"04",MAY:"05",JUN:"06",
                  JUL:"07",AUG:"08",SEP:"09",OCT:"10",NOV:"11",DEC:"12"};

  const rowMatches = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  for (const [,row] of rowMatches) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      .map(m => m[1].replace(/<[^>]+>/g,"").replace(/&nbsp;/g," ").replace(/\*/g,"").trim());
    if (cells.length < 2) continue;
    const make = cells[0];
    if (!make || /categories|aircraft|fatal|all aircraft|^\s*$|\|/i.test(make) || make.length > 50) continue;
    cells.slice(1).forEach((cell, colIdx) => {
      const count = parseInt(cell, 10);
      if (!count || isNaN(count)) return;
      const entryDateRaw = dates[colIdx] || "";
      const dm = entryDateRaw.match(/(\d{2})-([A-Z]{3})-(\d{2})/i);
      const isoDate = dm ? `20${dm[3]}-${MONTHS[dm[2].toUpperCase()]||"01"}-${dm[1]}` : new Date().toISOString().slice(0,10);
      events.push({
        id:`ASIAS-sum-${isoDate}-${make.replace(/\s/g,"-")}-${colIdx}`,
        type:"accident", severity:"medium", date:isoDate,
        aircraft:make, category:categoryFromMake(make),
        reg:null, carrier:null,
        location:"United States (see FAA ASIAS for details)",
        lat:null, lon:null,
        injuries:"Not reported", fatalities:0, phase:"Unknown",
        description:`${count} preliminary ${make} aircraft event${count>1?"s":""} entered ${entryDateRaw}. All information is preliminary and subject to change.`,
        source:"ASIAS", url:"https://www.asias.faa.gov/apex/f?p=100:93:::NO:::",
        entryDate:entryDateRaw,
      });
    });
  }
  return events;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  console.log("[ASIAS] Starting fetch");

  try {
    // Step 1: GET main page for session cookie
    const mainResp = await fetch(`${BASE}/f?p=100:93:::NO:::`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept":     "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });

    const setCookie = mainResp.headers.get("set-cookie") || "";
    const cookies = setCookie.split(/,(?=[^;]+=[^;]+;|[^;]+=)/)
      .map(c => c.split(";")[0].trim()).filter(c => c.includes("=")).join("; ");

    const mainHtml = await mainResp.text();
    console.log(`[ASIAS] Main page: ${mainResp.status}, HTML: ${mainHtml.length} chars`);

    // Step 2: Fetch CSV export
    const csvUrl = `${BASE}/f?p=100:93::FLOW_EXCEL_OUTPUT_R16070756597770675_en`;
    console.log(`[ASIAS] Fetching CSV: ${csvUrl}`);

    const csvResp = await fetch(csvUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept":     "text/csv,application/csv,application/excel,text/plain,*/*",
        "Referer":    `${BASE}/f?p=100:93:::NO:::`,
        "Cookie":     cookies,
      },
      signal: AbortSignal.timeout(20000),
    });

    console.log(`[ASIAS] CSV: ${csvResp.status}, type: ${csvResp.headers.get("content-type")}`);
    const csvText = await csvResp.text();
    console.log(`[ASIAS] CSV length: ${csvText.length}, lines: ${csvText.split("\n").length}`);

    // Parse CSV using confirmed column names
    if (csvText.length > 200 && csvText.includes("ACFT_MAKE_NAME")) {
      const events = parseCsv(csvText);
      if (events.length > 0) {
        console.log(`[ASIAS] Success: ${events.length} events from CSV`);
        res.setHeader("Cache-Control", "max-age=3600");
        return res.status(200).json({
          events, count: events.length, source: "ASIAS",
          dataWindow: "10 business days", method: "csv",
        });
      }
    }

    // Step 3: HTML summary fallback
    console.log("[ASIAS] Falling back to HTML summary");
    const events = parseHtmlSummary(mainHtml);
    console.log(`[ASIAS] HTML summary: ${events.length} events`);
    res.setHeader("Cache-Control", "max-age=3600");
    return res.status(200).json({
      events, count: events.length, source: "ASIAS",
      dataWindow: "10 business days", method: "html-summary",
    });

  } catch (err) {
    console.error(`[ASIAS] Error: ${err.message}`);
    return res.status(200).json({ events: [], source: "ASIAS", error: err.message, dataWindow: "10 business days" });
  }
}

// api/sdr.js — FAA Service Difficulty Reports
// Source: https://av-info.faa.gov/sdrx/
// The SDR database offers a web search at av-info.faa.gov/sdrx/
// We try multiple endpoint formats and log what we get back.

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

const AIRPORT_COORDS = {
  ATL:[33.64,-84.43],LAX:[33.94,-118.41],ORD:[41.97,-87.91],DFW:[32.90,-97.04],
  DEN:[39.86,-104.67],JFK:[40.64,-73.78],SFO:[37.62,-122.38],LAS:[36.08,-115.15],
  MCO:[28.43,-81.31],CLT:[35.21,-80.94],PHX:[33.44,-112.01],SEA:[47.45,-122.31],
  MIA:[25.80,-80.29],BOS:[42.37,-71.01],MSP:[44.88,-93.22],DTW:[42.22,-83.36],
  IAH:[29.99,-95.34],IAD:[38.95,-77.46],DCA:[38.85,-77.04],SLC:[40.79,-111.98],
  TPA:[27.98,-82.53],BNA:[36.13,-86.68],AUS:[30.20,-97.67],MCI:[39.30,-94.71],
};

function coordsFor(text) {
  if (!text) return [null, null];
  const up = text.toUpperCase();
  const codes = up.match(/\b([A-Z]{3,4})\b/g) || [];
  for (const c of codes) {
    const key = c.length === 4 && c.startsWith("K") ? c.slice(1) : c;
    if (AIRPORT_COORDS[key]) return AIRPORT_COORDS[key];
    if (STATE_COORDS[c]) return STATE_COORDS[c];
  }
  return [null, null];
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const fromParam = req.query?.from;
  const toParam   = req.query?.to;

  const endDate   = toParam   ? new Date(toParam)   : new Date();
  const startDate = fromParam ? new Date(fromParam)
                              : new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000);

  const fmtDate = d => d.toISOString().slice(0, 10); // YYYY-MM-DD

  console.log(`[SDR] Querying ${fmtDate(startDate)} → ${fmtDate(endDate)}`);

  // FAA SDR offers multiple access points — try each in order
  const endpoints = [
    // Option 1: The main search action (most likely correct)
    {
      url: `https://av-info.faa.gov/sdrx/service.do?action=fetchReports&startDate=${fmtDate(startDate)}&endDate=${fmtDate(endDate)}&maxRows=100`,
      method: "GET",
    },
    // Option 2: Direct report list page (HTML)
    {
      url: `https://av-info.faa.gov/sdrx/report_search.do?startDate=${fmtDate(startDate)}&endDate=${fmtDate(endDate)}`,
      method: "GET",
    },
    // Option 3: SDR search form POST
    {
      url: "https://av-info.faa.gov/sdrx/report_search.do",
      method: "POST",
      body: new URLSearchParams({
        startDate: fmtDate(startDate),
        endDate:   fmtDate(endDate),
        maxRows:   "100",
        action:    "search",
      }).toString(),
    },
  ];

  for (const ep of endpoints) {
    try {
      console.log(`[SDR] Trying: ${ep.method} ${ep.url}`);
      const resp = await fetch(ep.url, {
        method: ep.method,
        headers: {
          "User-Agent":   "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Accept":       "text/html,application/xml,application/xhtml+xml,text/csv,*/*",
          "Content-Type": ep.body ? "application/x-www-form-urlencoded" : undefined,
        },
        body: ep.body,
        signal: AbortSignal.timeout(15000),
      });

      console.log(`[SDR] Status: ${resp.status}, Content-Type: ${resp.headers.get("content-type")}`);
      const text = await resp.text();
      console.log(`[SDR] Response length: ${text.length}, First 300: ${text.slice(0,300).replace(/\s+/g," ")}`);

      if (!resp.ok || text.length < 100) continue;

      // Try XML parsing first
      if (text.includes("<") && text.includes("sdr") || text.includes("SDR")) {
        const events = parseSdrXml(text);
        if (events.length > 0) {
          console.log(`[SDR] Parsed ${events.length} events from XML/HTML`);
          res.setHeader("Cache-Control", "max-age=1800");
          return res.status(200).json({ events, count: events.length, source: "SDR" });
        }
      }

      // Try CSV parsing
      if (text.includes(",") && text.split("\n").length > 2) {
        const events = parseSdrCsv(text);
        if (events.length > 0) {
          console.log(`[SDR] Parsed ${events.length} events from CSV`);
          res.setHeader("Cache-Control", "max-age=1800");
          return res.status(200).json({ events, count: events.length, source: "SDR" });
        }
      }

      console.log("[SDR] Response not parseable with current strategies, trying next endpoint");

    } catch (err) {
      console.error(`[SDR] Endpoint failed: ${err.message}`);
    }
  }

  console.log("[SDR] All endpoints exhausted — returning empty");
  return res.status(200).json({ events: [], count: 0, source: "SDR",
    note: "SDR parsing unsuccessful — check logs for response format details" });
}

function parseSdrXml(text) {
  const events = [];
  // Try multiple XML tag patterns
  const recordPatterns = [
    /<report[^>]*>([\s\S]*?)<\/report>/gi,
    /<sdr[^>]*>([\s\S]*?)<\/sdr>/gi,
    /<Record[^>]*>([\s\S]*?)<\/Record>/gi,
    /<row[^>]*>([\s\S]*?)<\/row>/gi,
    /<tr[^>]*>([\s\S]*?)<\/tr>/gi,
  ];

  let records = [];
  for (const pattern of recordPatterns) {
    const found = [...text.matchAll(pattern)];
    if (found.length > 1) { // >1 to skip potential container tag
      records = found;
      console.log(`[SDR] Found ${records.length} records with pattern ${pattern}`);
      break;
    }
  }

  const getField = (xml, ...tags) => {
    for (const tag of tags) {
      const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
      if (m) return m[1].replace(/<[^>]+>/g, "").trim();
    }
    return "";
  };

  for (const [,record] of records) {
    const dateRaw = getField(record, "sdr_date","date","report_date","DATE","DT");
    const make    = getField(record, "ac_make","make","aircraft_make","MAKE","MFR");
    const model   = getField(record, "ac_model","model","aircraft_model","MODEL");
    const reg     = getField(record, "reg_no","registration","REG","NNUM","n_number");
    const op      = getField(record, "operator","OPERATOR","carrier");
    const diff    = getField(record, "diff_type","difficulty","DIFF","problem_code");
    const airport = getField(record, "airport","ARPT","location","CITY");
    const narr    = getField(record, "narr","narrative","NARR","description","DESC");
    const rpt     = getField(record, "rpt_no","report_no","RPT","id");

    if (!make && !narr) continue;

    let isoDate = new Date().toISOString().slice(0, 10);
    const dm = dateRaw.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
    const dm2 = dateRaw.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (dm2) isoDate = `${dm2[1]}-${dm2[2]}-${dm2[3]}`;
    else if (dm) {
      const yr = dm[3].length===2?`20${dm[3]}`:dm[3];
      isoDate = `${yr}-${dm[1].padStart(2,"0")}-${dm[2].padStart(2,"0")}`;
    }

    const [lat, lon] = coordsFor(`${airport} ${op}`);
    const isFire = /fire|smoke|burn/i.test(diff + narr);
    const isCrit = /fail|crack|struct|fracture|separat/i.test(diff + narr);

    events.push({
      id:          `SDR-${rpt||isoDate+"-"+events.length}`,
      type:        "incident",
      severity:    isFire?"high":isCrit?"medium":"low",
      date:        isoDate,
      aircraft:    `${make} ${model}`.trim().slice(0,60)||"Unknown",
      category:    "Commercial Jet",
      reg:         reg||null,
      carrier:     op||null,
      location:    airport||op||"Location not reported",
      lat, lon,
      injuries:    "Not reported",
      fatalities:  0,
      phase:       "Unknown",
      description: (narr||`SDR: ${diff}`).slice(0,600),
      source:      "SDR",
      url:         "https://av-info.faa.gov/sdrx/",
    });
  }
  return events;
}

function parseSdrCsv(text) {
  const lines = text.split(/\r?\n/).filter(l=>l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h=>h.replace(/"/g,"").trim().toUpperCase());
  console.log(`[SDR] CSV headers: ${headers.join(", ")}`);
  const events = [];
  for (let i=1;i<lines.length;i++) {
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
    const make=get("MAKE","AC_MAKE","MANUFACTURER","MFR");
    const model=get("MODEL","AC_MODEL");
    const date=get("DATE","SDR_DATE","REPORT_DATE","DT");
    const narr=get("NARRATIVE","NARR","DESCRIPTION","DESC","REMARKS");
    const reg=get("REG","REG_NO","REGISTRATION","N_NUMBER");
    const op=get("OPERATOR","CARRIER","AIRLINE");
    const airport=get("AIRPORT","ARPT","LOCATION","CITY");
    if(!make&&!narr) continue;
    let isoDate=new Date().toISOString().slice(0,10);
    const dm=date.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
    const dm2=date.match(/(\d{4})-(\d{2})-(\d{2})/);
    if(dm2) isoDate=`${dm2[1]}-${dm2[2]}-${dm2[3]}`;
    else if(dm){const yr=dm[3].length===2?`20${dm[3]}`:dm[3];isoDate=`${yr}-${dm[1].padStart(2,"0")}-${dm[2].padStart(2,"0")}`;}
    const [lat,lon]=coordsFor(`${airport} ${op}`);
    events.push({
      id:`SDR-csv-${isoDate}-${events.length}`,
      type:"incident",severity:"low",date:isoDate,
      aircraft:`${make} ${model}`.trim().slice(0,60)||"Unknown",
      category:"Commercial Jet",reg:reg||null,carrier:op||null,
      location:airport||op||"Not reported",lat,lon,
      injuries:"Not reported",fatalities:0,phase:"Unknown",
      description:(narr||`SDR report ${isoDate}`).slice(0,600),
      source:"SDR",url:"https://av-info.faa.gov/sdrx/",
    });
  }
  return events;
}

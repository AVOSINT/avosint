// api/sdr.js — FAA Service Difficulty Reports
// Previous endpoints at av-info.faa.gov/sdrx/ all returned 404.
// This version discovers the correct URL and logs everything.

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
  DEN:[39.86,-104.67],JFK:[40.64,-73.78],SFO:[37.62,-122.38],PHX:[33.44,-112.01],
  SEA:[47.45,-122.31],MIA:[25.80,-80.29],BOS:[42.37,-71.01],IAH:[29.99,-95.34],
};

function coordsFor(text) {
  if (!text) return [null,null];
  const up=text.toUpperCase();
  for(const [k,v] of Object.entries(AIRPORT_COORDS)){if(up.includes(k))return v;}
  for(const [k,v] of Object.entries(STATE_COORDS)){if(up.includes(` ${k} `)||up.endsWith(k))return v;}
  return [null,null];
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const fromParam = req.query?.from;
  const toParam   = req.query?.to;
  const endDate   = toParam   ? new Date(toParam)   : new Date();
  const startDate = fromParam ? new Date(fromParam)
                              : new Date(endDate.getTime() - 365*24*60*60*1000);
  const fmtISO = d => d.toISOString().slice(0,10);
  const fmtMDY = d => `${(d.getMonth()+1).toString().padStart(2,"0")}/${d.getDate().toString().padStart(2,"0")}/${d.getFullYear()}`;

  console.log(`[SDR] Querying ${fmtISO(startDate)} → ${fmtISO(endDate)}`);

  // Step 1: Discover the SDR base URL — try multiple domain/path combinations
  const discoveryUrls = [
    "https://av-info.faa.gov/sdrx/",
    "https://av-info.faa.gov/sdrx/index.html",
    "https://av-info.faa.gov/",
    "https://amsrvs.registry.faa.gov/airmeninquiry/",  // FAA uses this domain for some services
    "https://registry.faa.gov/aircraftinquiry/",
    "https://www.faa.gov/data_research/accident_incident/service_difficulty_reports/",
  ];

  for (const url of discoveryUrls) {
    try {
      console.log(`[SDR] Discovering: ${url}`);
      const r = await fetch(url, {
        headers: { "User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
        signal: AbortSignal.timeout(8000),
      });
      console.log(`[SDR] ${url} → status=${r.status}, type=${r.headers.get("content-type")}, location=${r.headers.get("location")||"none"}`);
      if (r.ok) {
        const text = await r.text();
        console.log(`[SDR] Content length: ${text.length}`);
        console.log(`[SDR] Content snippet: ${text.slice(0,400).replace(/\s+/g," ")}`);
        const links = [...text.matchAll(/href="([^"]*(?:sdr|service.do|search|report)[^"]*)"/gi)].map(m=>m[1]).slice(0,8);
        console.log(`[SDR] Relevant links: ${links.join(", ")}`);
        const formActions = [...text.matchAll(/<form[^>]+action="([^"]+)"/gi)].map(m=>m[1]);
        console.log(`[SDR] Form actions: ${formActions.join(", ")}`);
      }
    } catch(e) {
      console.log(`[SDR] ${url} error: ${e.message}`);
    }
  }

  // Step 2: Try search endpoints with multiple URL/param patterns
  const searchEndpoints = [
    // Original (confirmed 404 — keeping for reference)
    { url:`https://av-info.faa.gov/sdrx/service.do?action=fetchReports&startDate=${fmtISO(startDate)}&endDate=${fmtISO(endDate)}&maxRows=100`, method:"GET" },
    // Common alternative paths for FAA web apps
    { url:`https://av-info.faa.gov/sdrx/SDRSearch.do?startDate=${fmtISO(startDate)}&endDate=${fmtISO(endDate)}`, method:"GET" },
    { url:`https://av-info.faa.gov/sdrx/SDRSearch.aspx?startDate=${fmtISO(startDate)}&endDate=${fmtISO(endDate)}`, method:"GET" },
    { url:"https://av-info.faa.gov/sdrx/SDRSearch.do", method:"POST",
      body: new URLSearchParams({ startDate:fmtISO(startDate), endDate:fmtISO(endDate), maxRows:"100" }).toString() },
    // FAA may have moved SDR to a different subdomain
    { url:`https://www.faa.gov/data_research/accident_incident/service_difficulty_reports/media/SDRText${endDate.getFullYear()}.zip`, method:"GET" },
  ];

  for (const ep of searchEndpoints) {
    try {
      console.log(`[SDR] Trying: ${ep.method} ${ep.url}`);
      const r = await fetch(ep.url, {
        method: ep.method,
        headers: {
          "User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Accept":"text/html,application/xml,text/xml,text/csv,*/*",
          "Content-Type": ep.body?"application/x-www-form-urlencoded":undefined,
        },
        body: ep.body,
        signal: AbortSignal.timeout(12000),
      });
      console.log(`[SDR] → status=${r.status}, type=${r.headers.get("content-type")}`);
      const text = await r.text();
      console.log(`[SDR] Length: ${text.length}, snippet: ${text.slice(0,300).replace(/\s+/g," ")}`);

      if (r.ok && text.length > 200) {
        const events = tryParseSdr(text);
        if (events.length > 0) {
          console.log(`[SDR] Parsed ${events.length} events`);
          res.setHeader("Cache-Control","max-age=1800");
          return res.status(200).json({ events, count:events.length, source:"SDR" });
        }
      }
    } catch(e) {
      console.log(`[SDR] ${ep.url} error: ${e.message}`);
    }
  }

  console.log("[SDR] All endpoints failed. Check logs above for correct URL patterns.");
  return res.status(200).json({ events:[], source:"SDR", count:0,
    note:"SDR URL discovery in progress — check Vercel logs" });
}

function tryParseSdr(text) {
  const events = [];
  // Try JSON
  try {
    const data=JSON.parse(text);
    const records=Array.isArray(data)?data:(data.results||data.records||data.data||data.reports||[]);
    if(records.length>0){
      console.log(`[SDR] JSON keys: ${Object.keys(records[0]).join(", ")}`);
    }
  } catch(e){/* not JSON */}

  // Try XML
  if (text.includes("<?xml")||text.includes("<report>")||text.includes("<SDR>")||text.includes("<Record>")) {
    const tags = ["report","Record","SDR","row","sdr"];
    for(const tag of tags){
      const recs=[...text.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,"gi"))];
      if(recs.length>1){
        console.log(`[SDR] XML: found ${recs.length} <${tag}> records, keys in first: ${recs[0][1].match(/<(\w+)>/g)?.slice(0,10).join(",")}`);
        break;
      }
    }
  }

  // Try HTML table
  const tables=(text.match(/<table[^>]*>[\s\S]*?<\/table>/gi)||[]).sort((a,b)=>b.length-a.length);
  if(tables.length>0){
    const rows=tables[0].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)||[];
    if(rows.length>1){
      const headerCells=(rows[0].match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)||[]).map(c=>c.replace(/<[^>]+>/g,"").trim());
      console.log(`[SDR] HTML table: ${rows.length} rows, header: ${headerCells.slice(0,8).join(" | ")}`);
    }
  }
  return events; // Return empty — logging only until we know the format
}

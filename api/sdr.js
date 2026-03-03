// api/sdr.js — FAA Service Difficulty Reports
// Correct URL confirmed: https://sdrs.faa.gov/Query.aspx
// This is an ASP.NET ASPX app — requires ViewState extraction before POST.

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
  if(!text) return [null,null];
  const up=text.toUpperCase();
  for(const [k,v] of Object.entries(AIRPORT_COORDS)){if(up.includes(k))return v;}
  for(const [k,v] of Object.entries(STATE_COORDS)){if(up.includes(` ${k}`)||up.endsWith(k))return v;}
  return [null,null];
}

const QUERY_URL = "https://sdrs.faa.gov/Query.aspx";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const fromParam = req.query?.from;
  const toParam   = req.query?.to;
  const endDate   = toParam   ? new Date(toParam)   : new Date();
  const startDate = fromParam ? new Date(fromParam)
                              : new Date(endDate.getTime() - 365*24*60*60*1000);

  // SDR date format: MM/DD/YYYY
  const fmtMDY = d => `${(d.getMonth()+1).toString().padStart(2,"0")}/${d.getDate().toString().padStart(2,"0")}/${d.getFullYear()}`;
  const fmtISO = d => d.toISOString().slice(0,10);
  console.log(`[SDR] Querying ${fmtMDY(startDate)} → ${fmtMDY(endDate)}`);

  try {
    // Step 1: GET the Query page to obtain ViewState and form field names
    console.log(`[SDR] Fetching form: ${QUERY_URL}`);
    const formResp = await fetch(QUERY_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept":     "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });

    console.log(`[SDR] Form: ${formResp.status}, type: ${formResp.headers.get("content-type")}`);
    const setCookie = formResp.headers.get("set-cookie") || "";
    const cookies = setCookie.split(/,(?=[^;]+=[^;]+;|[^;]+=)/)
      .map(c=>c.split(";")[0].trim()).filter(c=>c.includes("=")).join("; ");
    console.log(`[SDR] Cookies: ${cookies.slice(0,200)}`);

    const formHtml = await formResp.text();
    console.log(`[SDR] Form HTML length: ${formHtml.length}`);
    console.log(`[SDR] Form snippet: ${formHtml.slice(0,600).replace(/\s+/g," ")}`);

    // Extract ASP.NET hidden fields
    const viewstate       = (formHtml.match(/id="__VIEWSTATE"[^>]*value="([^"]*)"/) || [])[1] || "";
    const eventvalidation = (formHtml.match(/id="__EVENTVALIDATION"[^>]*value="([^"]*)"/) || [])[1] || "";
    const viewstategen    = (formHtml.match(/id="__VIEWSTATEGENERATOR"[^>]*value="([^"]*)"/) || [])[1] || "";
    console.log(`[SDR] ViewState: ${viewstate.length} chars, EventValidation: ${eventvalidation.length} chars`);

    // Log all form inputs and selects to see the field names
    const inputs  = [...formHtml.matchAll(/<input[^>]+name="([^"]+)"[^>]*(?:value="([^"]*)")?/gi)]
      .map(m=>`${m[1]}=${m[2]||""}`).filter(n=>!n.startsWith("__")).slice(0,20);
    const selects = [...formHtml.matchAll(/<select[^>]+name="([^"]+)"/gi)].map(m=>m[1]);
    console.log(`[SDR] Form inputs: ${inputs.join(", ")}`);
    console.log(`[SDR] Selects: ${selects.join(", ")}`);
    const formAction = (formHtml.match(/<form[^>]+action="([^"]+)"/i)||[])[1] || "";
    console.log(`[SDR] Form action: ${formAction}`);

    const submitUrl = formAction
      ? (formAction.startsWith("http") ? formAction : `https://sdrs.faa.gov${formAction.startsWith("/")?formAction:"/"+formAction}`)
      : QUERY_URL;

    // Step 2: POST the search form
    // Try common ASPX date field naming patterns for SDR
    const postBody = new URLSearchParams({
      __VIEWSTATE:          viewstate,
      __EVENTVALIDATION:    eventvalidation,
      __VIEWSTATEGENERATOR: viewstategen,
      // Try multiple possible field names for start/end date
      "ctl00$ContentPlaceHolder1$txtStartDate": fmtMDY(startDate),
      "ctl00$ContentPlaceHolder1$txtEndDate":   fmtMDY(endDate),
      "ctl00$ContentPlaceHolder1$txtDateFrom":  fmtMDY(startDate),
      "ctl00$ContentPlaceHolder1$txtDateTo":    fmtMDY(endDate),
      "txtStartDate": fmtMDY(startDate),
      "txtEndDate":   fmtMDY(endDate),
      "StartDate":    fmtMDY(startDate),
      "EndDate":      fmtMDY(endDate),
      // Submit button
      "ctl00$ContentPlaceHolder1$btnSearch": "Search",
      "btnSearch": "Search",
    });

    console.log(`[SDR] POSTing to: ${submitUrl}`);
    const searchResp = await fetch(submitUrl, {
      method: "POST",
      headers: {
        "User-Agent":   "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept":       "text/html,application/xhtml+xml,*/*",
        "Referer":      QUERY_URL,
        "Cookie":       cookies,
        "Origin":       "https://sdrs.faa.gov",
      },
      body: postBody.toString(),
      signal: AbortSignal.timeout(25000),
    });

    console.log(`[SDR] Search: ${searchResp.status}, type: ${searchResp.headers.get("content-type")}`);
    const resultHtml = await searchResp.text();
    console.log(`[SDR] Result length: ${resultHtml.length}`);
    console.log(`[SDR] Result snippet: ${resultHtml.slice(0,600).replace(/\s+/g," ")}`);

    // Log tables in result for structure analysis
    const tables=(resultHtml.match(/<table[^>]*>[\s\S]*?<\/table>/gi)||[]).sort((a,b)=>b.length-a.length);
    console.log(`[SDR] Tables in result: ${tables.length}`);
    tables.slice(0,3).forEach((t,i)=>{
      const rows=(t.match(/<tr/gi)||[]).length;
      const heads=(t.match(/<th[^>]*>([\s\S]*?)<\/th>/gi)||[]).map(h=>h.replace(/<[^>]+>/g,"").trim()).slice(0,8);
      if(rows>1) console.log(`[SDR] Table ${i}: ${rows} rows, headers: ${heads.join("|")}`);
    });

    const events = parseSdrResults(resultHtml);
    console.log(`[SDR] Parsed: ${events.length} events`);

    res.setHeader("Cache-Control","max-age=1800");
    return res.status(200).json({ events, count:events.length, source:"SDR" });

  } catch(err) {
    console.error(`[SDR] Error: ${err.message}`);
    return res.status(200).json({ events:[], source:"SDR", error:err.message });
  }
}

function parseSdrResults(html) {
  const events = [];
  const tables=(html.match(/<table[^>]*>([\s\S]*?)<\/table>/gi)||[]).sort((a,b)=>b.length-a.length);
  if(!tables[0]) return events;

  const rows=tables[0].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)||[];
  let headers=[];
  let headerFound=false;

  for(const row of rows){
    const cells=(row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)||[])
      .map(c=>c.replace(/<[^>]+>/g,"").replace(/&nbsp;/g," ").trim());
    if(cells.length<2) continue;

    if(!headerFound&&/date|make|model|reg|operator|diff|narr/i.test(cells.join(" "))){
      headers=cells;
      headerFound=true;
      console.log(`[SDR] Headers: ${cells.slice(0,8).join("|")}`);
      continue;
    }
    if(!headerFound||cells.length<3) continue;

    const get=(...names)=>{
      for(const n of names){
        const idx=headers.findIndex(h=>new RegExp(n,"i").test(h));
        if(idx>=0&&cells[idx]) return cells[idx];
      }
      return "";
    };

    const dateRaw=get("date","Date","DT")|| "";
    const make   =get("make","manufacturer","Make")||cells[1]||"Unknown";
    const model  =get("model","Model")||"";
    const reg    =get("reg","registration","n-number","tail")||"";
    const op     =get("operator","carrier","airline","Operator")||"";
    const diff   =get("difficulty","diff","problem","Difficulty")||"";
    const narr   =get("narrative","narr","description","Narrative")||cells.slice(-1)[0]||"";
    const airport=get("airport","city","location","Airport")||"";

    let isoDate=new Date().toISOString().slice(0,10);
    const dm=dateRaw.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
    const dm2=dateRaw.match(/(\d{4})-(\d{2})-(\d{2})/);
    if(dm2) isoDate=`${dm2[1]}-${dm2[2]}-${dm2[3]}`;
    else if(dm){const yr=dm[3].length===2?`20${dm[3]}`:dm[3];isoDate=`${yr}-${dm[1].padStart(2,"0")}-${dm[2].padStart(2,"0")}`;}

    const [lat,lon]=coordsFor(`${airport} ${op}`);
    const isCrit=/fire|smoke|struct|fracture|crack|fail/i.test(diff+narr);
    events.push({
      id:`SDR-${isoDate}-${events.length}`,
      type:"incident",
      severity:isCrit?"high":"low",
      date:isoDate,
      aircraft:`${make} ${model}`.trim().slice(0,60)||"Unknown",
      category:"Commercial Jet",
      reg:reg||null, carrier:op||null,
      location:airport||op||"Not reported",
      lat, lon,
      injuries:"Not reported", fatalities:0, phase:"Unknown",
      description:(narr||`SDR: ${diff}`).slice(0,600),
      source:"SDR", url:"https://sdrs.faa.gov/",
    });
  }
  return events;
}

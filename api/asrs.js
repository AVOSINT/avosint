// api/asrs.js — NASA Aviation Safety Reporting System
// Previous URL asrs.arc.nasa.gov/search/cfquery.html returned 404.
// This version discovers the correct search URL by fetching the landing page first,
// then logs everything about the response so we can fix the parser next round.

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const fromParam = req.query?.from;
  const toParam   = req.query?.to;
  const endDate   = toParam   ? new Date(toParam)   : new Date();
  const startDate = fromParam ? new Date(fromParam)
                              : new Date(endDate.getTime() - 730 * 24 * 60 * 60 * 1000);
  const fmt = d => `${(d.getMonth()+1).toString().padStart(2,"0")}/${d.getFullYear()}`;

  console.log(`[ASRS] Querying ${fmt(startDate)} → ${fmt(endDate)}`);

  // Step 1: Fetch the ASRS landing page to discover the actual search URL
  const landingUrls = [
    "https://asrs.arc.nasa.gov/search/db.html",
    "https://asrs.arc.nasa.gov/",
    "https://asrs.arc.nasa.gov/search/",
  ];

  let searchFormHtml = "";
  let workingBase = "";

  for (const url of landingUrls) {
    try {
      console.log(`[ASRS] Trying landing: ${url}`);
      const r = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
        signal: AbortSignal.timeout(10000),
      });
      console.log(`[ASRS] Landing ${url}: status=${r.status}`);
      if (r.ok) {
        const text = await r.text();
        console.log(`[ASRS] Landing page length: ${text.length}`);
        console.log(`[ASRS] Landing page snippet: ${text.slice(0,500).replace(/\s+/g," ")}`);
        // Look for a form action URL
        const formAction = text.match(/<form[^>]+action="([^"]+)"/i);
        const links = [...text.matchAll(/href="([^"]*search[^"]*)"/gi)].map(m=>m[1]).slice(0,5);
        console.log(`[ASRS] Form action: ${formAction ? formAction[1] : "none"}`);
        console.log(`[ASRS] Search links found: ${links.join(", ")}`);
        searchFormHtml = text;
        workingBase = url;
        break;
      }
    } catch(e) {
      console.log(`[ASRS] Landing ${url} failed: ${e.message}`);
    }
  }

  // Step 2: Try known search endpoints with the date range
  const searchEndpoints = [
    // Try the ASRS online database search
    { method:"POST", url:"https://asrs.arc.nasa.gov/search/cfquery.html",
      body: new URLSearchParams({ StartDate:fmt(startDate), EndDate:fmt(endDate), numRecords:"50" }).toString() },
    { method:"GET",  url:`https://asrs.arc.nasa.gov/search/db.html?StartDate=${fmt(startDate)}&EndDate=${fmt(endDate)}&numRecords=50` },
    // ASRS also has a legacy interface
    { method:"POST", url:"https://akama.arc.nasa.gov/ASRSDBOnline/search/cfquery.cfm",
      body: new URLSearchParams({ StartDate:fmt(startDate), EndDate:fmt(endDate), numRecords:"50" }).toString() },
    // Try newer NASA ASRS API endpoint patterns
    { method:"GET",  url:`https://asrs.arc.nasa.gov/api/reports?start=${startDate.toISOString().slice(0,10)}&end=${endDate.toISOString().slice(0,10)}&limit=50` },
  ];

  for (const ep of searchEndpoints) {
    try {
      console.log(`[ASRS] Trying search: ${ep.method} ${ep.url}`);
      const r = await fetch(ep.url, {
        method: ep.method,
        headers: {
          "User-Agent":   "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Accept":       "text/html,application/json,*/*",
          "Content-Type": ep.body ? "application/x-www-form-urlencoded" : undefined,
          "Origin":       "https://asrs.arc.nasa.gov",
          "Referer":      "https://asrs.arc.nasa.gov/search/db.html",
        },
        body: ep.body,
        signal: AbortSignal.timeout(15000),
      });

      console.log(`[ASRS] ${ep.url} → status=${r.status}, type=${r.headers.get("content-type")}`);
      const text = await r.text();
      console.log(`[ASRS] Response length: ${text.length}`);
      console.log(`[ASRS] Response snippet: ${text.slice(0,400).replace(/\s+/g," ")}`);

      if (r.ok && text.length > 300) {
        // Try to parse whatever came back
        const events = tryParseAsrs(text);
        if (events.length > 0) {
          console.log(`[ASRS] Parsed ${events.length} events from ${ep.url}`);
          res.setHeader("Cache-Control","max-age=1800");
          return res.status(200).json({ events, count:events.length, source:"ASRS" });
        }
        console.log(`[ASRS] Got response from ${ep.url} but parsed 0 events — logging table structure`);
        // Log table count and sizes for debugging
        const tables = text.match(/<table[^>]*>[\s\S]*?<\/table>/gi)||[];
        console.log(`[ASRS] Tables in response: ${tables.length}`);
        tables.forEach((t,i)=>console.log(`[ASRS] Table ${i}: ${(t.match(/<tr/gi)||[]).length} rows, ${t.length} chars, snippet: ${t.slice(0,200).replace(/\s+/g," ")}`));
      }
    } catch(e) {
      console.log(`[ASRS] ${ep.url} failed: ${e.message}`);
    }
  }

  console.log("[ASRS] All endpoints failed — returning empty. Check logs for correct URL.");
  return res.status(200).json({
    events: [], source: "ASRS", count: 0,
    note: "ASRS URL discovery in progress — check Vercel logs for correct endpoint",
  });
}

function tryParseAsrs(text) {
  const events = [];
  // Try JSON first
  try {
    const data = JSON.parse(text);
    const records = Array.isArray(data) ? data : (data.results||data.records||data.data||[]);
    if (records.length > 0) {
      console.log(`[ASRS] JSON keys: ${Object.keys(records[0]).join(", ")}`);
      return records.slice(0,50).map((r,i) => ({
        id:`ASRS-${i}`, type:"incident", severity:"medium",
        date: r.date||r.Date||r.report_date||new Date().toISOString().slice(0,10),
        aircraft: r.aircraft||r.Aircraft||r.acft_type||"Unknown",
        category:"Private/GA", reg:null, carrier:null,
        location: r.location||r.Location||r.place||"Not reported",
        lat:null, lon:null, injuries:"Not reported", fatalities:0, phase:"Unknown",
        description: (r.narrative||r.Narrative||r.synopsis||r.Synopsis||JSON.stringify(r)).slice(0,600),
        source:"ASRS", url:"https://asrs.arc.nasa.gov",
      }));
    }
  } catch(e) { /* not JSON */ }

  // Try HTML table
  const tables = text.match(/<table[^>]*>([\s\S]*?)<\/table>/gi)||[];
  const dataTable = tables.sort((a,b)=>b.length-a.length)[0]||"";
  if (!dataTable) return events;

  const rows = dataTable.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)||[];
  let headerSkipped = false;
  for (const row of rows) {
    const cells = (row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi)||[])
      .map(td=>td.replace(/<[^>]+>/g,"").replace(/&nbsp;/g," ").trim());
    if (cells.length < 3) continue;
    if (!headerSkipped && /report|date|time|place|aircraft/i.test(cells.join(" "))) {
      headerSkipped=true;
      console.log(`[ASRS] Header cells: ${cells.slice(0,8).join(" | ")}`);
      continue;
    }
    const dateCell = cells.find(c=>/\d{1,2}\/\d{1,2}\/\d{4}/.test(c))||"";
    let isoDate = new Date().toISOString().slice(0,10);
    const dm = dateCell.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dm) isoDate=`${dm[3]}-${dm[1].padStart(2,"0")}-${dm[2].padStart(2,"0")}`;
    const desc = cells.find(c=>c.length>50)||cells.slice(-1)[0]||"";
    if (!isoDate && !desc) continue;
    events.push({
      id:`ASRS-${isoDate}-${events.length}`, type:"incident", severity:"medium",
      date:isoDate, aircraft:cells[3]||"Unknown", category:"Private/GA",
      reg:null, carrier:null, location:cells[4]||"Not reported",
      lat:null, lon:null, injuries:"Not reported", fatalities:0, phase:"Unknown",
      description:desc.slice(0,600), source:"ASRS", url:"https://asrs.arc.nasa.gov",
    });
  }
  return events;
}

// api/sdr.js — FAA Service Difficulty Reports
// Scrapes sdrs.faa.gov/Query.aspx using a two-step GET→POST approach.
// Key fix: dynamically extracts ALL form field values from the GET response
// and uses them in the POST (required for ASP.NET ViewState forms).

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
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// SDR date format: MM/DD/YYYY
const fmtMDY = d => `${(d.getMonth()+1).toString().padStart(2,"0")}/${d.getDate().toString().padStart(2,"0")}/${d.getFullYear()}`;

/** Extract ALL form inputs/selects from HTML so we can replay them in the POST.
 *  This is the correct way to handle ASP.NET WebForms — keep every default value
 *  and only override the fields we want to change. */
function extractFormFields(html) {
  const fields = {};

  // Hidden inputs (ViewState, EventValidation, etc.)
  for (const m of html.matchAll(/<input[^>]+type=["']?hidden["']?[^>]*name=["']([^"']+)["'][^>]*value=["']([^"']*)["']/gi))
    fields[m[1]] = m[2];
  // Same but name before type
  for (const m of html.matchAll(/<input[^>]+name=["']([^"']+)["'][^>]*type=["']?hidden["']?[^>]*value=["']([^"']*)["']/gi))
    fields[m[1]] = m[2];
  // Hidden with value before name
  for (const m of html.matchAll(/<input[^>]+value=["']([^"']*)["'][^>]*type=["']?hidden["']?[^>]*name=["']([^"']+)["']/gi))
    fields[m[2]] = m[1];

  // Text inputs (preserve their default values)
  for (const m of html.matchAll(/<input[^>]+type=["']?text["']?[^>]*name=["']([^"']+)["'][^>]*(?:value=["']([^"']*)["'])?/gi))
    if (!(m[1] in fields)) fields[m[1]] = m[2] || "";
  for (const m of html.matchAll(/<input[^>]+name=["']([^"']+)["'][^>]*type=["']?text["']?[^>]*(?:value=["']([^"']*)["'])?/gi))
    if (!(m[1] in fields)) fields[m[1]] = m[2] || "";

  // Select fields — use the selected option, or first option if none
  for (const m of html.matchAll(/<select[^>]+name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/select>/gi)) {
    const name = m[1];
    const inner = m[2];
    const selOpt = inner.match(/<option[^>]+selected[^>]*value=["']([^"']*)["']/i)
                || inner.match(/<option[^>]+value=["']([^"']*)["']/i);
    fields[name] = selOpt ? selOpt[1] : "";
  }

  // Checked checkboxes — browsers only submit checked boxes, so replicate that
  for (const m of html.matchAll(/<input[^>]+type=["']?checkbox["']?[^>]*checked[^>]*name=["']([^"']+)["'][^>]*(?:value=["']([^"']*)["'])?/gi))
    if (!(m[1] in fields)) fields[m[1]] = m[2] || "on";
  for (const m of html.matchAll(/<input[^>]+name=["']([^"']+)["'][^>]*type=["']?checkbox["']?[^>]*checked[^>]*(?:value=["']([^"']*)["'])?/gi))
    if (!(m[1] in fields)) fields[m[1]] = m[2] || "on";
  for (const m of html.matchAll(/<input[^>]+checked[^>]*name=["']([^"']+)["'][^>]*type=["']?checkbox["']?[^>]*(?:value=["']([^"']*)["'])?/gi))
    if (!(m[1] in fields)) fields[m[1]] = m[2] || "on";

  // Also try to enable the Narrative/Remarks output column if the form has it
  // (SDR lets users select which columns appear — narrative is often opt-in)
  const narrativeCandidates = [
    "ctl00$pageContentPlaceHolder$chkNarrative",
    "ctl00$pageContentPlaceHolder$chkRemarks",
    "ctl00$pageContentPlaceHolder$cbNarrative",
    "ctl00$pageContentPlaceHolder$cbRemarks",
    "ctl00$pageContentPlaceHolder$chkDifficultyNarrative",
    "ctl00$pageContentPlaceHolder$chkDifficulty",
    "ctl00$pageContentPlaceHolder$chkDifficultyCode",
  ];
  for (const n of narrativeCandidates) if (!(n in fields)) fields[n] = "on";

  // Log checkbox fields found so we can see what output-field checkboxes exist
  const checkboxFields = Object.keys(fields).filter(k => narrativeCandidates.includes(k) || /chk|cbx|cb[A-Z]/i.test(k));
  if (checkboxFields.length) console.log(`[SDR] Checkbox fields in form: ${checkboxFields.join(", ")}`);

  // Submit buttons — include the first one we find
  const sub = html.match(/<input[^>]+type=["']?submit["']?[^>]*name=["']([^"']+)["'][^>]*value=["']([^"']*)["']/i)
           || html.match(/<input[^>]+name=["']([^"']+)["'][^>]*type=["']?submit["']?[^>]*value=["']([^"']*)["']/i);
  if (sub) fields[sub[1]] = sub[2];

  return fields;
}

/** Find date-input field names by scanning for text inputs whose name or
 *  surrounding label mentions date/from/to/start/end. */
function findDateFields(html, allFields) {
  let fromField = null, toField = null;

  // Strategy 1: field name contains date + from/to keywords
  for (const name of Object.keys(allFields)) {
    if (/date|dt/i.test(name)) {
      if (!fromField && /from|start|begin|frm|strt/i.test(name)) fromField = name;
      if (!toField   && /to$|end|thru|finish/i.test(name))       toField   = name;
    }
  }

  // Strategy 2: field name alone contains from/to/start/end
  if (!fromField || !toField) {
    for (const name of Object.keys(allFields)) {
      if (!fromField && /^(from|dateFrom|startDate|start|DateFrom|txtFrom|calFrom|TxtFrom)$/i.test(name)) fromField = name;
      if (!toField   && /^(to|dateTo|endDate|end|DateTo|txtTo|calTo|TxtTo)$/i.test(name))                toField   = name;
    }
  }

  // Strategy 3: look at label text near each input
  if (!fromField || !toField) {
    for (const m of html.matchAll(/(?:<label[^>]*>([^<]*?(?:from|start)[^<]*?)<\/label>[\s\S]{0,300}?|<th[^>]*>([^<]*?(?:from|start)[^<]*?)<\/th>[\s\S]{0,300}?)<input[^>]+name=["']([^"']+)["']/gi)) {
      if (!fromField) fromField = m[3];
    }
    for (const m of html.matchAll(/(?:<label[^>]*>([^<]*?(?:\bto\b|end)[^<]*?)<\/label>[\s\S]{0,300}?|<th[^>]*>([^<]*?(?:\bto\b|end)[^<]*?)<\/th>[\s\S]{0,300}?)<input[^>]+name=["']([^"']+)["']/gi)) {
      if (!toField) toField = m[3];
    }
  }

  console.log(`[SDR] Date fields: from="${fromField}" to="${toField}"`);
  return { fromField, toField };
}

/** Returns true if the HTML looks like the search form was returned
 *  (i.e. POST failed) rather than actual search results.
 *  NOTE: The results page often still has the search form in its sidebar,
 *  so we must not trigger on form presence alone — only on absence of results. */
function looksLikeFormPage(html) {
  // If no table with meaningful data rows exists, assume we got the form back
  const hasBigTable = /<table[^>]*>[\s\S]{800,}<\/table>/i.test(html);
  if (!hasBigTable) return true;
  // If the result length is almost identical to the form, nothing was returned
  // (caller checks this separately by size comparison)
  return false;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const fromParam = req.query?.from;
  const toParam   = req.query?.to;
  const endDate   = toParam   ? new Date(toParam)   : new Date();
  const startDate = fromParam ? new Date(fromParam)
                              : new Date(endDate.getTime() - 365*24*60*60*1000);

  console.log(`[SDR] Querying ${fmtMDY(startDate)} → ${fmtMDY(endDate)}`);

  try {
    // ── Step 1: GET the form page ──────────────────────────────────────────
    const formResp = await fetch(QUERY_URL, {
      headers: {
        "User-Agent": BROWSER_UA,
        "Accept":     "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(15000),
    });

    const setCookie = formResp.headers.get("set-cookie") || "";
    const cookies = setCookie.split(/,(?=[^;]+=[^;]+;|[^;]+=)/)
      .map(c=>c.split(";")[0].trim()).filter(c=>c.includes("=")).join("; ");

    const formHtml = await formResp.text();
    console.log(`[SDR] Form: status=${formResp.status} len=${formHtml.length} cookies=${cookies.slice(0,100)}`);

    // ── Step 2: Extract all form fields dynamically ───────────────────────
    const fields = extractFormFields(formHtml);
    const fieldNames = Object.keys(fields).filter(k=>!k.startsWith("__"));
    console.log(`[SDR] Extracted ${Object.keys(fields).length} fields. Non-hidden: ${fieldNames.slice(0,15).join(", ")}`);

    const { fromField, toField } = findDateFields(formHtml, fields);

    // Apply date values — use every plausible field name so at least one hits
    const dateFieldCandidates = {
      ...(fromField ? {[fromField]: fmtMDY(startDate)} : {}),
      ...(toField   ? {[toField]:   fmtMDY(endDate)}   : {}),
      // Brute-force common patterns as fallback
      "ctl00$ContentPlaceHolder1$txtDateFrom":  fmtMDY(startDate),
      "ctl00$ContentPlaceHolder1$txtDateTo":    fmtMDY(endDate),
      "ctl00$ContentPlaceHolder1$TxtDateFrom":  fmtMDY(startDate),
      "ctl00$ContentPlaceHolder1$TxtDateTo":    fmtMDY(endDate),
      "ctl00$ContentPlaceHolder1$txtFromDate":  fmtMDY(startDate),
      "ctl00$ContentPlaceHolder1$txtToDate":    fmtMDY(endDate),
      "ctl00$ContentPlaceHolder1$calFrom_TextBox": fmtMDY(startDate),
      "ctl00$ContentPlaceHolder1$calTo_TextBox":   fmtMDY(endDate),
    };
    Object.assign(fields, dateFieldCandidates);

    // Make sure submit button is included
    if (!Object.keys(fields).some(k=>/btn|submit|search/i.test(k))) {
      fields["ctl00$ContentPlaceHolder1$BtnQuery"] = "Search";
      fields["ctl00$ContentPlaceHolder1$btnSearch"] = "Search";
    }

    const formAction = (formHtml.match(/<form[^>]+action=["']([^"']+)["']/i)||[])[1] || "";
    const submitUrl = formAction
      ? (formAction.startsWith("http") ? formAction : `https://sdrs.faa.gov${formAction.startsWith("/")?formAction:"/"+formAction}`)
      : QUERY_URL;
    console.log(`[SDR] Posting to: ${submitUrl}`);

    // ── Step 3: POST the form ─────────────────────────────────────────────
    const postBody = new URLSearchParams(fields);
    const searchResp = await fetch(submitUrl, {
      method: "POST",
      headers: {
        "User-Agent":   BROWSER_UA,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept":       "text/html,application/xhtml+xml,*/*;q=0.8",
        "Referer":      QUERY_URL,
        "Cookie":       cookies,
        "Origin":       "https://sdrs.faa.gov",
        "Accept-Language": "en-US,en;q=0.9",
      },
      body: postBody.toString(),
      signal: AbortSignal.timeout(30000),
    });

    const resultHtml = await searchResp.text();
    console.log(`[SDR] Result: status=${searchResp.status} len=${resultHtml.length}`);

    // Log table structure for debugging
    const tables=(resultHtml.match(/<table[^>]*>[\s\S]*?<\/table>/gi)||[]).sort((a,b)=>b.length-a.length);
    console.log(`[SDR] Tables in result: ${tables.length}`);
    tables.slice(0,3).forEach((t,i)=>{
      const rows=(t.match(/<tr/gi)||[]).length;
      const heads=(t.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)||[])
        .map(h=>h.replace(/<[^>]+>/g,"").replace(/&nbsp;/g," ").trim()).slice(0,6);
      if(rows>1) console.log(`[SDR] Table ${i}: ${rows} rows, sample cells: ${heads.join("|")}`);
    });

    // Detect if POST returned the form again instead of results
    if (looksLikeFormPage(resultHtml)) {
      console.log("[SDR] POST returned form page (field names still wrong). Returning empty.");
      return res.status(200).json({
        events: [], count: 0, source: "SDR",
        error: "SDR form submission unsuccessful — field names may have changed. Check Vercel logs.",
      });
    }

    const events = parseSdrResults(resultHtml);
    console.log(`[SDR] Parsed: ${events.length} events`);

    // no-store: SDR data changes frequently and the 30-min cache was serving
    // stale responses to the browser even after the API returned fresh data.
    res.setHeader("Cache-Control","no-store");
    return res.status(200).json({ events, count:events.length, source:"SDR" });

  } catch(err) {
    console.error(`[SDR] Error: ${err.message}`);
    return res.status(200).json({ events:[], source:"SDR", error:err.message });
  }
}

// Known column-name patterns that appear in the form's field-selector table.
// Rows where the "aircraft" cell matches these are field names, not data.
const FIELD_NAME_RE = /^\^|^(Operator Designator|Aircraft Make|Engine Make|Propeller Make|Part Name|Difficulty Date|Difficulty Code|Remarks|N-Number|Model|Series|Total Time|Engine Time|Registration|Operator|ATA Code)$/i;

function parseSdrResults(html) {
  const events = [];
  const tables=(html.match(/<table[^>]*>([\s\S]*?)<\/table>/gi)||[]).sort((a,b)=>b.length-a.length);
  if(!tables[0]) return events;

  const rows=tables[0].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)||[];
  let headers=[];
  let headerFound=false;

  for(const row of rows){
    const cells=(row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)||[])
      .map(c=>c.replace(/<a[^>]*>/gi,"").replace(/<\/a>/gi,"").replace(/<[^>]+>/g,"").replace(/&nbsp;/g," ").trim());
    if(cells.length<2) continue;

    // Skip rows that look like the form's field-selector rows
    if(cells.every(c=>FIELD_NAME_RE.test(c)||c.length===0)) continue;

    if(!headerFound&&/date|make|model|reg|operator|diff|narr/i.test(cells.join(" "))){
      // Extra guard: reject this as a header if the cells look like field-name labels
      const looksDataHeader = cells.some(c=>/date/i.test(c)) && cells.some(c=>/make|reg|model/i.test(c));
      if(looksDataHeader){
        headers=cells.map(c=>c.replace(/^\^/,"")); // strip any ^ prefix from headers
        headerFound=true;
        console.log(`[SDR] Headers found: ${cells.slice(0,8).join("|")}`);
        continue;
      }
    }
    if(!headerFound||cells.length<3) continue;

    const get=(...names)=>{
      for(const n of names){
        const idx=headers.findIndex(h=>new RegExp(n,"i").test(h));
        if(idx>=0&&cells[idx]) return cells[idx];
      }
      return "";
    };

    const dateRaw=get("date","DifficultyDate","DT")||"";
    const make   =get("make","Aircraft Make","manufacturer")||cells[1]||"Unknown";
    const model  =get("model","Aircraft Model")||"";
    const reg    =get("N-Number","reg","registration","n number","tail","nnum")||"";
    const op     =get("OperatorDesignator","operator","carrier","airline","designator")||"";
    const diff   =get("JASCCode","difficulty","diff","problem","code")||"";
    const narr   =get("narrative","narr","Narrative","description","remarks","remark","Remarks")||"";
    const airport=get("airport","city","location","place")||"";

    // Skip rows that still look like column-name rows
    if(FIELD_NAME_RE.test(make)||FIELD_NAME_RE.test(narr)) continue;

    let isoDate=new Date().toISOString().slice(0,10);
    const dm=dateRaw.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
    const dm2=dateRaw.match(/(\d{4})-(\d{2})-(\d{2})/);
    if(dm2) isoDate=`${dm2[1]}-${dm2[2]}-${dm2[3]}`;
    else if(dm){const yr=dm[3].length===2?`20${dm[3]}`:dm[3];isoDate=`${yr}-${dm[1].padStart(2,"0")}-${dm[2].padStart(2,"0")}`;}

    const [lat,lon]=coordsFor(`${airport} ${op}`);
    const isCrit=/fire|smoke|struct|fracture|crack|fail/i.test(diff+narr);
    // Build a useful description even when the narrative column is absent
    const ctrlNum=get("Unique Control","control","ctrl","UCN")||"";
    const descParts=[narr,diff?`JASC: ${diff}`:"",ctrlNum?`SDR#: ${ctrlNum}`:""].filter(Boolean);
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
      description:descParts.join(" · ").slice(0,600)||"SDR difficulty report — see sdrs.faa.gov for details",
      source:"SDR", url:"https://sdrs.faa.gov/",
    });
  }
  return events;
}

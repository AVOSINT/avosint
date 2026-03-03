// api/ntsb.js — NTSB Aviation Accident Database
// Source: NTSB Public API (api.ntsb.gov)
//
// SETUP REQUIRED (free, ~5 minutes):
//   1. Go to https://developer.ntsb.gov → Sign Up
//   2. Subscribe to the "Public" product
//   3. Copy your subscription key from your Profile page
//   4. In Vercel → Project → Settings → Environment Variables, add:
//        NTSB_API_KEY = your-subscription-key
//   5. Redeploy
//
// Without NTSB_API_KEY set, this proxy returns empty gracefully.

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
  GU:[13.4,144.8],VI:[17.7,-64.8],
};

function coordsForState(abbr) {
  const k=(abbr||"").trim().toUpperCase().slice(0,2);
  return STATE_COORDS[k]||[null,null];
}
function severityFromInjuries(fatal,serious,minor) {
  if(fatal>0) return "critical";
  if(serious>0) return "high";
  if(minor>0) return "medium";
  return "low";
}
function categoryFromAircraft(make) {
  const m=(make||"").toUpperCase();
  if(/BOEING|AIRBUS|EMBRAER|BOMBARDIER|MCDONNELL/.test(m)) return "Commercial Jet";
  if(/BELL|ROBINSON|SIKORSKY|EUROCOPTER|ENSTROM|HILLER/.test(m)) return "Helicopter";
  return "Private/GA";
}

// NTSB API base — confirmed from developer.ntsb.gov portal
const NTSB_BASE = "https://api.ntsb.gov/public/api/Common/v1";

export default async function handler(req,res) {
  if(req.method!=="GET") return res.status(405).end();

  const apiKey = process.env.NTSB_API_KEY;
  if(!apiKey) {
    console.log("[NTSB] No NTSB_API_KEY set. Add it to Vercel env vars. Sign up free at developer.ntsb.gov.");
    res.setHeader("Cache-Control","max-age=300");
    return res.status(200).json({events:[],count:0,source:"NTSB",setupRequired:true});
  }

  const fromParam = req.query?.from;
  const toParam   = req.query?.to;
  const endDate   = toParam   ? new Date(toParam)   : new Date();
  const startDate = fromParam ? new Date(fromParam)
                              : new Date(endDate.getTime()-90*24*60*60*1000);

  const fmtDate = d=>`${(d.getMonth()+1).toString().padStart(2,"0")}/${d.getDate().toString().padStart(2,"0")}/${d.getFullYear()}`;
  const fromStr = fmtDate(startDate);
  const toStr   = fmtDate(endDate);

  console.log(`[NTSB] Querying ${fromStr} → ${toStr}`);

  // GetCasesByDateRange endpoint — visible in developer portal operations list
  const url = `${NTSB_BASE}/GetCasesByDateRange?startDate=${encodeURIComponent(fromStr)}&endDate=${encodeURIComponent(toStr)}`;
  console.log(`[NTSB] Fetching: ${url}`);

  try {
    const resp = await fetch(url, {
      headers: {
        "Ocp-Apim-Subscription-Key": apiKey,
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(20000),
    });

    const body = await resp.text();
    console.log(`[NTSB] Status=${resp.status} Length=${body.length}`);
    console.log(`[NTSB] Snippet: ${body.slice(0,500)}`);

    if(!resp.ok) {
      console.error(`[NTSB] API error ${resp.status}`);
      return res.status(200).json({events:[],count:0,source:"NTSB",error:`HTTP ${resp.status}`});
    }

    let data;
    try { data=JSON.parse(body); } catch(e) {
      console.error(`[NTSB] JSON parse error: ${e.message}`);
      return res.status(200).json({events:[],count:0,source:"NTSB",error:"JSON parse failed"});
    }

    // Log structure so we can adapt parser if needed
    console.log(`[NTSB] Top-level keys: ${Object.keys(data).join(", ")}`);
    const rawCases = Array.isArray(data) ? data
      : Array.isArray(data?.cases)  ? data.cases
      : Array.isArray(data?.value)  ? data.value
      : Array.isArray(data?.results)? data.results
      : Array.isArray(data?.items)  ? data.items
      : [];

    console.log(`[NTSB] ${rawCases.length} cases`);
    if(rawCases.length>0) console.log(`[NTSB] First case keys: ${Object.keys(rawCases[0]).join(", ")}`);

    const events = rawCases.map((c,i)=>{
      const get=(...names)=>{for(const n of names){const v=c[n]??c[n.toLowerCase()]??c[n.toUpperCase()];if(v!==undefined&&v!==null&&v!=="")return String(v);}return null;};
      const dateRaw  = get("EventDate","eventDate","event_date","AccidentDate","date")||"";
      const city     = get("City","city","EventCity","City")||"";
      const state    = get("State","state","EventState")||"";
      const make     = get("Make","make","AircraftMake","AcftMake")||"";
      const model    = get("Model","model","AircraftModel","AcftModel")||"";
      const reg      = get("Registration","NNumber","TailNumber","RegNo")||"";
      const operator = get("Operator","AirCarrier","Carrier","operator")||"";
      const fatal    = parseInt(get("FatalInjuryCount","Fatalities","fatal","FatalCount")||"0",10)||0;
      const serious  = parseInt(get("SeriousInjuryCount","SeriousInjuries","serious","SeriousCount")||"0",10)||0;
      const minor    = parseInt(get("MinorInjuryCount","MinorInjuries","minor","MinorCount")||"0",10)||0;
      const phase    = get("BroadPhaseOfFlight","FlightPhase","Phase","phase")||"Unknown";
      const narrative= get("ProbableCause","NarrativeFinal","Narrative","narrative","Synopsis")||"";
      const damage   = get("AircraftDamage","Damage","damage")||"";
      const ntsbNo   = get("NtsbNo","ntsbNo","AccidentNumber","EventId","CaseNumber","mkey","MKey")||`${i}`;

      let isoDate=new Date().toISOString().slice(0,10);
      const dm1=dateRaw.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
      const dm2=dateRaw.match(/(\d{4})-(\d{2})-(\d{2})/);
      if(dm2) isoDate=`${dm2[1]}-${dm2[2]}-${dm2[3]}`;
      else if(dm1){const yr=dm1[3].length===2?`20${dm1[3]}`:dm1[3];isoDate=`${yr}-${dm1[1].padStart(2,"0")}-${dm1[2].padStart(2,"0")}`;}

      const location=[city,state].filter(Boolean).join(", ")||"Not reported";
      const aircraft=[make,model].filter(Boolean).join(" ").slice(0,60)||"Unknown";
      const injuries=fatal>0?`${fatal} fatal`:serious>0?`${serious} serious`:minor>0?`${minor} minor`:"None";
      const [lat,lon]=coordsForState(state);

      return {
        id:`NTSB-${ntsbNo}`,type:"accident",
        severity:severityFromInjuries(fatal,serious,minor),
        date:isoDate,aircraft,category:categoryFromAircraft(make),
        reg:reg||null,carrier:operator||null,location,lat,lon,
        injuries,fatalities:fatal,phase,
        description:narrative
          ?`${narrative.slice(0,500)}${narrative.length>500?"…":""}`
          :`NTSB investigated accident. ${aircraft} at ${location}. ${injuries}. Damage: ${damage||"Unknown"}.`,
        source:"NTSB",
        url:`https://carol.ntsb.gov/?ntsbNo=${ntsbNo}`,
      };
    });

    console.log(`[NTSB] Returning ${events.length} events`);
    res.setHeader("Cache-Control","max-age=3600");
    return res.status(200).json({events,count:events.length,source:"NTSB"});

  } catch(err) {
    console.error(`[NTSB] Error: ${err.message}`);
    return res.status(200).json({events:[],count:0,source:"NTSB",error:err.message});
  }
}

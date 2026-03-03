// api/ntsb.js — NTSB Aviation Accident/Incident Database
// Source: NTSB Public API (api.ntsb.gov)
//
// SETUP (free, ~5 minutes):
//   1. Go to https://developer.ntsb.gov → Sign Up
//   2. Subscribe to the "Public" product
//   3. Copy your subscription key from your Profile page
//   4. In Vercel → Project → Settings → Environment Variables, add:
//        NTSB_API_KEY = your-subscription-key
//   5. Redeploy
//
// Field names confirmed from live API response via developer.ntsb.gov Try It tool.
// Endpoint: GET https://api.ntsb.gov/public/api/Common/v1/GetCasesByDateRange

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
  const k = (abbr || "").trim().toUpperCase().slice(0, 2);
  return STATE_COORDS[k] || [null, null];
}

const NTSB_BASE = "https://api.ntsb.gov/public/api/Common/v1";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const apiKey = process.env.NTSB_API_KEY;
  if (!apiKey) {
    console.log("[NTSB] No NTSB_API_KEY set. Sign up free at developer.ntsb.gov and add key to Vercel env vars.");
    res.setHeader("Cache-Control", "max-age=300");
    return res.status(200).json({ events: [], count: 0, source: "NTSB", setupRequired: true });
  }

  const endDate   = req.query?.to   ? new Date(req.query.to)   : new Date();
  const startDate = req.query?.from ? new Date(req.query.from)
                                    : new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);

  const fmt = d => `${(d.getMonth()+1).toString().padStart(2,"0")}/${d.getDate().toString().padStart(2,"0")}/${d.getFullYear()}`;
  const fromStr = fmt(startDate);
  const toStr   = fmt(endDate);

  // Endpoint and param names confirmed from developer.ntsb.gov portal screenshot
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

    if (!resp.ok) {
      console.error(`[NTSB] API error ${resp.status}: ${body.slice(0, 200)}`);
      return res.status(200).json({ events: [], count: 0, source: "NTSB", error: `HTTP ${resp.status}` });
    }

    let rawCases;
    try {
      const data = JSON.parse(body);
      rawCases = Array.isArray(data) ? data
        : Array.isArray(data?.value)   ? data.value
        : Array.isArray(data?.results) ? data.results
        : Array.isArray(data?.items)   ? data.items
        : [];
    } catch (e) {
      console.error(`[NTSB] JSON parse error: ${e.message}`);
      return res.status(200).json({ events: [], count: 0, source: "NTSB", error: "JSON parse failed" });
    }

    console.log(`[NTSB] ${rawCases.length} total cases`);
    if (rawCases.length > 0) {
      console.log(`[NTSB] Sample keys: ${Object.keys(rawCases[0]).join(", ")}`);
    }

    const events = rawCases
      // Filter to aviation only (API returns all modes: highway, marine, pipeline, etc.)
      .filter(c => (c.mode || "").toLowerCase() === "aviation")
      .map(c => {
        // All field names confirmed from live API response
        const mkey       = c.mkey               || "";
        const ntsbNo     = c.ntsbnumber         || String(mkey);
        const eventDate  = c.eventDate          || "";   // ISO: "2025-05-04"
        const city       = c.city               || "";
        const state      = c.stateOrRegion      || "";
        const country    = c.country            || "";
        const injLevel   = c.highestInjuryLevel || "None"; // "None","Minor","Serious","Fatal"
        const eventType  = c.eventType          || "ACC";  // "ACC" or "INC"
        const hazmat     = c.hazmatInvolved     || false;
        const propDmg    = c.propertyDamage     || null;
        const caseClosed = c.caseClosed         || false;

        // API provides real coordinates — use directly
        const lat = (c.latitude  != null && c.latitude  !== 0) ? c.latitude  : null;
        const lon = (c.longitude != null && c.longitude !== 0) ? c.longitude : null;

        // Fall back to state centroid only if API gave no coordinates
        const [fallLat, fallLon] = coordsForState(state);
        const finalLat = lat ?? fallLat;
        const finalLon = lon ?? fallLon;

        const severityMap = { fatal: "critical", serious: "high", minor: "medium", none: "low" };
        const severity    = severityMap[(injLevel || "none").toLowerCase()] || "low";

        const isoDate  = (eventDate || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
        const location = [city, state, country === "USA" ? null : country].filter(Boolean).join(", ") || "Not reported";

        // Aircraft make/model/reg/phase require a separate GetAviationCase call per mkey.
        // Not fetched here to avoid hundreds of extra API calls per page load.
        const description = [
          `NTSB ${eventType === "INC" ? "incident" : "accident"} investigation.`,
          `Location: ${location}.`,
          `Injury level: ${injLevel}.`,
          hazmat    ? "Hazmat involved."              : null,
          propDmg   ? `Property damage: ${propDmg}.` : null,
          caseClosed ? "Case closed." : "Investigation ongoing.",
        ].filter(Boolean).join(" ");

        return {
          id:         `NTSB-${ntsbNo}`,
          type:       eventType === "INC" ? "incident" : "accident",
          severity,
          date:       isoDate,
          aircraft:   "See NTSB report",
          category:   "Aviation",
          reg:        null,
          carrier:    null,
          location,
          lat:        finalLat,
          lon:        finalLon,
          injuries:   injLevel,
          fatalities: injLevel.toLowerCase() === "fatal" ? 1 : 0,
          phase:      "Not reported",
          description,
          source:     "NTSB",
          url:        `https://carol.ntsb.gov/?ntsbNo=${encodeURIComponent(ntsbNo)}`,
        };
      });

    console.log(`[NTSB] Returning ${events.length} aviation events`);
    res.setHeader("Cache-Control", "max-age=3600");
    return res.status(200).json({ events, count: events.length, source: "NTSB" });

  } catch (err) {
    console.error(`[NTSB] Error: ${err.message}`);
    return res.status(200).json({ events: [], count: 0, source: "NTSB", error: err.message });
  }
}

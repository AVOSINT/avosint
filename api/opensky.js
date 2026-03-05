// api/opensky.js — Live ADS-B proxy via airplanes.live
// Uses /v2/point/{lat}/{lon}/{radiusNM} endpoint (the correct API format).
// Returns data in OpenSky-compatible array format so App.jsx needs no changes.

// ── Fetch a single point+radius from airplanes.live ─────────────────────────
async function fetchPoint(lat, lon, radiusNm) {
  const url = `https://api.airplanes.live/v2/point/${lat}/${lon}/${radiusNm}`;
  console.log(`[flights] GET ${url}`);
  const resp = await fetch(url, {
    headers: { "Accept": "application/json" },
    signal: AbortSignal.timeout(18000),
  });
  if (!resp.ok) throw new Error(`airplanes.live HTTP ${resp.status}`);
  const data = await resp.json();
  return data.ac || [];
}

// ── Convert bounding-box to a center point + covering radius (NM) ───────────
function bboxCenter(lamin, lomin, lamax, lomax) {
  const lat = (lamin + lamax) / 2;
  const lon = (lomin + lomax) / 2;
  const latNm = (lamax - lamin) * 60;
  const lonNm = (lomax - lomin) * 60 * Math.cos(lat * Math.PI / 180);
  const radius = Math.ceil(Math.sqrt((latNm / 2) ** 2 + (lonNm / 2) ** 2));
  return { lat: +lat.toFixed(2), lon: +lon.toFixed(2), radius };
}

// ── Convert airplanes.live objects → OpenSky states array format ─────────────
function toStates(aircraft) {
  return aircraft
    .filter(a => a.lat != null && a.lon != null)
    .map(a => [
      a.hex || "",                                                            // [0]  icao24
      (a.flight || "").trim(),                                                // [1]  callsign
      "",                                                                     // [2]  country
      null, null,                                                             // [3,4]
      a.lon,                                                                  // [5]  longitude
      a.lat,                                                                  // [6]  latitude
      a.alt_baro === "ground" ? 0                                             // [7]  baro_alt metres
        : (typeof a.alt_baro === "number" ? a.alt_baro / 3.281 : null),
      a.alt_baro === "ground" || a.on_ground === true,                        // [8]  on_ground
      typeof a.gs === "number" ? a.gs / 1.944 : null,                        // [9]  velocity m/s
      a.track ?? null,                                                        // [10] track degrees
      typeof a.baro_rate === "number" ? a.baro_rate / 197 : null,            // [11] vrate m/s
      null, null,                                                             // [12,13]
      a.squawk || null,                                                       // [14] squawk
      null,                                                                   // [15]
      a.category || null,                                                     // [16] ICAO emitter cat
    ]);
}

// ── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const { lamin, lomin, lamax, lomax } = req.query;

    let aircraft = [];

    if (lamin != null && lomin != null && lamax != null && lomax != null) {
      // ── Regional view: one call centred on the bounding box ──────────────
      const la = parseFloat(lamin), lo = parseFloat(lomin);
      const La = parseFloat(lamax), Lo = parseFloat(lomax);
      const { lat, lon, radius } = bboxCenter(la, lo, La, Lo);

      aircraft = await fetchPoint(lat, lon, radius);

      // Clip to actual bbox (the circle may extend beyond it)
      aircraft = aircraft.filter(a =>
        a.lat >= la && a.lat <= La && a.lon >= lo && a.lon <= Lo
      );

    } else {
      // ── Global view: four strategic points covering major corridors ───────
      const GLOBAL_POINTS = [
        [42, -95, 2000],   // North America
        [52,  10, 2000],   // Europe / North Atlantic
        [35, 120, 2000],   // East Asia
        [25,  60, 1800],   // Middle East / South Asia
      ];

      const results = await Promise.allSettled(
        GLOBAL_POINTS.map(([lat, lon, r]) => fetchPoint(lat, lon, r))
      );

      // Merge and deduplicate by ICAO hex
      const seen = new Set();
      for (const r of results) {
        if (r.status === "fulfilled") {
          for (const a of r.value) {
            if (a.hex && !seen.has(a.hex)) {
              seen.add(a.hex);
              aircraft.push(a);
            }
          }
        }
      }
    }

    const states = toStates(aircraft);
    console.log(`[flights] OK — ${states.length} aircraft`);
    res.status(200).json({ states, time: Math.floor(Date.now() / 1000) });

  } catch (err) {
    console.error("[flights] Handler error:", err.message);
    res.status(502).json({ error: err.message || "Flight data unavailable" });
  }
}

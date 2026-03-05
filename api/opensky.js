// api/opensky.js — Live ADS-B proxy via airplanes.live
// No API key required. Returns data in OpenSky-compatible format.
// Replaces direct OpenSky calls which are blocked from Vercel server IPs.

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const { lamin, lomin, lamax, lomax } = req.query;

    console.log("[flights] Fetching from airplanes.live…");
    const resp = await fetch("https://api.airplanes.live/v2/", {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(20000),
    });

    if (!resp.ok) throw new Error(`airplanes.live HTTP ${resp.status}`);

    const data = await resp.json();
    let aircraft = data.ac || [];

    // Filter to bounding box if provided
    if (lamin != null && lomin != null && lamax != null && lomax != null) {
      const la = parseFloat(lamin), lo = parseFloat(lomin);
      const La = parseFloat(lamax), Lo = parseFloat(lomax);
      aircraft = aircraft.filter(a =>
        a.lat != null && a.lon != null &&
        a.lat >= la && a.lat <= La &&
        a.lon >= lo && a.lon <= Lo
      );
    }

    // Convert to OpenSky states format (array of arrays) so App.jsx needs no changes.
    // OpenSky index reference:
    //  [0] icao24  [1] callsign  [2] country  [3,4] time fields
    //  [5] lon  [6] lat  [7] baro_alt(m)  [8] on_ground
    //  [9] vel(m/s)  [10] track  [11] vrate(m/s)  [12,13] unused
    //  [14] squawk  [16] ICAO emitter category (extension, used for heli filter)
    const states = aircraft
      .filter(a => a.lat != null && a.lon != null)
      .map(a => [
        a.hex || "",                                                          // [0]  icao24
        (a.flight || "").trim(),                                              // [1]  callsign
        "",                                                                   // [2]  country
        null, null,                                                           // [3,4]
        a.lon,                                                                // [5]  longitude
        a.lat,                                                                // [6]  latitude
        a.alt_baro === "ground" ? 0                                           // [7]  baro_alt metres
          : (typeof a.alt_baro === "number" ? a.alt_baro / 3.281 : null),
        a.alt_baro === "ground" || a.on_ground === true,                      // [8]  on_ground
        typeof a.gs === "number" ? a.gs / 1.944 : null,                      // [9]  velocity m/s
        a.track ?? null,                                                      // [10] track degrees
        typeof a.baro_rate === "number" ? a.baro_rate / 197 : null,          // [11] vrate m/s
        null, null,                                                           // [12,13]
        a.squawk || null,                                                     // [14] squawk
        null,                                                                 // [15]
        a.category || null,                                                   // [16] ICAO emitter cat
      ]);

    console.log(`[flights] OK — ${states.length} aircraft`);
    res.status(200).json({ states, time: Math.floor(Date.now() / 1000) });

  } catch (err) {
    console.error("[flights] Handler error:", err.message);
    res.status(502).json({ error: err.message || "Flight data unavailable" });
  }
}

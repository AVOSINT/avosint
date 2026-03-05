// api/opensky.js — OpenSky Network proxy using HTTP Basic Auth
//
// Basic Auth sends credentials directly in the API request header — no separate
// token server is involved. This bypasses the auth.opensky-network.org endpoint
// that was previously failing from Vercel.
//
// Required Vercel environment variables:
//   OPENSKY_USERNAME  — your opensky-network.org username
//   OPENSKY_PASSWORD  — your opensky-network.org password
//
// Authenticated accounts get 4,000 API credits/day (vs 400 anonymous).
// At the 2-minute dashboard refresh rate that is ~720 calls/day — well within limit.
//
// If credentials are not set the proxy falls back to anonymous access (400/day).

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const { lamin, lomin, lamax, lomax } = req.query;

    // Build OpenSky URL — bounding box is optional
    let url = "https://opensky-network.org/api/states/all";
    if (lamin && lomin && lamax && lomax) {
      url += `?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;
    }

    // Build auth header — use Basic Auth if credentials are present
    const username = process.env.OPENSKY_USERNAME;
    const password = process.env.OPENSKY_PASSWORD;
    const headers  = { "Accept": "application/json" };

    if (username && password) {
      const encoded = Buffer.from(`${username}:${password}`).toString("base64");
      headers["Authorization"] = `Basic ${encoded}`;
      console.log(`[opensky] Fetching with Basic Auth (user: ${username})…`);
    } else {
      console.log("[opensky] No credentials set — fetching anonymously (400 credits/day).");
    }

    const resp = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(20000),
    });

    if (!resp.ok) {
      console.error(`[opensky] API returned HTTP ${resp.status}`);
      throw new Error(`OpenSky HTTP ${resp.status}`);
    }

    const data  = await resp.json();
    const count = (data.states || []).length;
    console.log(`[opensky] OK — ${count} state vectors`);

    res.status(200).json(data);

  } catch (err) {
    console.error("[opensky] Handler error:", err.message);
    res.status(502).json({ error: err.message || "OpenSky unavailable" });
  }
}

// api/opensky.js — Proxy for OpenSky Network ADS-B state vectors
// Runs server-side on Vercel to avoid CORS restrictions on direct browser requests.
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const { lamin, lomin, lamax, lomax } = req.query;

    let url = "https://opensky-network.org/api/states/all";
    if (lamin && lomin && lamax && lomax) {
      url += `?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;
    }

    const resp = await fetch(url, {
      signal: AbortSignal.timeout(18000),
    });

    if (!resp.ok) throw new Error(`OpenSky HTTP ${resp.status}`);

    const data = await resp.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({ error: err.message || "OpenSky unavailable" });
  }
}

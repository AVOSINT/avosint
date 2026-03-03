// api/opensky.js — Proxy for OpenSky Network ADS-B state vectors
// Uses OAuth2 client credentials for authenticated access (4,000 calls/day).
// Set OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET in Vercel environment variables.

const TOKEN_URL =
  "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";

let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  const clientId     = process.env.OPENSKY_CLIENT_ID;
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET;

  // Fall back to anonymous if no credentials configured
  if (!clientId || !clientSecret) return null;

  // Reuse cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < tokenExpiry - 60_000) return cachedToken;

  const params = new URLSearchParams({
    grant_type:    "client_credentials",
    client_id:     clientId,
    client_secret: clientSecret,
  });

  const resp = await fetch(TOKEN_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    params.toString(),
    signal:  AbortSignal.timeout(10000),
  });

  if (!resp.ok) throw new Error(`Token request failed: HTTP ${resp.status}`);

  const json = await resp.json();
  cachedToken = json.access_token;
  tokenExpiry = Date.now() + json.expires_in * 1000;
  return cachedToken;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const { lamin, lomin, lamax, lomax } = req.query;

    const apiBase = new URL("https://opensky-network.org/api/states/all");
    if (lamin && lomin && lamax && lomax) {
      apiBase.searchParams.set("lamin", lamin);
      apiBase.searchParams.set("lomin", lomin);
      apiBase.searchParams.set("lamax", lamax);
      apiBase.searchParams.set("lomax", lomax);
    }

    const token = await getAccessToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    const resp = await fetch(apiBase.toString(), {
      headers,
      signal: AbortSignal.timeout(18000),
    });

    if (!resp.ok) throw new Error(`OpenSky HTTP ${resp.status}`);

    const data = await resp.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({ error: err.message || "OpenSky unavailable" });
  }
}

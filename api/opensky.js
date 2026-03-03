// api/opensky.js — Proxy for OpenSky Network ADS-B state vectors
// Uses OAuth2 client credentials for authenticated access (4,000 calls/day).
// Set OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET in Vercel environment variables.

const TOKEN_URL =
  "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";

let cachedToken = null;
let tokenExpiry  = 0;

async function getAccessToken() {
  const clientId     = process.env.OPENSKY_CLIENT_ID;
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("[opensky] OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET not set — cannot authenticate.");
    throw new Error("OpenSky credentials not configured. Add OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET to Vercel environment variables.");
  }

  // Reuse cached token if still valid (with 60 s buffer)
  if (cachedToken && Date.now() < tokenExpiry - 60_000) return cachedToken;

  console.log("[opensky] Fetching new OAuth2 token…");

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

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    console.error(`[opensky] Token request failed: HTTP ${resp.status}`, body);
    throw new Error(`OpenSky token request failed: HTTP ${resp.status}`);
  }

  const json  = await resp.json();
  cachedToken = json.access_token;
  tokenExpiry = Date.now() + json.expires_in * 1000;
  console.log(`[opensky] Token obtained, expires in ${json.expires_in}s`);
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

    const resp = await fetch(apiBase.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      signal:  AbortSignal.timeout(18000),
    });

    if (!resp.ok) {
      console.error(`[opensky] States API returned HTTP ${resp.status}`);
      throw new Error(`OpenSky HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const count = (data.states || []).length;
    console.log(`[opensky] OK — ${count} state vectors returned`);
    res.status(200).json(data);

  } catch (err) {
    console.error("[opensky] Handler error:", err.message);
    res.status(502).json({ error: err.message || "OpenSky unavailable" });
  }
}

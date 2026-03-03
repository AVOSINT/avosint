// api/acars.js — Proxy for airframes.io ACARS message feed
// Requires env var: AIRFRAMES_API_KEY
// Free tier: https://airframes.io — register for a key

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const API_KEY = process.env.AIRFRAMES_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({
      error: "AIRFRAMES_API_KEY environment variable not set",
      messages: [],
    });
  }

  try {
    // Fetch recent ACARS messages — limit 100, sorted newest first
    const resp = await fetch("https://api.airframes.io/messages?limit=100", {
      headers: {
        "X-API-Key": API_KEY,
        "Accept": "application/json",
        "User-Agent": "AIRWIRE-Dashboard/1.0",
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      return res.status(resp.status).json({
        error: `airframes.io returned ${resp.status}: ${errText.slice(0, 200)}`,
        messages: [],
      });
    }

    const data = await resp.json();

    // Normalize: airframes.io returns { messages: [...] } or just [...]
    const rawMessages = Array.isArray(data) ? data : (data.messages || data.data || []);

    // Normalize each message to our schema
    const messages = rawMessages.map((m, i) => ({
      id:        m.id || `acars-${Date.now()}-${i}`,
      timestamp: m.timestamp || m.created_at || new Date().toISOString(),
      callsign:  m.flight?.callsign || m.callsign || m.tail || "UNKNOWN",
      reg:       m.flight?.tail    || m.tail      || null,
      icao:      m.flight?.icao    || m.icao24    || null,
      freq:      m.channel || m.frequency || null,
      label:     m.label   || null,          // ACARS message label (e.g. H1, 80)
      blockId:   m.block_id || null,
      text:      m.text    || m.message || "",
      station:   m.source  || m.station  || null,
      decodedType: m.decoded?.label || null,
      raw:       m,
    })).filter(m => m.text && m.text.trim().length > 0);

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ messages, fetchedAt: new Date().toISOString() });

  } catch (err) {
    console.error("ACARS handler error:", err);
    return res.status(500).json({ error: err.message, messages: [] });
  }
}

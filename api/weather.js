// api/weather.js — FAA airport delays + NOAA turbulence SIGMETs/AIRMETs
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const [faaRes, airmetRes, sigmetRes] = await Promise.all([
      fetch("https://nasstatus.faa.gov/api/airport-status-information", {
        headers: { "Accept": "application/xml" },
        signal: AbortSignal.timeout(10000),
      }).catch(() => null),
      fetch("https://aviationweather.gov/api/data/airmet?format=geojson&hazard=TURB", {
        signal: AbortSignal.timeout(10000),
      }).catch(() => null),
      fetch("https://aviationweather.gov/api/data/sigmet?format=geojson", {
        signal: AbortSignal.timeout(10000),
      }).catch(() => null),
    ]);

    // ── FAA delays ──────────────────────────────────────────────────────────
    let delays = [];
    if (faaRes && faaRes.ok) {
      const xml = await faaRes.text();
      delays = parseFAADelays(xml);
    }

    // ── NOAA AIRMETs (turbulence) ────────────────────────────────────────────
    let airmets = { type: "FeatureCollection", features: [] };
    if (airmetRes && airmetRes.ok) {
      try { airmets = await airmetRes.json(); } catch {}
    }

    // ── NOAA SIGMETs ────────────────────────────────────────────────────────
    let sigmets = { type: "FeatureCollection", features: [] };
    if (sigmetRes && sigmetRes.ok) {
      try { sigmets = await sigmetRes.json(); } catch {}
    }

    // Filter SIGMETs to turbulence-related only
    if (sigmets.features) {
      sigmets.features = sigmets.features.filter(f => {
        const h = (f.properties?.hazard || "").toUpperCase();
        return h.includes("TURB") || h.includes("MTW") || h.includes("ICE");
      });
    }

    return res.status(200).json({ delays, airmets, sigmets, ts: new Date().toISOString() });
  } catch (err) {
    return res.status(500).json({ error: err.message, delays: [], airmets: { features: [] }, sigmets: { features: [] } });
  }
}

function parseFAADelays(xml) {
  const delays = [];
  const blocks = xml.match(/<Delay_type>([\s\S]*?)<\/Delay_type>/g) || [];
  blocks.forEach(block => {
    const get = tag => {
      const m = block.match(new RegExp(`<${tag}>(.*?)<\/${tag}>`));
      return m ? m[1].trim() : "";
    };
    const airport = get("ARPT");
    if (!airport) return;
    delays.push({
      airport,
      type:   get("Type"),
      reason: get("Reason"),
      avg:    get("Avg"),
      trend:  get("Trend"),
      name:   get("Name"),
    });
  });

  // Also parse ground stops
  const gsBlocks = xml.match(/<Ground_Stop_List>([\s\S]*?)<\/Ground_Stop_List>/g) || [];
  gsBlocks.forEach(block => {
    const airports = block.match(/<Arpt>(.*?)<\/Arpt>/g) || [];
    airports.forEach(a => {
      const code = a.replace(/<\/?Arpt>/g, "").trim();
      if (code) delays.push({ airport: code, type: "Ground Stop", reason: "GROUND STOP IN EFFECT", avg: "Indefinite", trend: "", name: "Ground Stop" });
    });
  });

  return delays;
}

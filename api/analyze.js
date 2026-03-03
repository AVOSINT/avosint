// api/analyze.js — Anthropic proxy (non-streaming, reliable on Vercel serverless)
// Streaming via res.write() is buffered by Vercel's nginx layer and never reaches
// the browser. Non-streaming returns a complete JSON response once the model finishes.

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const body = { ...req.body, stream: false }; // force non-streaming

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(55000),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      console.error("Anthropic API error:", upstream.status, data);
      return res.status(upstream.status).json({
        error: data?.error?.message || "Anthropic API error",
        status: upstream.status,
      });
    }

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(data);

  } catch (err) {
    console.error("analyze handler error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}

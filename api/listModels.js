export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', ['GET']);
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is missing' });
    }

    const url = 'https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(apiKey);

    const r = await fetch(url);
    if (!r.ok) {
      const text = await r.text();
      return res.status(r.status).json({ error: 'List models failed', details: text });
    }
    const data = await r.json();
    return res.status(200).json({ models: data.models || data });
  } catch (e) {
    return res.status(500).json({ error: 'Unexpected error', details: e?.message || String(e) });
  }
}

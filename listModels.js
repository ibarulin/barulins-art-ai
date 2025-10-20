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
    const text = await r.text();  
    let json; try { json = JSON.parse(text); } catch {}  
    if (!r.ok) {  
      return res.status(r.status).json({ error: 'List models failed', details: json || text });  
    }  
    return res.status(200).json({ models: (json && json.models) ? json.models : json });  
  } catch (e) {  
    return res.status(500).json({ error: 'Unexpected error', details: e?.message || String(e) });  
  }  
}  

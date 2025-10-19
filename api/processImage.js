export default async function handler(req, res) {
  // CORS
  const origin = req.headers.origin || '';
  let allowed = false;
  try {
    const host = new URL(origin).hostname || '';
    allowed = origin === 'https://barulins.art' || /\.barulins\.art$/.test(host);
  } catch (e) {
    // если origin пустой или некорректный — не включаем CORS
  }
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const { interiorImage, artworkImage } = req.body || {};
    if (!interiorImage || !artworkImage) {
      return res.status(400).json({ error: 'Both interiorImage and artworkImage are required (Base64 strings).' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Server misconfiguration: GEMINI_API_KEY is missing.' });
    }

    const interiorBuf = b64ToBuffer(interiorImage);
    const artworkBuf = b64ToBuffer(artworkImage);

    // 1) Пытаемся получить финальную картинку от Gemini
    const geminiResult = await callGemini(interiorBuf, artworkBuf, apiKey);

    let finalBuf = geminiResult.image;
    if (!finalBuf) {
      // 2) Fallback: пока возвращаем исходный интерьер — важно убедиться, что цепочка работает
      finalBuf = interiorBuf;
    }

    const outB64 = finalBuf.toString('base64');
    return res.status(200).json({ finalImage: outB64 });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err?.message || 'Internal Server Error' });
  }
}

function stripDataUrlPrefix(b64) {
  const i = b64.indexOf('base64,');
  return i !== -1 ? b64.slice(i + 'base64,'.length) : b64;
}

function b64ToBuffer(b64) {
  return Buffer.from(stripDataUrlPrefix(b64), 'base64');
}

async function callGemini(interiorBuf, artworkBuf, apiKey) {
  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent';

  const instruction = `
Ты — профессиональный ассистент по дизайну интерьеров.
На первом изображении (интерьер) найди подходящую стену для размещения картины.
Реалистично и бесшовно впиши второе изображение (картина) в это место.
Учти перспективу, освещение и тени. Масштабируй картину естественно.
Верни итог как одно готовое изображение. Если не можешь вернуть изображение, верни маску/координаты и описание того, как встроить картину.
`;

  function toPartFromImage(buf, mime = 'image/jpeg') {
    return {
      inlineData: {
        data: buf.toString('base64'),
        mimeType: mime
      }
    };
  }

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: instruction },
          toPartFromImage(interiorBuf, 'image/jpeg'),
          toPartFromImage(artworkBuf, 'image/jpeg')
        ]
      }
    ]
  };

  const resp = await fetch(`${endpoint}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Gemini API error: ${resp.status} ${text}`);
  }

  const data = await resp.json();
  // Пытаемся извлечь изображение
  const candidates = data?.candidates || [];
  for (const c of candidates) {
    const parts = c?.content?.parts || [];
    for (const p of parts) {
      if (p?.inlineData?.data && String(p?.inlineData?.mimeType || '').startsWith('image/')) {
        return { image: Buffer.from(p.inlineData.data, 'base64') };
      }
      if (p?.text) {
        return { description: p.text };
      }
    }
  }
  return {};
}

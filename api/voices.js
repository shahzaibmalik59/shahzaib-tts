// api/voices.js
import { EdgeTTS } from '@andresaya/edge-tts';

export default async function handler(req, res) {
  // CORS + preflight
  if (req.method === 'OPTIONS') {
    setCors(res, 'GET,OPTIONS');
    return res.status(200).send('ok');
  }
  if (req.method !== 'GET') {
    setCors(res, 'GET,OPTIONS');
    return res.status(405).json({ error: 'Use GET' });
  }

  const debug = String(req.query?.debug || '').toLowerCase() === '1';

  try {
    const tts = new EdgeTTS();
    let voices;
    try {
      voices = await tts.getVoices();
    } catch (e) {
      if (debug) {
        setCors(res, 'GET,OPTIONS');
        return res.status(500).json({ step: 'getVoices', error: String(e?.message || e) });
      }
      return sendFallback(res);
    }

    if (!Array.isArray(voices) || voices.length === 0) {
      return sendFallback(res, 'empty');
    }

    const list = voices.map(v => ({
      ShortName: v.ShortName,
      Locale: v.Locale,
      Gender: v.Gender,
    }));

    setCors(res, 'GET,OPTIONS');
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json({ voices: list });
  } catch (e) {
    if (debug) {
      setCors(res, 'GET,OPTIONS');
      return res.status(500).json({ step: 'handler', error: String(e?.message || e) });
    }
    return sendFallback(res, 'unexpected');
  }
}

function setCors(res, methods) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendFallback(res, note = 'fallback') {
  setCors(res, 'GET,OPTIONS');
  const fallback = [
    { ShortName: 'en-US-AriaNeural',   Locale: 'en-US', Gender: 'Female' },
    { ShortName: 'en-US-GuyNeural',    Locale: 'en-US', Gender: 'Male'   },
    { ShortName: 'en-GB-LibbyNeural',  Locale: 'en-GB', Gender: 'Female' },
    { ShortName: 'en-IN-NeerjaNeural', Locale: 'en-IN', Gender: 'Female' },
    { ShortName: 'en-AU-NatashaNeural',Locale: 'en-AU', Gender: 'Female' },
  ];
  return res.status(200).json({ voices: fallback, note });
}

// api/tts.js
import { EdgeTTS } from '@andresaya/edge-tts';

export default async function handler(req, res) {
  // CORS + preflight
  if (req.method === 'OPTIONS') {
    setCors(res, 'POST,OPTIONS');
    return res.status(200).send('ok');
  }
  if (req.method !== 'POST') {
    setCors(res, 'POST,OPTIONS');
    return res.status(405).json({ error: 'Use POST' });
  }

  const debug = String(req.query?.debug || '').toLowerCase() === '1';

  try {
    const {
      text = '',
      voice = 'en-US-AriaNeural',
      format = 'audio-24khz-48kbitrate-mono-mp3',
    } = req.body || {};

    if (!text.trim()) {
      setCors(res, 'POST,OPTIONS');
      return res.status(400).json({ error: "Missing 'text'." });
    }

    const tts = new EdgeTTS();

    try {
      await tts.synthesize(text, voice, { format });
    } catch (e) {
      setCors(res, 'POST,OPTIONS');
      return res.status(500).json(
        debug
          ? { step: 'synthesize', error: String(e?.message || e) }
          : { error: 'synthesize failed' }
      );
    }

    let audio;
    try {
      audio = await tts.toBuffer();
    } catch (e) {
      setCors(res, 'POST,OPTIONS');
      return res.status(500).json(
        debug
          ? { step: 'toBuffer', error: String(e?.message || e) }
          : { error: 'toBuffer failed' }
      );
    }

    if (!audio?.length) {
      setCors(res, 'POST,OPTIONS');
      return res.status(500).json(
        debug ? { step: 'audio', error: 'empty audio buffer' } : { error: 'No audio returned' }
      );
    }

    const isWav = String(format).includes('pcm'); // pcm -> WAV
    setCors(res, 'POST,OPTIONS');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', `inline; filename="shahzaib-tts.${isWav ? 'wav' : 'mp3'}"`);
    res.setHeader('Content-Type', isWav ? 'audio/wav' : 'audio/mpeg');

    return res.status(200).send(Buffer.from(audio));
  } catch (e) {
    setCors(res, 'POST,OPTIONS');
    return res.status(500).json(
      debug ? { step: 'handler', error: String(e?.message || e) } : { error: 'handler exception' }
    );
  }
}

function setCors(res, methods) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

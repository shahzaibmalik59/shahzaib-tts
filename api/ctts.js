// api/ctts.cjs  (Vercel backend)
const { synthesize } = require("@andresaya/edge-tts");

module.exports = async function handler(req, res) {
  // ✅ Always set CORS so OPTIONS never crashes
  setCors(res);

  // ✅ Preflight (browser sends this)
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  try {
    const {
      text = "",
      voice = "en-US-AriaNeural",
      format = "audio-24khz-48kbitrate-mono-mp3"
    } = req.body || {};

    if (!text.trim()) {
      return res.status(400).json({ error: "Missing text" });
    }

    // ✅ Correct edge-tts usage
    const result = await synthesize({ text, voice, format });
    const audio = result?.audio;

    if (!audio || audio.length === 0) {
      return res.status(500).json({ error: "Empty audio from TTS" });
    }

    const isWav = String(format).includes("pcm");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", isWav ? "audio/wav" : "audio/mpeg");

    return res.status(200).send(Buffer.from(audio));
  } catch (e) {
    console.error("ctts error:", e);
    return res.status(500).json({
      error: "TTS failed",
      detail: e?.message || String(e)
    });
  }
};

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

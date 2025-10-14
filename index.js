// index.js
import { EdgeTTS } from "@andresaya/edge-tts";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Config (env overrides)
const TEXT   = process.env.TTS_TEXT   || "Welcome to Shahzaib Text to Voice Expert!";
const VOICE  = process.env.TTS_VOICE  || "en-US-AriaNeural";
const FORMAT = process.env.TTS_FORMAT || "audio-24khz-48kbitrate-mono-mp3";
const OUT    = process.env.TTS_OUT    || "voice.mp3";

async function main() {
  const tts = new EdgeTTS();

  // Optional: list a few voices
  if (process.env.LIST_VOICES === "1") {
    const voices = await tts.getVoices();
    console.log(`Voices found: ${voices.length}`);
    for (const v of voices.slice(0, 5)) {
      console.log(`${v.ShortName} — ${v.Locale} — ${v.Gender}`);
    }
  }

  // 1) Build audio internally
  await tts.synthesize(TEXT, VOICE, { format: FORMAT }); // no return buffer

  // 2) Export to file (library handles writing)
  const outPath = path.resolve(__dirname, OUT);
  const saved = await tts.toFile(outPath);               // returns saved path
  console.log(`✅ Saved: ${saved}\n   Voice: ${VOICE}\n   Format: ${FORMAT}`);
}

main().catch(err => {
  console.error("❌ TTS failed:", err?.message || err);
  process.exit(1);
});

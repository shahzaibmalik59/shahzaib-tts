// netlify/functions/tts.js
import { EdgeTTS } from "@andresaya/edge-tts";
import { tmpdir } from "os";
import { join } from "path";
import { readFileSync, rmSync } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileP = promisify(execFile);

/**
 * POST /api/tts
 * Body:
 * {
 *   text: "Hello",
 *   voice: "en-US-AriaNeural",
 *   format: "audio-24khz-48kbitrate-mono-mp3" | "riff-24khz-16bit-mono-pcm",
 *   rate: "-5%",
 *   pitch: "+1st",
 *   volume: "+0dB",
 *   breakMs: 150,
 *   style: "cheerful",
 *   role: "YoungAdultFemale",
 *   sentenceSilenceMs: 120
 * }
 */
export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors(), body: "ok" };
  }
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Use POST" });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const {
      text,
      voice = "en-US-AriaNeural",
      format = "audio-24khz-48kbitrate-mono-mp3",
      rate,
      pitch,
      volume,
      breakMs = 0,
      style,
      role,
      sentenceSilenceMs = 0
    } = body;

    if (!text || !String(text).trim()) {
      return json(400, { error: "Missing 'text'." });
    }

    // --- 1) Try SSML path first
    try {
      const ssml = buildSSML({
        text,
        voice,
        rate: sanitizeRate(rate),
        pitch: sanitizePitch(pitch),
        volume: sanitizeVolume(volume),
        breakMs,
        style,
        role,
        sentenceSilenceMs
      });

      const tts = new EdgeTTS();
      await tts.synthesize(ssml, voice, { format, inputType: "ssml" });
      const audio = await tts.toBuffer();
      if (audio && audio.length) {
        return okAudio(audio, format);
      }
      console.warn("No audio after SSML synth, trying plain text…");
    } catch (e) {
      console.warn("SSML synth failed, trying plain text…", e?.message || e);
    }

    // --- 2) Plain text fallback
    try {
      const tts = new EdgeTTS();
      await tts.synthesize(text, voice, { format });
      const audio = await tts.toBuffer();
      if (audio && audio.length) {
        return okAudio(audio, format);
      }
      console.warn("No audio after plain text synth, trying CLI fallback…");
    } catch (e) {
      console.warn("Plain text synth threw, trying CLI fallback…", e?.message || e);
    }

    // --- 3) Last-resort CLI fallback (works locally with Netlify dev)
    try {
      const isWav = String(format).includes("pcm");
      const tmpOut = join(tmpdir(), `shahzaib-tts-${Date.now()}`);
      // Build CLI args. We keep it simple: let the CLI append extension based on format.
      const args = [
        "@andresaya/edge-tts",
        "synthesize",
        "-t",
        text,
        "--voice",
        voice,
        "--format",
        isWav ? "wav" : "mp3",
        "-o",
        tmpOut
      ];
      // Use npx to run the package CLI that is already installed in node_modules
      await execFileP(process.platform === "win32" ? "npx.cmd" : "npx", args, { shell: false });
      const filePath = `${tmpOut}.${isWav ? "wav" : "mp3"}`;
      const audio = readFileSync(filePath);
      // Clean up best-effort
      try { rmSync(filePath, { force: true }); } catch {}
      return okAudio(audio, format);
    } catch (cliErr) {
      console.error("CLI fallback failed:", cliErr?.message || cliErr);
      return json(500, { error: "TTS failed in all paths." });
    }
  } catch (err) {
    console.error("❌ TTS API error:", err);
    return json(500, { error: err?.message || "TTS failed" });
  }
}

/* ---------------- helpers ---------------- */

function okAudio(audioBuffer, format) {
  const isWav = String(format).includes("pcm");
  return {
    statusCode: 200,
    headers: {
      ...cors(),
      "Content-Type": isWav ? "audio/wav" : "audio/mpeg",
      "Content-Disposition": `inline; filename="shahzaib-tts.${isWav ? "wav" : "mp3"}"`,
      "Cache-Control": "no-store"
    },
    body: Buffer.from(audioBuffer).toString("base64"),
    isBase64Encoded: true
  };
}

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
function json(status, data) {
  return {
    statusCode: status,
    headers: { ...cors(), "Content-Type": "application/json" },
    body: JSON.stringify(data)
  };
}

// --- sanitizers to avoid malformed SSML ---
function sanitizeRate(v) {
  if (!v && v !== 0) return undefined;
  const m = String(v).match(/^-?\+?\d{1,3}%$/);
  if (!m) return undefined;
  const n = Math.max(-50, Math.min(50, parseInt(String(v), 10)));
  return `${n}%`;
}
function sanitizePitch(v) {
  if (!v && v !== 0) return undefined;
  const s = String(v);
  const st = s.match(/^(-|\+)?\d{1,2}st$/);
  const pc = s.match(/^(-|\+)?\d{1,3}%$/);
  if (st) {
    const n = Math.max(-12, Math.min(12, parseInt(s, 10)));
    return `${n}st`;
  }
  if (pc) {
    const n = Math.max(-50, Math.min(50, parseInt(s, 10)));
    return `${n}%`;
  }
  return undefined;
}
function sanitizeVolume(v) {
  if (!v && v !== 0) return undefined;
  const m = String(v).match(/^(-|\+)?\d{1,2}dB$/i);
  if (!m) return undefined;
  const n = Math.max(-20, Math.min(20, parseInt(String(v), 10)));
  return `${n}dB`;
}

function buildSSML({ text, voice, rate, pitch, volume, breakMs = 0, style, role, sentenceSilenceMs = 0 }) {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  let content = esc(text);
  if (sentenceSilenceMs > 0) {
    const parts = content.split(/([.!?]+)\s+/);
    let rebuilt = "";
    for (let i = 0; i < parts.length; i += 2) {
      const seg = parts[i] || "";
      const punct = parts[i + 1] || "";
      if (!seg.trim() && !punct) continue;
      rebuilt += seg + punct + `<break time="${sentenceSilenceMs}ms"/>`;
    }
    content = rebuilt || content;
  }

  const p = [];
  if (rate)   p.push(`rate="${rate}"`);
  if (pitch)  p.push(`pitch="${pitch}"`);
  if (volume) p.push(`volume="${volume}"`);
  const prosodyOpen = `<prosody${p.length ? " " + p.join(" ") : ""}>`;
  const initialBreak = breakMs > 0 ? `<break time="${breakMs}ms"/>` : "";
  const styleOpen = style ? `<mstts:express-as style="${esc(style)}"${role ? ` role="${esc(role)}"` : ""}>` : "";
  const styleClose = style ? `</mstts:express-as>` : "";

  return `<?xml version="1.0" encoding="utf-8"?>
<speak version="1.0" xml:lang="en-US"
       xmlns="http://www.w3.org/2001/10/synthesis"
       xmlns:mstts="https://www.w3.org/2001/mstts">
  <voice name="${esc(voice)}">
    ${styleOpen}
      ${prosodyOpen}
        ${initialBreak}
        ${content}
      </prosody>
    ${styleClose}
  </voice>
</speak>`;
}

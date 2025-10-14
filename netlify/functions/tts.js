// netlify/functions/tts.js
export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: cors(), body: "ok" };
  if (event.httpMethod !== "POST")    return json(405, { error: "Use POST" });

  const debug = String((event.queryStringParameters || {}).debug || "").toLowerCase() === "1";

  try {
    const body = JSON.parse(event.body || "{}");
    const {
      text,
      voice  = "en-US-AriaNeural",
      format = "audio-24khz-48kbitrate-mono-mp3",
      rate, pitch, volume,
      breakMs = 0, style, role, sentenceSilenceMs = 0
    } = body;

    if (!text || !String(text).trim()) return json(400, { error: "Missing 'text'." });

    // dynamic import (bundler-friendly)
    let EdgeTTS;
    try { ({ EdgeTTS } = await import("@andresaya/edge-tts")); }
    catch (e) { return json(500, { error: "edge-tts import failed", detail: e?.message || String(e) }); }

    const isWav = String(format).includes("pcm");

    // 1) Try **plain text** first (very reliable in serverless)
    const tts = new EdgeTTS();
    try {
      await tts.synthesize(text, voice, { format });
      const buf = await tts.toBuffer();
      if (buf && buf.length) return ok(buf, isWav);
    } catch (e) {
      // continue to SSML attempt
      if (debug) console.warn("plain text synth failed:", e?.message || e);
    }

    // 2) If filters were provided, try **SSML** (optional)
    if (rate || pitch || volume || style || breakMs || sentenceSilenceMs) {
      const ssml = buildSSML({
        text, voice,
        rate: sanitizeRate(rate),
        pitch: sanitizePitch(pitch),
        volume: sanitizeVolume(volume),
        breakMs, style, role, sentenceSilenceMs
      });

      const tts2 = new EdgeTTS();
      try {
        await tts2.synthesize(ssml, voice, { format, inputType: "ssml" });
        const buf2 = await tts2.toBuffer();
        if (buf2 && buf2.length) return ok(buf2, isWav);
      } catch (e) {
        if (debug) return json(500, { error: "SSML synth failed", detail: e?.message || String(e) });
      }
    }

    return json(500, { error: "TTS failed in Netlify runtime" });
  } catch (e) {
    return json(500, { error: e?.message || "TTS failed" });
  }
}

/* helpers */
function ok(buf, isWav){
  return {
    statusCode: 200,
    headers: {
      ...cors(),
      "Content-Type": isWav ? "audio/wav" : "audio/mpeg",
      "Content-Disposition": `inline; filename="shahzaib-tts.${isWav ? "wav" : "mp3"}"`,
      "Cache-Control": "no-store"
    },
    body: Buffer.from(buf).toString("base64"),
    isBase64Encoded: true
  };
}
function cors(){return{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type"}}
function json(status,data){return{statusCode:status,headers:{...cors(),"Content-Type":"application/json"},body:JSON.stringify(data)}}

function sanitizeRate(v){ if(v==null||v==="")return; const m=String(v).match(/^-?\+?\d{1,3}%$/); if(!m)return; const n=Math.max(-50,Math.min(50,parseInt(String(v),10))); return `${n}%`; }
function sanitizePitch(v){ if(v==null||v==="")return; const s=String(v); const st=s.match(/^(-|\+)?\d{1,2}st$/); const pc=s.match(/^(-|\+)?\d{1,3}%$/); if(st){const n=Math.max(-12,Math.min(12,parseInt(s,10)));return `${n}st`;} if(pc){const n=Math.max(-50,Math.min(50,parseInt(s,10)));return `${n}%`;} }
function sanitizeVolume(v){ if(v==null||v==="")return; const m=String(v).match(/^(-|\+)?\d{1,2}dB$/i); if(!m)return; const n=Math.max(-20,Math.min(20,parseInt(String(v),10))); return `${n}dB`; }

function buildSSML({ text, voice, rate, pitch, volume, breakMs=0, style, role, sentenceSilenceMs=0 }) {
  const esc = (s)=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  let content = esc(text);
  if (sentenceSilenceMs > 0) {
    const parts = content.split(/([.!?]+)\s+/); let rebuilt = "";
    for (let i=0;i<parts.length;i+=2){ const seg=parts[i]||""; const p=parts[i+1]||""; if(!seg.trim()&&!p)continue; rebuilt += seg + p + `<break time="${sentenceSilenceMs}ms"/>`; }
    content = rebuilt || content;
  }
  const p=[]; if(rate)p.push(`rate="${rate}"`); if(pitch)p.push(`pitch="${pitch}"`); if(volume)p.push(`volume="${volume}"`);
  const prosOpen = `<prosody${p.length ? " " + p.join(" ") : ""}>`;
  const initBreak = breakMs>0 ? `<break time="${breakMs}ms"/>` : "";
  const styleOpen = style ? `<mstts:express-as style="${esc(style)}"${role?` role="${esc(role)}"`:""}>` : "";
  const styleClose = style ? `</mstts:express-as>` : "";
  return `<?xml version="1.0" encoding="utf-8"?>
<speak version="1.0" xml:lang="en-US" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts">
  <voice name="${esc(voice)}">
    ${styleOpen}
      ${prosOpen}
        ${initBreak}
        ${content}
      </prosody>
    ${styleClose}
  </voice>
</speak>`;
}

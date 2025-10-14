// netlify/functions/tts.js
export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors(), body: "ok" };
  }
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Use POST" });
  }

  const debug = String((event.queryStringParameters || {}).debug || "").toLowerCase() === "1";

  try {
    const body = JSON.parse(event.body || "{}");
    const text   = (body.text ?? "").toString().trim();
    const voice  = body.voice  || "en-US-AriaNeural";
    const format = body.format || "audio-24khz-48kbitrate-mono-mp3";
    if (!text) return json(400, { error: "Missing 'text'." });

    // Step A: import
    let EdgeTTS;
    try {
      ({ EdgeTTS } = await import("@andresaya/edge-tts"));
    } catch (e) {
      return debug
        ? json(500, { step: "import", error: "edge-tts import failed", detail: e?.message || String(e) })
        : json(500, { error: "edge-tts import failed" });
    }

    // Step B: synthesize (plain text)
    const tts = new EdgeTTS();
    try {
      await tts.synthesize(text, voice, { format });
    } catch (e) {
      return debug
        ? json(500, { step: "synthesize", error: "synthesize failed", detail: e?.message || String(e) })
        : json(500, { error: "synthesize failed" });
    }

    // Step C: toBuffer
    let audio;
    try {
      audio = await tts.toBuffer();
    } catch (e) {
      return debug
        ? json(500, { step: "toBuffer", error: "toBuffer failed", detail: e?.message || String(e) })
        : json(500, { error: "toBuffer failed" });
    }

    if (!audio || !audio.length) {
      return debug
        ? json(500, { step: "toBuffer", error: "empty audio buffer" })
        : json(500, { error: "No audio returned" });
    }

    const isWav = String(format).includes("pcm");
    return {
      statusCode: 200,
      headers: {
        ...cors(),
        "Content-Type": isWav ? "audio/wav" : "audio/mpeg",
        "Cache-Control": "no-store",
        "Content-Disposition": `inline; filename="shahzaib-tts.${isWav ? "wav" : "mp3"}"`
      },
      body: Buffer.from(audio).toString("base64"),
      isBase64Encoded: true
    };
  } catch (e) {
    return debug
      ? json(500, { step: "handler", error: "exception", detail: e?.message || String(e) })
      : json(500, { error: "handler exception" });
  }
}

function cors(){return{
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Access-Control-Allow-Headers":"Content-Type"
};}
function json(status, data){
  return { statusCode: status, headers: { ...cors(), "Content-Type":"application/json" }, body: JSON.stringify(data) };
}

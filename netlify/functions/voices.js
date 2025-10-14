// netlify/functions/voices.js

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors(), body: "ok" };
  }
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Use GET" });
  }

  try {
    // Lazy import inside the function (more reliable with some bundlers)
    let EdgeTTS;
    try {
      ({ EdgeTTS } = await import("@andresaya/edge-tts"));
    } catch (impErr) {
      console.warn("voices: failed to import edge-tts, using fallback:", impErr?.message || impErr);
      return json(200, { voices: fallbackVoices(), note: "fallback-import" });
    }

    const tts = new EdgeTTS();

    let all = [];
    try {
      all = await tts.getVoices();
    } catch (gvErr) {
      console.warn("voices: getVoices() failed, using fallback:", gvErr?.message || gvErr);
      return json(200, { voices: fallbackVoices(), note: "fallback-getVoices" });
    }

    if (!Array.isArray(all) || all.length === 0) {
      console.warn("voices: empty list from getVoices(), using fallback");
      return json(200, { voices: fallbackVoices(), note: "fallback-empty" });
    }

    const voices = all.map(v => ({
      ShortName: v.ShortName,
      Locale: v.Locale,
      Gender: v.Gender
    }));

    return json(200, { voices });
  } catch (err) {
    console.error("voices: unexpected error:", err);
    // Still return valid JSON + fallback
    return json(200, { voices: fallbackVoices(), note: "fallback-unexpected" });
  }
}

/* ---------- helpers ---------- */
function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
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
function fallbackVoices() {
  // A small, reliable set
  return [
    { ShortName: "en-US-AriaNeural",  Locale: "en-US", Gender: "Female" },
    { ShortName: "en-US-GuyNeural",   Locale: "en-US", Gender: "Male" },
    { ShortName: "en-GB-LibbyNeural", Locale: "en-GB", Gender: "Female" },
    { ShortName: "en-IN-NeerjaNeural",Locale: "en-IN", Gender: "Female" },
    { ShortName: "en-AU-NatashaNeural",Locale:"en-AU", Gender:"Female" }
  ];
}

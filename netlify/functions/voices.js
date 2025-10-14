// netlify/functions/voices.js
export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: cors(), body: "ok" };
  if (event.httpMethod !== "GET")     return json(405, { error: "Use GET" });

  try {
    // dynamic import is safer in some serverless bundlers
    let EdgeTTS;
    try { ({ EdgeTTS } = await import("@andresaya/edge-tts")); }
    catch (e) {
      console.warn("import edge-tts failed:", e?.message || e);
      return json(200, { voices: fallback(), note: "fallback-import" });
    }

    const tts = new EdgeTTS();
    let all = [];
    try { all = await tts.getVoices(); }
    catch (e) {
      console.warn("getVoices failed:", e?.message || e);
      return json(200, { voices: fallback(), note: "fallback-getVoices" });
    }

    if (!Array.isArray(all) || all.length === 0) {
      return json(200, { voices: fallback(), note: "fallback-empty" });
    }

    const voices = all.map(v => ({ ShortName: v.ShortName, Locale: v.Locale, Gender: v.Gender }));
    return json(200, { voices });
  } catch (e) {
    console.error("voices unexpected:", e);
    return json(200, { voices: fallback(), note: "fallback-unexpected" });
  }
}
function fallback(){ return [
  { ShortName:"en-US-AriaNeural",  Locale:"en-US", Gender:"Female" },
  { ShortName:"en-US-GuyNeural",   Locale:"en-US", Gender:"Male"   },
  { ShortName:"en-GB-LibbyNeural", Locale:"en-GB", Gender:"Female" },
  { ShortName:"en-IN-NeerjaNeural",Locale:"en-IN", Gender:"Female" },
  { ShortName:"en-AU-NatashaNeural",Locale:"en-AU", Gender:"Female"}
];}
function cors(){return{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,OPTIONS","Access-Control-Allow-Headers":"Content-Type"}}
function json(status,data){return{statusCode:status,headers:{...cors(),"Content-Type":"application/json"},body:JSON.stringify(data)}}

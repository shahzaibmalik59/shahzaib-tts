import { EdgeTTS } from "@andresaya/edge-tts";

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors(), body: "ok" };
  }
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Use GET" });
  }
  try {
    const tts = new EdgeTTS();
    const all = await tts.getVoices();
    const voices = all.map(v => ({
      ShortName: v.ShortName,
      Locale: v.Locale,
      Gender: v.Gender
    }));
    return json(200, { voices });
  } catch (err) {
    console.error("voices error:", err);
    return json(500, { error: err?.message || "failed to load voices" });
  }
}

function cors(){return{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,OPTIONS","Access-Control-Allow-Headers":"Content-Type"}}
function json(status,data){return{statusCode:status,headers:{...cors(),"Content-Type":"application/json"},body:JSON.stringify(data)}}

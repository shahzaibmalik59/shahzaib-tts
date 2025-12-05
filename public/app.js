// ===== CONFIG =====
// Use Netlify -> Vercel proxy (recommended): keep empty
let API_BASE = 'https://shahzaib-tts-api.vercel.app'; // '' => same-origin; Netlify proxy will forward /api/* to Vercel

// OR call Vercel directly (skip proxy):
// API_BASE = '';

// localStorage keys and TTL
const LS_KEY = 'shahzaib-tts-settings-v2';

// ---- Cache busting for voices (GLOBAL REFRESH SWITCH) ----
const VOICE_CACHE_VERSION = 'v2'; // bump to v3, v4... to force-refresh for ALL users
const VOICE_CACHE_KEY = `shahzaib-tts-voices:${VOICE_CACHE_VERSION}`;
const VOICE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// remove all older voice caches on boot
(function migrateVoiceCache() {
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('shahzaib-tts-voices:') && k !== VOICE_CACHE_KEY) {
        localStorage.removeItem(k);
      }
    }
  } catch {}
})();

const MAX_CHARS = 100000;

// long mode chunking
const CHUNK_LEN = 300;
const SUBCHUNK_LEN = 120;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 600;

// ===== small helpers =====
function url(path) {
  if (!API_BASE) return path; // relative (proxy)
  return API_BASE.startsWith('http') ? `${API_BASE}${path}` : `https://${API_BASE}${path}`;
}

// global debug hooks
console.log('[boot] app.js loaded');
window.addEventListener('error', e => console.error('[window.onerror]', e.message));
window.addEventListener('unhandledrejection', e => console.error('[unhandledrejection]', e.reason));

// ===== ELEMENTS =====
const els = {
  text: document.getElementById("text"),
  charInfo: document.getElementById("charInfo"),
  lang: document.getElementById("lang"),
  country: document.getElementById("country"),
  gender: document.getElementById("gender"),
  voice: document.getElementById("voice"),
  voiceCount: document.getElementById("voiceCount"),
  format: document.getElementById("format"),
  rate: document.getElementById("rate"),
  rateVal: document.getElementById("rateVal"),
  pitch: document.getElementById("pitch"),
  pitchVal: document.getElementById("pitchVal"),
  volume: document.getElementById("volume"),
  volumeVal: document.getElementById("volumeVal"),
  breakMs: document.getElementById("breakMs"),
  sentenceSilenceMs: document.getElementById("sentenceSilenceMs"),
  style: document.getElementById("style"),
  role: document.getElementById("role"),
  longMode: document.getElementById("longMode"),
  speak: document.getElementById("speak"),
  player: document.getElementById("player"),
  status: document.getElementById("status"),
  download: document.getElementById("download"),
  progressWrap: document.getElementById("progressWrap"),
  progress: document.getElementById("progress"),
  progressText: document.getElementById("progressText"),
  progressLabel: document.getElementById("progressLabel"),
};

// ===== UI HELPERS =====
const fmt = {
  rate:  v => `${Number(v) >= 0 ? "+" : ""}${v}%`,
  pitch: v => `${Number(v) >= 0 ? "+" : ""}${v}st`,
  volume:v => `${Number(v) >= 0 ? "+" : ""}${v}dB`,
};
function setLive(){
  els.rateVal.textContent   = fmt.rate(els.rate.value);
  els.pitchVal.textContent  = fmt.pitch(els.pitch.value);
  els.volumeVal.textContent = fmt.volume(els.volume.value);
}
["input","change"].forEach(ev => {
  els.rate.addEventListener(ev, setLive);
  els.pitch.addEventListener(ev, setLive);
  els.volume.addEventListener(ev, setLive);
});
setLive();

function updateCharInfo(){
  let t = els.text.value;
  if (t.length > MAX_CHARS) {
    els.text.value = t.slice(0, MAX_CHARS);
    t = els.text.value;
  }
  els.charInfo.textContent = `${t.length.toLocaleString()} / ${MAX_CHARS.toLocaleString()}`;
}
els.text.addEventListener("input", ()=>{ updateCharInfo(); persistSettings(); });

// ===== PERSIST =====
function persistSettings(){
  const data = {
    text: els.text.value,
    lang: els.lang.value,
    country: els.country.value,
    gender: els.gender.value,
    voice: els.voice.value,
    format: els.format.value,
    rate: els.rate.value,
    pitch: els.pitch.value,
    volume: els.volume.value,
    breakMs: els.breakMs.value,
    sentenceSilenceMs: els.sentenceSilenceMs.value,
    style: els.style.value,
    role: els.role.value,
    longMode: els.longMode.checked,
  };
  localStorage.setItem(LS_KEY, JSON.stringify(data));
}
function readSettings(){
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
}
const saved = readSettings();
["lang","country","gender","voice","format","rate","pitch","volume",
 "breakMs","sentenceSilenceMs","style","role","longMode"]
 .forEach(id=>{
   els[id].addEventListener("change", persistSettings);
   els[id].addEventListener("input", persistSettings);
 });

// ===== LANGUAGE/REGION NAMES =====
const _langDN = new Intl.DisplayNames(['en'], { type: 'language' });
const _regDN  = new Intl.DisplayNames(['en'], { type: 'region' });
const safeLang = code => { try{const n=_langDN.of(code); return n?`${n} (${code})`:code;}catch{return code;} };
const safeReg  = code => { try{const n=_regDN.of(code);  return n?`${n} (${code})`:code;}catch{return code;} };

// ===== VOICES =====
const allVoices = { list: [] };
const parts = (loc) => { const [l,r=""]=(loc||"").split('-'); return { lang:l, region:r }; };

function cacheVoices(voices){
  localStorage.setItem(VOICE_CACHE_KEY, JSON.stringify({ at: Date.now(), voices }));
}
function readCachedVoices(){
  try{
    const x = JSON.parse(localStorage.getItem(VOICE_CACHE_KEY) || "{}");
    if (x.at && Date.now()-x.at < VOICE_CACHE_TTL_MS) return x.voices || null;
  }catch{}
  return null;
}

async function loadVoices(){
  const cached = readCachedVoices();
  if (cached){ allVoices.list = cached; buildFiltersAndVoices(); return; }
  try{
    const endpoint = url(`/api/voices?v=${VOICE_CACHE_VERSION}`); // version bump avoids intermediary caches
    console.log('[voices] fetching:', endpoint);
    const r = await fetch(endpoint, { mode: 'cors' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const { voices = [] } = await r.json();
    allVoices.list = voices;
    cacheVoices(voices);
    buildFiltersAndVoices();
  }catch(err){
    console.error('[voices] failed, using fallback:', err);
    allVoices.list = [
      { ShortName:"en-US-AriaNeural", Locale:"en-US", Gender:"Female" },
      { ShortName:"en-US-GuyNeural",  Locale:"en-US", Gender:"Male"   }
    ];
    buildFiltersAndVoices();
  }
}

// Manual refresh button (optional to wire in your UI)
async function refreshVoicesNow() {
  try {
    localStorage.removeItem(VOICE_CACHE_KEY);
    await loadVoices();
  } catch (e) {
    console.error('Refresh voices failed:', e);
  }
}

function buildFiltersAndVoices(){
  const langMap = new Map(), regMap = new Map();
  allVoices.list.forEach(v=>{
    const {lang,region} = parts(v.Locale);
    if (lang && !langMap.has(lang)) langMap.set(lang, safeLang(lang));
    if (region && !regMap.has(region)) regMap.set(region, safeReg(region));
  });

  els.lang.innerHTML = `<option value="">Any</option>` +
    [...langMap.entries()].sort((a,b)=>a[1].localeCompare(b[1]))
      .map(([c,l])=>`<option value="${c}">${l}</option>`).join("");

  els.country.innerHTML = `<option value="">Any</option>` +
    [...regMap.entries()].sort((a,b)=>a[1].localeCompare(b[1]))
      .map(([c,l])=>`<option value="${c}">${l}</option>`).join("");

  // restore saved filters first
  if (saved.lang) els.lang.value = saved.lang;
  if (saved.country) els.country.value = saved.country;
  if (saved.gender) els.gender.value = saved.gender;
  if (saved.format) els.format.value = saved.format;
  if (saved.longMode) els.longMode.checked = true;
  handleLongModeToggle();

  applyFilters();

  // restore fields
  if (saved.text) els.text.value = saved.text;
  if (saved.voice && [...els.voice.options].some(o=>o.value===saved.voice)) els.voice.value = saved.voice;
  if (saved.rate) els.rate.value = saved.rate;
  if (saved.pitch) els.pitch.value = saved.pitch;
  if (saved.volume) els.volume.value = saved.volume;
  if (saved.breakMs) els.breakMs.value = saved.breakMs;
  if (saved.sentenceSilenceMs) els.sentenceSilenceMs.value = saved.sentenceSilenceMs;
  if (saved.style) els.style.value = saved.style;
  if (saved.role) els.role.value = saved.role;

  setLive(); updateCharInfo();
}
function applyFilters(){
  const fl = { lang:els.lang.value, region:els.country.value, gender:els.gender.value };
  const filtered = allVoices.list.filter(v=>{
    const {lang,region} = parts(v.Locale);
    if (fl.lang && fl.lang!==lang) return false;
    if (fl.region && fl.region!==region) return false;
    if (fl.gender && fl.gender!==v.Gender) return false;
    return true;
  });

  els.voice.innerHTML = filtered
    .sort((a,b)=>a.Locale.localeCompare(b.Locale) || a.ShortName.localeCompare(b.ShortName))
    .map(v=>{
      const {lang,region}=parts(v.Locale);
      const ln=safeLang(lang).replace(` (${lang})`,'');
      const rn=region?safeReg(region).replace(` (${region})`,''):'';
      const loc = rn?`${ln}, ${rn}`:ln;
      return `<option value="${v.ShortName}">${v.ShortName} — ${loc} — ${v.Gender}</option>`;
    }).join("");

  els.voiceCount.textContent = `Loaded ${filtered.length} / ${allVoices.list.length} voices.`;
  persistSettings();
}
["change"].forEach(ev=>{
  els.lang.addEventListener(ev, applyFilters);
  els.country.addEventListener(ev, applyFilters);
  els.gender.addEventListener(ev, applyFilters);
});

// ===== PROGRESS =====
function showProgress(label, pct){
  els.progressLabel.textContent = label || 'Generating…';
  els.progressWrap.classList.remove("hidden");
  if (typeof pct==='number'){
    const v = Math.max(0, Math.min(100, Math.round(pct)));
    els.progress.value = v;
    els.progressText.textContent = `${v}%`;
  }
}
function hideProgress(){
  els.progressWrap.classList.add("hidden");
  els.progress.value = 0;
  els.progressText.textContent = "0%";
}

// ===== LONG MODE: force MP3 & always chunk =====
function handleLongModeToggle(){
  if (els.longMode.checked){
    els.format.value = 'audio-24khz-48kbitrate-mono-mp3';
    els.format.disabled = true;
  } else {
    els.format.disabled = false;
  }
}
els.longMode.addEventListener('change', ()=>{ handleLongModeToggle(); persistSettings(); });

// ===== TEXT SPLITTING =====
function splitBySentences(text){
  return text.split(/(?<=[\.!\?…])\s+/).map(s=>s.trim()).filter(Boolean);
}
function packSegments(segments, maxLen){
  const out=[]; let cur='';
  for (const s of segments){
    if ((cur + (cur?' ':'') + s).length > maxLen){
      if (cur) out.push(cur);
      if (s.length > maxLen){
        const words = s.split(/\s+/);
        let c2='';
        for (const w of words){
          if ((c2 + (c2?' ':'') + w).length > maxLen){
            out.push(c2); c2=w;
          } else c2 = c2 ? `${c2} ${w}` : w;
        }
        if (c2) out.push(c2);
        cur='';
      } else {
        cur = s;
      }
    } else {
      cur = cur ? `${cur} ${s}` : s;
    }
  }
  if (cur) out.push(cur);
  return out;
}
function splitTextSmart(text, maxLen){
  const clean = text.replace(/\s+/g,' ').trim();
  if (!clean) return [];
  const segments = splitBySentences(clean);
  if (!segments.length) return [clean];
  return packSegments(segments, maxLen);
}

// ===== REQUEST + RETRY =====
async function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function ttsRequest(body){
  // ✅ CHANGED HERE: /api/ctts
  const endpoint = url('/api/ctts');
  const r = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!r.ok){
    let msg=`HTTP ${r.status}`;
    try { msg = (await r.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  return new Uint8Array(await r.arrayBuffer());
}

async function ttsWithRetry(body, labelForLogs){
  let attempt=0, err;
  while (attempt < MAX_RETRIES){
    try{
      return await ttsRequest(body);
    }catch(e){
      err = e;
      const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt);
      console.warn(`TTS failed (${labelForLogs}) attempt ${attempt+1}: ${e.message} — retrying in ${backoff}ms`);
      await sleep(backoff);
    }
    attempt++;
  }
  throw err || new Error('Unknown TTS error');
}

// ===== TTS =====
els.speak.addEventListener("click", async () => {
  const text = (els.text.value || "").trim();
  if (!text){ els.status.textContent="Please enter some text."; return; }
  if (text.length>MAX_CHARS){ els.status.textContent=`Text exceeds ${MAX_CHARS.toLocaleString()} characters.`; return; }

  els.status.textContent = "Synthesizing…";
  els.speak.disabled = true; showProgress('Starting…',5);

  const baseBody = {
    voice: els.voice.value || "en-US-AriaNeural",
    rate: fmt.rate(els.rate.value),
    pitch: fmt.pitch(els.pitch.value),
    volume: fmt.volume(els.volume.value),
    breakMs: Number(els.breakMs.value || 0),
    sentenceSilenceMs: Number(els.sentenceSilenceMs.value || 0),
    style: (els.style.value||"").trim() || undefined,
    role: (els.role.value||"").trim()  || undefined
  };

  try {
    if (els.longMode.checked){
      const format = 'audio-24khz-48kbitrate-mono-mp3';
      let chunks = splitTextSmart(text, CHUNK_LEN);
      if (!chunks.length) throw new Error('No text after cleaning.');

      const mp3Parts = [];
      const failed = [];
      for (let i=0;i<chunks.length;i++){
        const label = `part ${i+1}/${chunks.length}`;
        showProgress(`Synthesizing ${label}…`, Math.max(5, (i/chunks.length)*100));
        try{
          const body = { ...baseBody, text: chunks[i], format };
          const audio = await ttsWithRetry(body, label);
          mp3Parts.push(audio);
        }catch(e){
          console.warn(`Primary chunk failed (${label}). Falling back to sub-chunks…`, e);
          const subs = splitTextSmart(chunks[i], SUBCHUNK_LEN);
          let salvaged = 0;
          for (let j=0;j<subs.length;j++){
            const subLabel = `part ${i+1} sub ${j+1}/${subs.length}`;
            try{
              const body = { ...baseBody, text: subs[j], format };
              const audio = await ttsWithRetry(body, subLabel);
              mp3Parts.push(audio);
              salvaged++;
            }catch(e2){
              console.warn(`Sub-chunk failed (${subLabel})`, e2);
              failed.push(`${i+1}.${j+1}`);
            }
          }
          if (salvaged === 0) failed.push(`${i+1}`);
        }
      }

      const total = mp3Parts.reduce((n,a)=>n+a.byteLength,0);
      const merged = new Uint8Array(total);
      let off=0; for (const p of mp3Parts){ merged.set(p,off); off+=p.byteLength; }
      const blob = new Blob([merged], { type: 'audio/mpeg' });
      finishPlayback(blob, false);
      showProgress('Finishing…', 100);

      els.status.textContent = failed.length
        ? `Done with warnings. Skipped tiny segments: [${failed.join(', ')}]`
        : `Done.`;

    } else {
      const format = els.format.value;
      // ✅ CHANGED HERE: /api/ctts
      const endpoint = url('/api/ctts');
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...baseBody, text, format })
      });
      if (!r.ok){ let m=`HTTP ${r.status}`; try{m=(await r.json()).error||m;}catch{} throw new Error(m); }
      const buf = await r.arrayBuffer();
      const isWav = format.includes("pcm");
      const mime = isWav ? "audio/wav" : "audio/mpeg";
      const blob = new Blob([buf], { type: mime });
      finishPlayback(blob, isWav);
      showProgress('Finishing…', 100);

      els.status.textContent = "Done.";
    }
  } catch (e) {
    els.status.textContent = `Error: ${e.message}`;
  } finally {
    els.speak.disabled = false;
    setTimeout(hideProgress, 600);
    persistSettings();
  }
});

function finishPlayback(blob, isWav){
  const urlObj = URL.createObjectURL(blob);
  els.player.src = urlObj;
  els.player.classList.remove("hidden");
  const stamp = new Date().toISOString().replace(/[:T]/g,'-').split('.')[0];
  els.download.href = urlObj;
  els.download.download = `shahzaib-tts_${stamp}${isWav?".wav":".mp3"}`;
  els.download.classList.remove("pointer-events-none","opacity-50");
}

// ===== BOOT =====
function handleLongModeToggle(){
  if (els.longMode.checked){
    els.format.value = 'audio-24khz-48kbitrate-mono-mp3';
    els.format.disabled = true;
  } else {
    els.format.disabled = false;
  }
}
loadVoices();
updateCharInfo();
handleLongModeToggle();

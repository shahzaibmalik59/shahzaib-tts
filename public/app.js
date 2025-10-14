// ===== CONFIG =====
const API_BASE = 'https://shahzaib-tts-rol57qnpc-shahzzaibs-projects.vercel.app';
const LS_KEY = 'shahzaib-tts-settings-v2';
const VOICE_CACHE_KEY = 'shahzaib-tts-voices';
const VOICE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CHARS = 100000; // hard cap

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
  speak: document.getElementById("speak"),
  player: document.getElementById("player"),
  status: document.getElementById("status"),
  download: document.getElementById("download"),
  progressWrap: document.getElementById("progressWrap"),
  progress: document.getElementById("progress"),
  progressText: document.getElementById("progressText"),
  progressLabel: document.getElementById("progressLabel"),
  longMode: document.getElementById("longMode"),
};

// ===== UI HELPERS =====
const fmt = {
  rate:  v => `${Number(v) >= 0 ? "+" : ""}${v}%`,
  pitch: v => `${Number(v) >= 0 ? "+" : ""}${v}st`,
  volume:v => `${Number(v) >= 0 ? "+" : ""}${v}dB`,
};
const setLive = () => {
  els.rateVal.textContent   = fmt.rate(els.rate.value);
  els.pitchVal.textContent  = fmt.pitch(els.pitch.value);
  els.volumeVal.textContent = fmt.volume(els.volume.value);
};
["input","change"].forEach(ev => {
  els.rate.addEventListener(ev, setLive);
  els.pitch.addEventListener(ev, setLive);
  els.volume.addEventListener(ev, setLive);
});
setLive();

function updateCharInfo() {
  let t = els.text.value;
  if (t.length > MAX_CHARS) {
    els.text.value = t.slice(0, MAX_CHARS);
    t = els.text.value;
  }
  els.charInfo.textContent = `${t.length.toLocaleString()} / ${MAX_CHARS.toLocaleString()}`;
}
els.text.addEventListener("input", () => { updateCharInfo(); persistSettings(); });

// ===== PERSIST =====
function persistSettings() {
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
function readSettings() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); }
  catch { return {}; }
}
const saved = readSettings();
function bindPersist(id){
  els[id].addEventListener("change", persistSettings);
  els[id].addEventListener("input", persistSettings);
}
[
  "lang","country","gender","voice","format","rate","pitch","volume",
  "breakMs","sentenceSilenceMs","style","role","longMode"
].forEach(bindPersist);

// ===== LANG/COUNTRY NAMES =====
const langNames = new Intl.DisplayNames(['en'], { type: 'language' });
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const allVoices = { list: [] };

function parts(locale){
  const [lang, region=""] = (locale || "").split('-');
  return { lang, region };
}

// ===== VOICES (cache+load) =====
function cacheVoices(voices){
  localStorage.setItem(VOICE_CACHE_KEY, JSON.stringify({at:Date.now(), voices}));
}
function readCachedVoices(){
  try{
    const x = JSON.parse(localStorage.getItem(VOICE_CACHE_KEY) || "{}");
    if (x.at && Date.now() - x.at < VOICE_CACHE_TTL_MS && Array.isArray(x.voices)) return x.voices;
  }catch{}
  return null;
}

async function loadVoices(){
  const cached = readCachedVoices();
  if (cached) {
    allVoices.list = cached;
    buildFiltersAndVoices();
    return;
  }
  try {
    const r = await fetch(`${API_BASE}/api/voices`);
    const { voices = [] } = await r.json();
    allVoices.list = voices;
    cacheVoices(voices);
    buildFiltersAndVoices();
  } catch {
    // minimal fallback
    allVoices.list = [
      { ShortName: "en-US-AriaNeural", Locale: "en-US", Gender: "Female" },
      { ShortName: "en-US-GuyNeural", Locale: "en-US", Gender: "Male" },
    ];
    buildFiltersAndVoices();
  }
}

function buildFiltersAndVoices(){
  // language & country sets with names
  const langSet = new Map(); // code -> name
  const regionSet = new Map();

  allVoices.list.forEach(v=>{
    const { lang, region } = parts(v.Locale);
    if (lang && !langSet.has(lang)) langSet.set(lang, `${langNames.of(lang) || lang} (${lang})`);
    if (region && !regionSet.has(region)) regionSet.set(region, `${regionNames.of(region) || region} (${region})`);
  });

  // build selects
  els.lang.innerHTML = `<option value="">Any</option>` +
    [...langSet.entries()].sort((a,b)=>a[1].localeCompare(b[1]))
      .map(([code,label]) => `<option value="${code}">${label}</option>`).join("");

  els.country.innerHTML = `<option value="">Any</option>` +
    [...regionSet.entries()].sort((a,b)=>a[1].localeCompare(b[1]))
      .map(([code,label]) => `<option value="${code}">${label}</option>`).join("");

  // restore saved high-level filters before applying
  if (saved.lang) els.lang.value = saved.lang;
  if (saved.country) els.country.value = saved.country;
  if (saved.gender) els.gender.value = saved.gender;
  if (saved.format) els.format.value = saved.format;
  if (saved.longMode) els.longMode.checked = true;

  applyFilters();

  // restore text & sliders & other fields
  if (saved.text) els.text.value = saved.text;
  if (saved.rate) els.rate.value = saved.rate;
  if (saved.pitch) els.pitch.value = saved.pitch;
  if (saved.volume) els.volume.value = saved.volume;
  if (saved.breakMs) els.breakMs.value = saved.breakMs;
  if (saved.sentenceSilenceMs) els.sentenceSilenceMs.value = saved.sentenceSilenceMs;
  if (saved.style) els.style.value = saved.style;
  if (saved.role) els.role.value = saved.role;
  setLive();
  updateCharInfo();
}

function applyFilters(){
  const fl = {
    lang: els.lang.value,
    region: els.country.value,
    gender: els.gender.value,
  };
  const filtered = allVoices.list.filter(v=>{
    const { lang, region } = parts(v.Locale);
    if (fl.lang   && fl.lang   !== lang) return false;
    if (fl.region && fl.region !== region) return false;
    if (fl.gender && fl.gender !== v.Gender) return false;
    return true;
  });

  els.voice.innerHTML = filtered
    .sort((a,b)=> a.Locale.localeCompare(b.Locale) || a.ShortName.localeCompare(b.ShortName))
    .map(v => `<option value="${v.ShortName}">${v.ShortName} — ${langNames.of(parts(v.Locale).lang) || parts(v.Locale).lang}, ${regionNames.of(parts(v.Locale).region) || parts(v.Locale).region} — ${v.Gender}</option>`)
    .join("");

  els.voiceCount.textContent = `Loaded ${filtered.length} / ${allVoices.list.length} voices.`;

  // restore saved voice if exists in filtered
  if (saved.voice && [...els.voice.options].some(o => o.value === saved.voice)) {
    els.voice.value = saved.voice;
  }

  persistSettings();
}

["change"].forEach(ev=>{
  els.lang.addEventListener(ev, applyFilters);
  els.country.addEventListener(ev, applyFilters);
  els.gender.addEventListener(ev, applyFilters);
});

// ===== PROGRESS =====
function showProgress(label, pct){
  els.progressLabel.textContent = label || 'Generating audio…';
  els.progressWrap.classList.remove("hidden");
  if (typeof pct === 'number') {
    els.progress.value = Math.max(0, Math.min(100, Math.round(pct)));
    els.progressText.textContent = `${els.progress.value}%`;
  }
}
function hideProgress(){
  els.progressWrap.classList.add("hidden");
  els.progress.value = 0;
  els.progressText.textContent = "0%";
}

// ===== LONG SCRIPT UTILITIES =====
function splitTextSmart(t, maxLen=2500){
  // try paragraphs first
  const paras = t.split(/\n{2,}/).map(s=>s.trim()).filter(Boolean);
  const chunks = [];
  for (const p of paras){
    if (p.length <= maxLen){ chunks.push(p); continue; }
    // sentence split
    const sentences = p.split(/(?<=[\.\!\?])\s+/);
    let cur = '';
    for (const s of sentences){
      if ((cur + ' ' + s).trim().length > maxLen){
        if (cur) chunks.push(cur.trim());
        cur = s;
      } else {
        cur = (cur ? cur + ' ' : '') + s;
      }
    }
    if (cur.trim()) chunks.push(cur.trim());
  }
  return chunks.length ? chunks : [t.slice(0, maxLen)];
}

// WAV merge (16-bit mono, 24kHz) -> single WAV
function parseWav(ab){
  const v = new DataView(ab);
  const readStr = (o,n)=>String.fromCharCode(...new Uint8Array(ab,o,n));
  if (readStr(0,4)!=='RIFF' || readStr(8,4)!=='WAVE') throw new Error('Invalid WAV');
  let pos = 12, fmt=null, dataStart=0, dataLen=0;
  while (pos < v.byteLength){
    const id = readStr(pos,4); pos+=4;
    const size = v.getUint32(pos,true); pos+=4;
    if (id==='fmt ') fmt = { audioFormat: v.getUint16(pos,true),
                             numChannels: v.getUint16(pos+2,true),
                             sampleRate:  v.getUint32(pos+4,true),
                             bitsPerSample:v.getUint16(pos+14,true) };
    if (id==='data'){ dataStart=pos; dataLen=size; }
    pos += size;
  }
  const samples = new Uint8Array(ab, dataStart, dataLen);
  return { fmt, samples };
}
function writeWav(samples, sampleRate=24000, numChannels=1, bitsPerSample=16){
  const byteRate = sampleRate * numChannels * bitsPerSample/8;
  const blockAlign = numChannels * bitsPerSample/8;
  const dataLen = samples.byteLength;
  const buffer = new ArrayBuffer(44 + dataLen);
  const v = new DataView(buffer);
  const u8 = new Uint8Array(buffer);

  // RIFF header
  u8.set([82,73,70,70]);                   // "RIFF"
  v.setUint32(4, 36 + dataLen, true);
  u8.set([87,65,86,69], 8);                 // "WAVE"

  // fmt chunk
  u8.set([102,109,116,32], 12);            // "fmt "
  v.setUint32(16, 16, true);               // chunk size
  v.setUint16(20, 1, true);                // PCM
  v.setUint16(22, numChannels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, byteRate, true);
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, bitsPerSample, true);

  // data chunk
  u8.set([100,97,116,97], 36);             // "data"
  v.setUint32(40, dataLen, true);
  u8.set(new Uint8Array(samples), 44);

  return new Blob([buffer], { type: 'audio/wav' });
}

// ===== TTS =====
els.speak.addEventListener("click", async () => {
  const text = (els.text.value || "").trim();
  if (!text){ els.status.textContent = "Please enter some text."; return; }
  if (text.length > MAX_CHARS){ els.status.textContent = `Text exceeds ${MAX_CHARS.toLocaleString()} characters.`; return; }

  els.status.textContent = "Synthesizing…";
  els.speak.disabled = true;
  showProgress('Starting…', 5);

  const baseBody = {
    voice: els.voice.value || "en-US-AriaNeural",
    rate: fmt.rate(els.rate.value),
    pitch: fmt.pitch(els.pitch.value),
    volume: fmt.volume(els.volume.value),
    breakMs: Number(els.breakMs.value || 0),
    sentenceSilenceMs: Number(els.sentenceSilenceMs.value || 0),
    style: (els.style.value || "").trim() || undefined,
    role: (els.role.value || "").trim() || undefined
  };

  try {
    if (els.longMode.checked){
      // force WAV for safe merge
      const format = 'riff-24khz-16bit-mono-pcm';
      const chunks = splitTextSmart(text, 2500);
      const blobs = [];
      for (let i=0;i<chunks.length;i++){
        showProgress(`Synthesizing part ${i+1}/${chunks.length}…`, (i/chunks.length)*100);
        const r = await fetch(`${API_BASE}/api/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...baseBody, text: chunks[i], format })
        });
        if (!r.ok){ let m=`HTTP ${r.status}`; try{m=(await r.json()).error||m;}catch{} throw new Error(m); }
        const ab = await r.arrayBuffer();
        blobs.push(new Blob([ab], { type: 'audio/wav' }));
      }
      // merge WAVs
      const pcmParts = [];
      let fmtRef = null;
      for (const b of blobs){
        const ab = await b.arrayBuffer();
        const { fmt, samples } = parseWav(ab);
        fmtRef = fmtRef || fmt;
        pcmParts.push(samples);
      }
      // concat all PCM bytes
      const totalLen = pcmParts.reduce((n,a)=>n+a.byteLength, 0);
      const merged = new Uint8Array(totalLen);
      let offset = 0;
      for (const part of pcmParts){ merged.set(part, offset); offset += part.byteLength; }
      const mergedWav = writeWav(merged, fmtRef.sampleRate, fmtRef.numChannels, fmtRef.bitsPerSample);
      finishPlayback(mergedWav, /*isWav=*/true);
      showProgress('Finishing…', 100);
    } else {
      // single call, respect selected format
      const format = els.format.value;
      const r = await fetch(`${API_BASE}/api/tts`, {
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
    }

    els.status.textContent = "Ready.";
  } catch (e) {
    els.status.textContent = `Error: ${e.message}`;
  } finally {
    els.speak.disabled = false;
    setTimeout(hideProgress, 500);
    persistSettings();
  }
});

function finishPlayback(blob, isWav){
  const url = URL.createObjectURL(blob);
  // do NOT autoplay (per your request)
  els.player.src = url;
  els.player.classList.remove("hidden");
  // prepare download
  const stamp = new Date().toISOString().replace(/[:T]/g,'-').split('.')[0];
  els.download.href = url;
  els.download.download = (isWav ? "shahzaib-tts_" : "shahzaib-tts_") + stamp + (isWav ? ".wav" : ".mp3");
  els.download.classList.remove("pointer-events-none","opacity-50");
}

// boot
loadVoices();
updateCharInfo();

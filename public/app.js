// ---------- CONFIG ----------
const API_BASE = 'https://shahzaib-tts-rol57qnpc-shahzzaibs-projects.vercel.app'; // set your Vercel API base
const LS_KEY = 'shahzaib-tts-settings-v1';
const VOICE_CACHE_KEY = 'shahzaib-tts-voices';
const VOICE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day
const MAX_CHARS = 100000;

// ---------- ELEMENTS ----------
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
};

// ---------- HELPERS ----------
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
  };
  localStorage.setItem(LS_KEY, JSON.stringify(data));
}

function restoreSettings() {
  try {
    const data = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    for (const [k,v] of Object.entries(data)) {
      if (k in els && v != null && typeof els[k].value !== 'undefined') {
        els[k].value = v;
      }
    }
    setLive();
    updateCharInfo();
  } catch {}
}

function updateCharInfo() {
  let t = els.text.value;
  if (t.length > MAX_CHARS) {
    els.text.value = t.slice(0, MAX_CHARS);
    t = els.text.value;
  }
  els.charInfo.textContent = `${t.length.toLocaleString()} / ${MAX_CHARS.toLocaleString()}`;
}

els.text.addEventListener("input", () => { updateCharInfo(); persistSettings(); });

// Store on interactions
[
  "lang","country","gender","voice","format","rate","pitch","volume",
  "breakMs","sentenceSilenceMs","style","role"
].forEach(id => {
  els[id].addEventListener("change", persistSettings);
  els[id].addEventListener("input", persistSettings);
});

// ---------- VOICES + FILTERS ----------
let allVoices = [];

function localeParts(locale) {
  // e.g., "en-US" -> { lang: "en", country: "US" }
  const [lang, country = ""] = (locale || "").split("-");
  return { lang, country };
}

function buildFilterOptions() {
  const langs = new Set();
  const countries = new Set();

  allVoices.forEach(v => {
    const { lang, country } = localeParts(v.Locale);
    if (lang) langs.add(lang);
    if (country) countries.add(country);
  });

  els.lang.innerHTML = `<option value="">Any</option>` +
    [...langs].sort((a,b)=>a.localeCompare(b))
      .map(l => `<option value="${l}">${l}</option>`).join("");

  els.country.innerHTML = `<option value="">Any</option>` +
    [...countries].sort((a,b)=>a.localeCompare(b))
      .map(c => `<option value="${c}">${c}</option>`).join("");
}

function applyFilters() {
  const fl = {
    lang: els.lang.value,
    country: els.country.value,
    gender: els.gender.value,
  };

  const filtered = allVoices.filter(v => {
    const { lang, country } = localeParts(v.Locale);
    if (fl.lang && fl.lang !== lang) return false;
    if (fl.country && fl.country !== country) return false;
    if (fl.gender && fl.gender !== v.Gender) return false;
    return true;
  });

  els.voice.innerHTML = filtered
    .sort((a,b)=> a.Locale.localeCompare(b.Locale) || a.ShortName.localeCompare(b.ShortName))
    .map(v => `<option value="${v.ShortName}">${v.ShortName} — ${v.Locale} — ${v.Gender}</option>`)
    .join("");

  els.voiceCount.textContent = `Loaded ${filtered.length} / ${allVoices.length} voices.`;

  // restore last selected voice if still present
  const stored = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  if (stored.voice && [...els.voice.options].some(o => o.value === stored.voice)) {
    els.voice.value = stored.voice;
  }
}

["change"].forEach(ev => {
  els.lang.addEventListener(ev, applyFilters);
  els.country.addEventListener(ev, applyFilters);
  els.gender.addEventListener(ev, applyFilters);
});

// cache voices in localStorage with TTL
function cacheVoices(voices) {
  localStorage.setItem(VOICE_CACHE_KEY, JSON.stringify({
    at: Date.now(),
    voices
  }));
}

function readCachedVoices() {
  try {
    const item = JSON.parse(localStorage.getItem(VOICE_CACHE_KEY) || "{}");
    if (item.at && Date.now() - item.at < VOICE_CACHE_TTL_MS && Array.isArray(item.voices)) {
      return item.voices;
    }
  } catch {}
  return null;
}

async function loadVoices() {
  const cached = readCachedVoices();
  if (cached) {
    allVoices = cached;
    buildFilterOptions();
    applyFilters();
    return;
  }
  try {
    const r = await fetch(`${API_BASE}/api/voices`);
    const { voices = [] } = await r.json();
    allVoices = voices;
    cacheVoices(voices);
    buildFilterOptions();
    applyFilters();
  } catch {
    // minimal fallback
    allVoices = [
      { ShortName: "en-US-AriaNeural", Locale: "en-US", Gender: "Female" },
      { ShortName: "en-US-GuyNeural",  Locale: "en-US", Gender: "Male" }
    ];
    buildFilterOptions();
    applyFilters();
  }
}

restoreSettings();
updateCharInfo();
loadVoices();

// ---------- SYNTH ----------
function showProgress(pct) {
  els.progressWrap.classList.remove("hidden");
  els.progress.value = Math.max(0, Math.min(100, Math.round(pct)));
  els.progressText.textContent = `${els.progress.value}%`;
}
function hideProgress() {
  els.progressWrap.classList.add("hidden");
  els.progress.value = 0;
  els.progressText.textContent = `0%`;
}

els.speak.addEventListener("click", async () => {
  const text = (els.text.value || "").trim();
  if (!text) {
    els.status.textContent = "Please enter some text.";
    return;
  }
  if (text.length > MAX_CHARS) {
    els.status.textContent = `Text exceeds ${MAX_CHARS.toLocaleString()} characters.`;
    return;
  }

  els.status.textContent = "Synthesizing…";
  els.speak.disabled = true;
  showProgress(5);

  const body = {
    text,
    voice: els.voice.value || "en-US-AriaNeural",
    format: els.format.value,
    rate: fmt.rate(els.rate.value),
    pitch: fmt.pitch(els.pitch.value),
    volume: fmt.volume(els.volume.value),
    breakMs: Number(els.breakMs.value || 0),
    sentenceSilenceMs: Number(els.sentenceSilenceMs.value || 0),
    style: (els.style.value || "").trim() || undefined,
    role: (els.role.value || "").trim() || undefined
  };

  try {
    // stream + progress if content-length available
    const r = await fetch(`${API_BASE}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!r.ok) {
      let msg = `HTTP ${r.status}`;
      try { msg = (await r.json()).error || msg; } catch {}
      throw new Error(msg);
    }

    const contentLength = Number(r.headers.get("content-length") || 0);
    const isWav = body.format.includes("pcm");
    const mime = isWav ? "audio/wav" : "audio/mpeg";

    if (r.body && contentLength > 0 && "getReader" in r.body) {
      const reader = r.body.getReader();
      const chunks = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        showProgress((received / contentLength) * 100);
      }
      const blob = new Blob(chunks, { type: mime });
      finishPlayback(blob, isWav);
    } else {
      // fallback: simple buffer (no known length)
      const buf = await r.arrayBuffer();
      showProgress(100);
      const blob = new Blob([buf], { type: mime });
      finishPlayback(blob, isWav);
    }

    els.status.textContent = "Done.";
  } catch (e) {
    els.status.textContent = `Error: ${e.message}`;
  } finally {
    els.speak.disabled = false;
    setTimeout(hideProgress, 500);
    persistSettings();
  }
});

function finishPlayback(blob, isWav) {
  const url = URL.createObjectURL(blob);
  els.player.src = url;
  els.player.classList.remove("hidden");
  els.player.play().catch(()=>{});
  els.download.href = url;
  els.download.download = isWav ? "shahzaib-tts.wav" : "shahzaib-tts.mp3";
  els.download.classList.remove("pointer-events-none","opacity-50");
}

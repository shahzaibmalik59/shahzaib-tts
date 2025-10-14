const els = {
  text: document.getElementById("text"),
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
  download: document.getElementById("download")
};

// label helpers
const fmt = {
  rate: (v) => `${Number(v) >= 0 ? "+" : ""}${v}%`,
  pitch: (v) => `${Number(v) >= 0 ? "+" : ""}${v}st`,
  volume: (v) => `${Number(v) >= 0 ? "+" : ""}${v}dB`
};
const setLive = () => {
  els.rateVal.textContent = fmt.rate(els.rate.value);
  els.pitchVal.textContent = fmt.pitch(els.pitch.value);
  els.volumeVal.textContent = fmt.volume(els.volume.value);
};
["input", "change"].forEach(ev => {
  els.rate.addEventListener(ev, setLive);
  els.pitch.addEventListener(ev, setLive);
  els.volume.addEventListener(ev, setLive);
});
setLive();

// load voices
(async function loadVoices() {
  try {
    const r = await fetch("/api/voices");
    const { voices = [] } = await r.json();
    els.voice.innerHTML = voices
      .sort((a, b) => a.Locale.localeCompare(b.Locale) || a.ShortName.localeCompare(b.ShortName))
      .map(v => `<option value="${v.ShortName}">${v.ShortName} — ${v.Locale} — ${v.Gender}</option>`)
      .join("");
    els.voiceCount.textContent = `Loaded ${voices.length} voices.`;
  } catch {
    els.voice.innerHTML = `<option value="en-US-AriaNeural">en-US-AriaNeural</option>`;
    els.voiceCount.textContent = "Unable to load voices (fallback used).";
  }
})();

// synthesize click
els.speak.addEventListener("click", async () => {
  const text = els.text.value.trim();
  if (!text) {
    els.status.textContent = "Please enter some text.";
    return;
  }

  els.status.textContent = "Synthesizing...";
  els.speak.disabled = true;

  const body = {
    text,
    voice: els.voice.value || "en-US-AriaNeural",
    format: els.format.value,
    rate: fmt.rate(els.rate.value),
    pitch: fmt.pitch(els.pitch.value),
    volume: fmt.volume(els.volume.value),
    breakMs: Number(els.breakMs.value || 0),
    sentenceSilenceMs: Number(els.sentenceSilenceMs.value || 0),
    style: els.style.value.trim() || undefined,
    role: els.role.value.trim() || undefined
  };

  try {
    // request as binary audio; Netlify dev returns bytes (no JSON)
    const r = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!r.ok) {
      const err = await safeJson(r);
      throw new Error(err?.error || `HTTP ${r.status}`);
    }

    // read as ArrayBuffer (binary), create Blob URL
    const buf = await r.arrayBuffer();
    const isWav = body.format.includes("pcm");
    const mime = isWav ? "audio/wav" : "audio/mpeg";
    const blob = new Blob([buf], { type: mime });
    const url = URL.createObjectURL(blob);

    // play
    els.player.src = url;
    els.player.classList.remove("hidden");
    els.player.play().catch(() => {});

    // download
    els.download.href = url;
    els.download.download = isWav ? "shahzaib-tts.wav" : "shahzaib-tts.mp3";
    els.download.classList.remove("pointer-events-none", "opacity-50");

    els.status.textContent = "Done.";
  } catch (e) {
    els.status.textContent = `Error: ${e.message}`;
  } finally {
    els.speak.disabled = false;
  }
});

async function safeJson(r) {
  try { return await r.json(); } catch { return null; }
}

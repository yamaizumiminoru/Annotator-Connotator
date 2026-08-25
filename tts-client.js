(function initTtsClient(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root?.document) {
    root.ANNOTATOR_TTS = api;
    api.install(root);
  }
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const DEVICE_SPEECH_RATE = 1.0;
  const AI_TTS_MODEL = "gpt-4o-mini-tts";
  const AI_TTS_SPEED = 1.0;
  const AI_TTS_DEFAULT_VOICE = "marin";
  const AI_TTS_VOICES = ["marin", "cedar"];
  const AI_TTS_INSTRUCTION_VERSION = "natural-exact-v1";
  const AI_TTS_CHUNK_CHARS = 1600;
  const AI_TTS_CONCURRENCY = 3;
  const DB_NAME = "annotator-connotator-audio";
  const DB_VERSION = 1;
  const STORE_NAME = "tts-chunks";
  const MAX_CACHE_ENTRIES = 96;

  const SUPPORTED_TTS_LANGUAGE_CODES = new Set([
    "af", "ar", "hy", "az", "be", "bs", "bg", "ca", "zh", "hr", "cs",
    "da", "nl", "en", "et", "fi", "fr", "gl", "de", "el", "he", "hi",
    "hu", "is", "id", "it", "ja", "kn", "kk", "ko", "lv", "lt", "mk",
    "ms", "mr", "mi", "ne", "no", "fa", "pl", "pt", "ro", "ru", "sr",
    "sk", "sl", "es", "sw", "sv", "tl", "ta", "th", "tr", "uk", "ur",
    "vi", "cy",
  ]);

  const UI_ADDITIONS = {
    ja: {
      deviceSpeech: "端末音声",
      deviceSpeechTitle: "端末・ブラウザの音声で1.00倍速再生",
      aiSpeech: "AI音声",
      aiSpeechTitle: "AI生成音声。初回のみAPIで生成し、同じ本文・声は端末に保存して再利用します。",
      aiVoice: "AI音声の声",
      ttsLanguageUnsupported: "AI音声は「{language}」には現在対応していません。端末音声をお試しください。",
      ttsLanguageUnknown: "AI音声を使うには、入力言語を選択するか、先に解析して言語を判定してください。",
      ttsAiGenerating: "AI音声を生成中... {completed}/{total}（初回のみAPIを使用します）",
      ttsAiCacheHit: "保存済みのAI音声をローカルキャッシュから再生します。",
      ttsAiPlaying: "AI生成音声を再生中...",
      ttsAiFinished: "AI音声の再生が終わりました。",
      ttsAiStopped: "AI音声を停止しました。",
      ttsDevicePlaying: "端末音声を1.00倍速で再生中...",
      ttsDeviceStopped: "端末音声を停止しました。",
      ttsApiKeyRequired: "AI音声には .env の OPENAI_API_KEY が必要です。端末音声はそのまま使えます。",
      ttsAiFailed: "AI音声を生成できませんでした。端末音声をお試しください。",
    },
    en: {
      deviceSpeech: "Device speech",
      deviceSpeechTitle: "Play with the device/browser voice at 1.00× speed",
      aiSpeech: "AI speech",
      aiSpeechTitle: "AI-generated speech. The first play uses the API; matching text and voice are cached on this device.",
      aiVoice: "AI voice",
      ttsLanguageUnsupported: "AI speech does not currently support {language}. Try device speech instead.",
      ttsLanguageUnknown: "To use AI speech, select the source language or analyze the text first so its language can be identified.",
      ttsAiGenerating: "Generating AI speech... {completed}/{total} (the API is used only for uncached audio)",
      ttsAiCacheHit: "Playing saved AI speech from the local cache.",
      ttsAiPlaying: "Playing AI-generated speech...",
      ttsAiFinished: "AI speech finished.",
      ttsAiStopped: "AI speech stopped.",
      ttsDevicePlaying: "Playing device speech at 1.00× speed...",
      ttsDeviceStopped: "Device speech stopped.",
      ttsApiKeyRequired: "AI speech requires OPENAI_API_KEY in .env. Device speech is still available.",
      ttsAiFailed: "AI speech could not be generated. Try device speech instead.",
    },
  };

  function normalizeLanguageCode(value) {
    return String(value || "").trim().toLowerCase().split(/[-_]/, 1)[0];
  }

  function isSupportedTtsLanguage(value) {
    return SUPPORTED_TTS_LANGUAGE_CODES.has(normalizeLanguageCode(value));
  }

  function cacheMaterial({ text, language, model, voice, speed, instructionVersion } = {}) {
    return JSON.stringify({
      text: String(text || ""),
      language: normalizeLanguageCode(language),
      model: String(model || AI_TTS_MODEL),
      voice: String(voice || AI_TTS_DEFAULT_VOICE),
      speed: Number(speed ?? AI_TTS_SPEED),
      instructionVersion: String(instructionVersion || AI_TTS_INSTRUCTION_VERSION),
    });
  }

  function splitTextForTts(text, maxChars = AI_TTS_CHUNK_CHARS) {
    const source = String(text || "");
    if (!source) return [];
    const limit = Math.max(200, Math.floor(Number(maxChars) || AI_TTS_CHUNK_CHARS));
    const chunks = [];
    let start = 0;

    while (start < source.length) {
      let end = Math.min(source.length, start + limit);
      if (end < source.length) {
        const minimum = start + Math.floor(limit * 0.55);
        end = preferredBreak(source, start, end, minimum);
      }
      if (end <= start) end = Math.min(source.length, start + limit);
      chunks.push(source.slice(start, end));
      start = end;
    }
    return chunks.filter((chunk) => chunk.length > 0);
  }

  function preferredBreak(source, start, end, minimum) {
    for (let index = end; index > minimum; index -= 1) {
      const previous = source[index - 1] || "";
      const beforePrevious = source[index - 2] || "";
      if (/\s/.test(previous) && /[.!?。！？]/.test(beforePrevious)) return index;
    }
    for (let index = end; index > minimum; index -= 1) {
      if (source[index - 1] === "\n") return index;
    }
    for (let index = end; index > minimum; index -= 1) {
      if (/\s/.test(source[index - 1] || "")) return index;
    }
    return end;
  }

  function install(root) {
    installUiText(root);
    installStyles(root);

    const deviceButton = root.document.getElementById("speakBtn");
    const sourceText = root.document.getElementById("sourceText");
    const sourceLanguage = root.document.getElementById("sourceLangSelect");
    const uiLanguage = root.document.getElementById("uiLangSelect");
    const topBar = deviceButton?.parentElement;
    if (!deviceButton || !sourceText || !topBar) return;

    let lastDetectedLanguage = "";
    let deviceSpeaking = false;
    let aiRunning = false;
    let aiAbortController = null;
    let currentAudio = null;
    let currentAudioUrl = "";
    let runSerial = 0;

    const controls = root.document.createElement("div");
    controls.className = "tts-controls";
    topBar.insertBefore(controls, deviceButton);
    controls.appendChild(deviceButton);

    deviceButton.className = "ghost-btn tts-device-btn";
    deviceButton.dataset.i18n = "deviceSpeech";
    deviceButton.dataset.i18nTitle = "deviceSpeechTitle";
    deviceButton.dataset.i18nAria = "deviceSpeechTitle";

    const aiButton = root.document.createElement("button");
    aiButton.id = "aiSpeakBtn";
    aiButton.type = "button";
    aiButton.className = "ghost-btn tts-ai-btn";
    aiButton.dataset.i18n = "aiSpeech";
    aiButton.dataset.i18nTitle = "aiSpeechTitle";
    aiButton.dataset.i18nAria = "aiSpeechTitle";
    controls.appendChild(aiButton);

    const voiceSelect = root.document.createElement("select");
    voiceSelect.id = "aiVoiceSelect";
    voiceSelect.className = "tts-voice-select";
    voiceSelect.setAttribute("aria-label", ui(root, "aiVoice", "AI voice"));
    for (const voice of AI_TTS_VOICES) {
      const option = root.document.createElement("option");
      option.value = voice;
      option.textContent = voice[0].toUpperCase() + voice.slice(1);
      voiceSelect.appendChild(option);
    }
    const savedVoice = root.localStorage?.getItem("annotation.ttsVoice");
    voiceSelect.value = AI_TTS_VOICES.includes(savedVoice) ? savedVoice : AI_TTS_DEFAULT_VOICE;
    voiceSelect.addEventListener("change", () => {
      root.localStorage?.setItem("annotation.ttsVoice", voiceSelect.value);
    });
    controls.appendChild(voiceSelect);

    refreshUi(root, deviceButton, aiButton, voiceSelect);

    // script.js already attached the legacy browser-TTS listener. Capture-phase
    // interception keeps the same button but replaces its 0.86 rate with 1.00.
    deviceButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (deviceSpeaking) {
        root.speechSynthesis?.cancel();
        deviceSpeaking = false;
        delete deviceButton.dataset.speaking;
        refreshUi(root, deviceButton, aiButton, voiceSelect);
        setUiStatus(root, ui(root, "ttsDeviceStopped", "Device speech stopped."), "");
        return;
      }
      stopAiSpeech(false);
      const text = sourceText.value.trim();
      if (!text || !root.speechSynthesis || !root.SpeechSynthesisUtterance) return;
      const utterance = new root.SpeechSynthesisUtterance(text);
      utterance.lang = resolvedDeviceSpeechLanguage(root, sourceLanguage, text, lastDetectedLanguage);
      const voice = matchingDeviceVoice(root, utterance.lang);
      if (voice) utterance.voice = voice;
      utterance.rate = DEVICE_SPEECH_RATE;
      utterance.onend = () => {
        deviceSpeaking = false;
        delete deviceButton.dataset.speaking;
        refreshUi(root, deviceButton, aiButton, voiceSelect);
      };
      utterance.onerror = () => {
        deviceSpeaking = false;
        delete deviceButton.dataset.speaking;
        refreshUi(root, deviceButton, aiButton, voiceSelect);
      };
      root.speechSynthesis.cancel();
      root.speechSynthesis.speak(utterance);
      deviceSpeaking = true;
      deviceButton.dataset.speaking = "true";
      refreshUi(root, deviceButton, aiButton, voiceSelect);
      setUiStatus(root, ui(root, "ttsDevicePlaying", "Playing device speech at 1.00× speed..."), "ok");
    }, { capture: true });

    aiButton.addEventListener("click", async () => {
      if (aiRunning) {
        stopAiSpeech(true);
        return;
      }
      root.speechSynthesis?.cancel();
      deviceSpeaking = false;
      delete deviceButton.dataset.speaking;
      const text = sourceText.value.trim();
      if (!text) return;

      const language = resolvedAiLanguage(root, sourceLanguage, text, lastDetectedLanguage);
      if (!language) {
        refreshUi(root, deviceButton, aiButton, voiceSelect);
        setUiStatus(root, ui(root, "ttsLanguageUnknown", "Select or detect the source language first."), "error");
        return;
      }
      if (!isSupportedTtsLanguage(language)) {
        refreshUi(root, deviceButton, aiButton, voiceSelect);
        setUiStatus(root, ui(root, "ttsLanguageUnsupported", "AI speech does not support {language}.", {
          language: languageDisplayName(root, language),
        }), "error");
        return;
      }

      const voice = voiceSelect.value || AI_TTS_DEFAULT_VOICE;
      const chunks = splitTextForTts(text);
      if (!chunks.length) return;
      aiRunning = true;
      const serial = ++runSerial;
      const controller = new AbortController();
      aiAbortController = controller;
      aiButton.dataset.speaking = "true";
      voiceSelect.disabled = true;
      refreshUi(root, deviceButton, aiButton, voiceSelect);

      try {
        let completed = 0;
        let generated = 0;
        setUiStatus(root, ui(root, "ttsAiGenerating", "Generating AI speech... {completed}/{total}", {
          completed,
          total: chunks.length,
        }), "");

        const results = await mapWithConcurrency(chunks, AI_TTS_CONCURRENCY, async (chunk) => {
          const audio = await getOrCreateAudio(root, {
            text: chunk,
            language,
            voice,
            signal: controller.signal,
          });
          if (!audio.cached) generated += 1;
          completed += 1;
          if (serial === runSerial) {
            setUiStatus(root, ui(root, "ttsAiGenerating", "Generating AI speech... {completed}/{total}", {
              completed,
              total: chunks.length,
            }), "");
          }
          return audio.blob;
        });

        if (serial !== runSerial || controller.signal.aborted) return;
        if (generated === 0) {
          setUiStatus(root, ui(root, "ttsAiCacheHit", "Playing saved AI speech from the local cache."), "ok");
        } else {
          setUiStatus(root, ui(root, "ttsAiPlaying", "Playing AI-generated speech..."), "ok");
        }

        for (const blob of results) {
          if (serial !== runSerial || controller.signal.aborted) return;
          await playAudioBlob(root, blob, serial);
        }
        if (serial === runSerial) {
          setUiStatus(root, ui(root, "ttsAiFinished", "AI speech finished."), "ok");
        }
      } catch (error) {
        if (error?.name === "AbortError" || serial !== runSerial) return;
        if (error?.code === "api_key_required") {
          setUiStatus(root, ui(root, "ttsApiKeyRequired", "AI speech requires OPENAI_API_KEY in .env."), "error");
        } else if (error?.code === "tts_language_unsupported") {
          setUiStatus(root, ui(root, "ttsLanguageUnsupported", "AI speech does not support {language}.", {
            language: languageDisplayName(root, language),
          }), "error");
        } else {
          setUiStatus(root, ui(root, "ttsAiFailed", "AI speech could not be generated."), "error");
        }
      } finally {
        if (serial === runSerial) {
          aiRunning = false;
          aiAbortController = null;
          delete aiButton.dataset.speaking;
          releaseCurrentAudio();
          voiceSelect.disabled = false;
          refreshUi(root, deviceButton, aiButton, voiceSelect);
        }
      }
    });

    root.addEventListener("annotator:analysis-result", (event) => {
      const detected = languageCodeFromValue(root, event.detail?.sourceLanguage);
      if (detected) lastDetectedLanguage = detected;
    });

    uiLanguage?.addEventListener("change", () => {
      root.setTimeout(() => refreshUi(root, deviceButton, aiButton, voiceSelect), 0);
    });

    function stopAiSpeech(showStatus) {
      if (!aiRunning && !currentAudio) return;
      runSerial += 1;
      aiAbortController?.abort();
      aiAbortController = null;
      aiRunning = false;
      delete aiButton.dataset.speaking;
      releaseCurrentAudio();
      voiceSelect.disabled = false;
      refreshUi(root, deviceButton, aiButton, voiceSelect);
      if (showStatus) setUiStatus(root, ui(root, "ttsAiStopped", "AI speech stopped."), "");
    }

    function releaseCurrentAudio() {
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.src = "";
        currentAudio = null;
      }
      if (currentAudioUrl) {
        root.URL.revokeObjectURL(currentAudioUrl);
        currentAudioUrl = "";
      }
    }

    function playAudioBlob(rootObject, blob, serial) {
      return new Promise((resolve, reject) => {
        releaseCurrentAudio();
        currentAudioUrl = rootObject.URL.createObjectURL(blob);
        currentAudio = new rootObject.Audio(currentAudioUrl);
        currentAudio.onended = () => {
          releaseCurrentAudio();
          resolve();
        };
        currentAudio.onerror = () => {
          releaseCurrentAudio();
          reject(new Error("audio playback failed"));
        };
        if (serial !== runSerial) {
          releaseCurrentAudio();
          resolve();
          return;
        }
        currentAudio.play().catch(reject);
      });
    }
  }

  function installUiText(root) {
    root.UI_TEXT = root.UI_TEXT || {};
    for (const language of ["ja", "en"]) {
      root.UI_TEXT[language] = root.UI_TEXT[language] || {};
      Object.assign(root.UI_TEXT[language], UI_ADDITIONS[language]);
    }
  }

  function installStyles(root) {
    if (root.document.getElementById("ttsEnhancementStyles")) return;
    const style = root.document.createElement("style");
    style.id = "ttsEnhancementStyles";
    style.textContent = `
      .tts-controls { display:flex; align-items:center; justify-content:flex-end; gap:6px; flex-wrap:wrap; }
      .tts-controls .ghost-btn { min-height:34px; padding:0 10px; white-space:nowrap; font-size:12px; }
      .tts-voice-select { width:auto; min-width:82px; min-height:34px; padding:4px 7px; font-size:12px; }
      @media (max-width: 760px) { .top-bar { align-items:flex-start; flex-wrap:wrap; } .tts-controls { width:100%; justify-content:flex-start; } }
    `;
    root.document.head.appendChild(style);
  }

  function refreshUi(root, deviceButton, aiButton, voiceSelect) {
    const deviceLabel = ui(root, "deviceSpeech", "Device speech");
    const aiLabel = ui(root, "aiSpeech", "AI speech");
    deviceButton.textContent = `${deviceButton.dataset.speaking === "true" ? "Ⅱ" : "▶"} ${deviceLabel}`;
    aiButton.textContent = `${aiButton.dataset.speaking === "true" ? "■" : "✨"} ${aiLabel}`;
    deviceButton.title = ui(root, "deviceSpeechTitle", "Play with the device/browser voice at 1.00× speed");
    aiButton.title = ui(root, "aiSpeechTitle", "AI-generated speech; matching audio is cached locally.");
    deviceButton.setAttribute("aria-label", deviceButton.title);
    aiButton.setAttribute("aria-label", aiButton.title);
    voiceSelect?.setAttribute("aria-label", ui(root, "aiVoice", "AI voice"));
  }

  function ui(root, key, fallback, values = {}) {
    let text = "";
    try {
      if (typeof root.t === "function") text = root.t(key, values);
    } catch {
      text = "";
    }
    if (!text || text === key) {
      const language = root.document?.getElementById("uiLangSelect")?.value || "ja";
      text = root.UI_TEXT?.[language]?.[key]
        || root.UI_TEXT?.en?.[key]
        || root.UI_TEXT?.ja?.[key]
        || fallback
        || key;
      for (const [name, value] of Object.entries(values)) {
        text = String(text).replaceAll(`{${name}}`, String(value));
      }
    }
    return text;
  }

  function setUiStatus(root, message, kind = "") {
    if (typeof root.setStatus === "function") {
      root.setStatus(message, kind);
      return;
    }
    const box = root.document.getElementById("statusBox");
    if (!box) return;
    box.textContent = message;
    box.className = `status ${kind}`.trim();
  }

  function resolvedDeviceSpeechLanguage(root, select, text, detected) {
    const code = resolvedAiLanguage(root, select, text, detected) || "en";
    const item = (root.LANGUAGE_CATALOG || []).find((language) => language.code === code);
    return item?.speech || `${code}-${code.toUpperCase()}`;
  }

  function matchingDeviceVoice(root, lang) {
    const voices = root.speechSynthesis?.getVoices?.() || [];
    const base = String(lang || "").split("-")[0];
    return voices.find((voice) => voice.lang === lang)
      || voices.find((voice) => voice.lang?.startsWith(`${base}-`))
      || null;
  }

  function resolvedAiLanguage(root, select, text, detected) {
    const selected = normalizeLanguageCode(select?.value);
    if (selected && selected !== "auto") return selected;
    const detectedCode = languageCodeFromValue(root, detected);
    if (detectedCode) return detectedCode;
    return inferUnambiguousLanguage(text);
  }

  function languageCodeFromValue(root, value) {
    const raw = String(value || "").trim();
    if (!raw || raw === "auto") return "";
    const normalized = normalizeLanguageCode(raw);
    const catalog = root.LANGUAGE_CATALOG || [];
    if (catalog.some((language) => language.code === normalized)) return normalized;
    const lower = raw.toLowerCase();
    return catalog.find((language) => (
      String(language.name || "").toLowerCase() === lower
      || String(language.native || "").toLowerCase() === lower
    ))?.code || "";
  }

  function inferUnambiguousLanguage(text) {
    const value = String(text || "");
    if (/[\u3040-\u30ff]/.test(value)) return "ja";
    if (/[\uac00-\ud7af]/.test(value)) return "ko";
    if (/[\u4e00-\u9fff]/.test(value)) return "zh";
    if (/^[\x00-\x7f\s\p{P}\p{N}]*$/u.test(value)) return "en";
    return "";
  }

  function languageDisplayName(root, code) {
    const item = (root.LANGUAGE_CATALOG || []).find((language) => language.code === code);
    if (!item) return code || "?";
    return item.native === item.name ? item.name : `${item.native} / ${item.name}`;
  }

  async function getOrCreateAudio(root, { text, language, voice, signal }) {
    const material = cacheMaterial({
      text,
      language,
      model: AI_TTS_MODEL,
      voice,
      speed: AI_TTS_SPEED,
      instructionVersion: AI_TTS_INSTRUCTION_VERSION,
    });
    const key = await sha256Hex(root, material);
    const cached = await getCachedAudio(root, key);
    if (cached?.blob) return { blob: cached.blob, cached: true };

    const response = await root.fetch("/api/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text,
        language,
        model: AI_TTS_MODEL,
        voice,
        speed: AI_TTS_SPEED,
        instructionVersion: AI_TTS_INSTRUCTION_VERSION,
      }),
      signal,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const error = new Error(data.error || "tts_request_failed");
      error.code = data.error || "tts_request_failed";
      throw error;
    }
    const blob = await response.blob();
    await putCachedAudio(root, {
      key,
      blob,
      savedAt: Date.now(),
      model: AI_TTS_MODEL,
      voice,
      language,
    });
    return { blob, cached: false };
  }

  async function sha256Hex(root, value) {
    const text = String(value || "");
    if (!root.crypto?.subtle || typeof TextEncoder === "undefined") {
      let hash = 2166136261;
      for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      return `fallback-${text.length}-${(hash >>> 0).toString(16)}`;
    }
    const bytes = new TextEncoder().encode(text);
    const digest = await root.crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function openAudioDb(root) {
    if (!root.indexedDB) return Promise.resolve(null);
    return new Promise((resolve) => {
      const request = root.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
          store.createIndex("savedAt", "savedAt", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
  }

  async function getCachedAudio(root, key) {
    const db = await openAudioDb(root);
    if (!db) return null;
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  }

  async function putCachedAudio(root, entry) {
    const db = await openAudioDb(root);
    if (!db) return;
    await new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(entry);
      transaction.oncomplete = resolve;
      transaction.onerror = resolve;
      transaction.onabort = resolve;
    });
    void pruneAudioCache(root);
  }

  async function pruneAudioCache(root) {
    const db = await openAudioDb(root);
    if (!db) return;
    const entries = await new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
    if (entries.length <= MAX_CACHE_ENTRIES) return;
    const remove = entries
      .sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0))
      .slice(MAX_CACHE_ENTRIES);
    await new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      for (const entry of remove) store.delete(entry.key);
      transaction.oncomplete = resolve;
      transaction.onerror = resolve;
      transaction.onabort = resolve;
    });
  }

  async function mapWithConcurrency(items, concurrency, worker) {
    const results = new Array(items.length);
    let nextIndex = 0;
    async function runWorker() {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= items.length) return;
        results[index] = await worker(items[index], index);
      }
    }
    const count = Math.max(1, Math.min(Number(concurrency) || 1, items.length));
    await Promise.all(Array.from({ length: count }, () => runWorker()));
    return results;
  }

  return {
    AI_TTS_CHUNK_CHARS,
    AI_TTS_DEFAULT_VOICE,
    AI_TTS_INSTRUCTION_VERSION,
    AI_TTS_MODEL,
    AI_TTS_SPEED,
    AI_TTS_VOICES,
    DEVICE_SPEECH_RATE,
    SUPPORTED_TTS_LANGUAGE_CODES,
    UI_ADDITIONS,
    cacheMaterial,
    inferUnambiguousLanguage,
    install,
    isSupportedTtsLanguage,
    mapWithConcurrency,
    normalizeLanguageCode,
    splitTextForTts,
  };
}));

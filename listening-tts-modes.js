(function initListeningTtsModes(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root?.document) api.install(root);
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const MODES = ["clear", "natural", "casual", "custom"];
  const PRESET_MODES = new Set(["clear", "natural", "casual"]);
  const DEFAULT_MODE = "natural";
  const MODEL = "gpt-4o-mini-tts";
  const SPEED = 1.0;
  const MAX_CUSTOM_INSTRUCTIONS = 3000;
  const DB_NAME = "annotator-connotator-audio";
  const DB_VERSION = 1;
  const STORE_NAME = "tts-chunks";
  const MAX_CACHE_ENTRIES = 96;

  const UI = {
    ja: {
      deviceSpeech: "端末音声",
      aiSpeech: "AI音声",
      ttsModeLabel: "読み方",
      ttsPromptPlaceholder: "例：General American寄りで、友人同士の会話のように。機能語は自然に弱化する。",
      ttsCustomRequired: "Customでは読み方の指示を入力してください。",
      ttsGenerating: "AI音声を生成中... {completed}/{total}",
      ttsPlaying: "AI音声を再生中...",
      ttsCacheHit: "保存済みのAI音声を再生します。",
      ttsFinished: "AI音声の再生が終わりました。",
      ttsStopped: "AI音声を停止しました。",
      ttsLanguageUnknown: "AI音声を使うには、入力言語を選択するか、先に解析してください。",
      ttsLanguageUnsupported: "この言語はAI音声に対応していません。",
      ttsFailed: "AI音声を生成できませんでした。",
      ttsDevicePlaying: "端末音声を再生中...",
      ttsDeviceStopped: "端末音声を停止しました。",
    },
    en: {
      deviceSpeech: "Device speech",
      aiSpeech: "AI speech",
      ttsModeLabel: "Delivery",
      ttsPromptPlaceholder: "Example: General American, like relaxed conversation between friends; use natural weak forms.",
      ttsCustomRequired: "Enter speaking-style instructions for Custom mode.",
      ttsGenerating: "Generating AI speech... {completed}/{total}",
      ttsPlaying: "Playing AI speech...",
      ttsCacheHit: "Playing saved AI speech.",
      ttsFinished: "AI speech finished.",
      ttsStopped: "AI speech stopped.",
      ttsLanguageUnknown: "Select the source language or analyze the text before using AI speech.",
      ttsLanguageUnsupported: "AI speech is not available for this language.",
      ttsFailed: "AI speech could not be generated.",
      ttsDevicePlaying: "Playing device speech...",
      ttsDeviceStopped: "Device speech stopped.",
    },
  };

  function normalizeMode(value) {
    const mode = String(value || "").trim().toLowerCase();
    return MODES.includes(mode) ? mode : DEFAULT_MODE;
  }

  function normalizeCustomInstructions(value) {
    return String(value || "").trim().slice(0, MAX_CUSTOM_INSTRUCTIONS);
  }

  function customInstructionsForMode(mode, value) {
    return normalizeMode(mode) === "custom" ? normalizeCustomInstructions(value) : "";
  }

  function cacheMaterial({ text, language, model, voice, speed, mode, customInstructions } = {}) {
    const normalizedMode = normalizeMode(mode);
    return JSON.stringify({
      text: String(text || ""),
      language: String(language || "").trim().toLowerCase(),
      model: String(model || MODEL),
      voice: String(voice || "marin"),
      speed: Number(speed ?? SPEED),
      mode: normalizedMode,
      customInstructions: customInstructionsForMode(normalizedMode, customInstructions),
    });
  }

  function install(root) {
    const base = root.ANNOTATOR_TTS;
    const controls = root.document.querySelector(".tts-controls");
    const sourceText = root.document.getElementById("sourceText");
    const sourceLanguage = root.document.getElementById("sourceLangSelect");
    const uiLanguage = root.document.getElementById("uiLangSelect");
    if (!base || !controls || !sourceText || !sourceLanguage) return;

    installUiText(root);
    installStyles(root);

    const previousVoice = root.document.getElementById("aiVoiceSelect")?.value
      || root.localStorage?.getItem("annotation.ttsVoice")
      || base.AI_TTS_DEFAULT_VOICE
      || "marin";

    const deviceButton = makeButton(root, "speakBtn", "ghost-btn tts-device-btn");
    const aiButton = makeButton(root, "aiSpeakBtn", "ghost-btn tts-ai-btn");
    const modeWrap = root.document.createElement("div");
    modeWrap.className = "tts-mode-wrap";
    const modeLabel = root.document.createElement("span");
    modeLabel.className = "tts-mode-label";
    const modeGroup = root.document.createElement("div");
    modeGroup.className = "tts-mode-group";
    modeGroup.setAttribute("role", "group");

    const savedMode = normalizeMode(root.localStorage?.getItem("annotation.ttsMode"));
    for (const mode of MODES) {
      const button = root.document.createElement("button");
      button.type = "button";
      button.className = "tts-mode-button";
      button.dataset.ttsMode = mode;
      button.textContent = mode[0].toUpperCase() + mode.slice(1);
      const active = mode === savedMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
      modeGroup.appendChild(button);
    }
    modeWrap.append(modeLabel, modeGroup);

    const voiceSelect = root.document.createElement("select");
    voiceSelect.id = "aiVoiceSelect";
    voiceSelect.className = "tts-voice-select";
    for (const voice of base.AI_TTS_VOICES || ["marin", "cedar"]) {
      const option = root.document.createElement("option");
      option.value = voice;
      option.textContent = voice[0].toUpperCase() + voice.slice(1);
      voiceSelect.appendChild(option);
    }
    voiceSelect.value = [...voiceSelect.options].some((option) => option.value === previousVoice)
      ? previousVoice
      : (base.AI_TTS_DEFAULT_VOICE || "marin");

    const promptPanel = root.document.createElement("div");
    promptPanel.className = "tts-prompt-panel";
    const promptInput = root.document.createElement("textarea");
    promptInput.id = "ttsCustomInstructions";
    promptInput.className = "tts-prompt-input";
    promptInput.rows = 2;
    promptInput.maxLength = MAX_CUSTOM_INSTRUCTIONS;
    promptInput.value = root.localStorage?.getItem("annotation.ttsCustomInstructions") || "";
    promptPanel.appendChild(promptInput);
    promptPanel.hidden = savedMode !== "custom";

    controls.replaceChildren(deviceButton, aiButton, modeWrap, voiceSelect, promptPanel);

    let deviceSpeaking = false;
    let aiRunning = false;
    let controller = null;
    let currentAudio = null;
    let currentAudioUrl = "";
    let runSerial = 0;

    modeGroup.addEventListener("click", (event) => {
      const button = event.target.closest?.(".tts-mode-button");
      if (!button || aiRunning) return;
      const mode = setMode(root, modeGroup, button.dataset.ttsMode);
      syncPromptPanel(mode, true);
    });
    voiceSelect.addEventListener("change", () => root.localStorage?.setItem("annotation.ttsVoice", voiceSelect.value));
    promptInput.addEventListener("input", () => {
      root.localStorage?.setItem("annotation.ttsCustomInstructions", promptInput.value);
    });

    deviceButton.addEventListener("click", () => {
      if (deviceSpeaking) {
        root.speechSynthesis?.cancel();
        deviceSpeaking = false;
        refreshUi();
        setStatusBox(root, tr(root, "ttsDeviceStopped"), "");
        return;
      }
      stopAi(false);
      const text = sourceText.value.trim();
      if (!text || !root.speechSynthesis || !root.SpeechSynthesisUtterance) return;
      const utterance = new root.SpeechSynthesisUtterance(text);
      const language = resolveLanguage(root, sourceLanguage, text);
      const catalogItem = (root.LANGUAGE_CATALOG || []).find((item) => item.code === language);
      if (catalogItem?.speech) utterance.lang = catalogItem.speech;
      const voice = matchingDeviceVoice(root, utterance.lang);
      if (voice) utterance.voice = voice;
      utterance.rate = 1.0;
      utterance.onend = () => { deviceSpeaking = false; refreshUi(); };
      utterance.onerror = () => { deviceSpeaking = false; refreshUi(); };
      root.speechSynthesis.cancel();
      root.speechSynthesis.speak(utterance);
      deviceSpeaking = true;
      refreshUi();
      setStatusBox(root, tr(root, "ttsDevicePlaying"), "ok");
    });

    aiButton.addEventListener("click", async () => {
      if (aiRunning) { stopAi(true); return; }
      root.speechSynthesis?.cancel();
      deviceSpeaking = false;
      const text = sourceText.value.trim();
      if (!text) return;
      const language = resolveLanguage(root, sourceLanguage, text);
      if (!language) { setStatusBox(root, tr(root, "ttsLanguageUnknown"), "error"); return; }
      if (!base.isSupportedTtsLanguage(language)) { setStatusBox(root, tr(root, "ttsLanguageUnsupported"), "error"); return; }

      const mode = currentMode(modeGroup);
      const customInstructions = customInstructionsForMode(mode, promptInput.value);
      if (mode === "custom" && !customInstructions) {
        setStatusBox(root, tr(root, "ttsCustomRequired"), "error");
        promptInput.focus();
        return;
      }
      const voice = voiceSelect.value || base.AI_TTS_DEFAULT_VOICE || "marin";
      const chunks = base.splitTextForTts(text);
      if (!chunks.length) return;

      aiRunning = true;
      controller = new AbortController();
      const run = ++runSerial;
      setControlsDisabled(true);
      refreshUi();

      try {
        let completed = 0;
        let generated = 0;
        setStatusBox(root, tr(root, "ttsGenerating", { completed, total: chunks.length }), "");
        const blobs = await mapWithConcurrency(chunks, 3, async (chunk) => {
          const result = await getOrCreateAudio(root, {
            text: chunk,
            language,
            voice,
            mode,
            customInstructions,
            signal: controller.signal,
          });
          if (!result.cached) generated += 1;
          completed += 1;
          if (run === runSerial) setStatusBox(root, tr(root, "ttsGenerating", { completed, total: chunks.length }), "");
          return result.blob;
        });
        if (run !== runSerial || controller.signal.aborted) return;
        setStatusBox(root, tr(root, generated === 0 ? "ttsCacheHit" : "ttsPlaying"), "ok");
        for (const blob of blobs) {
          if (run !== runSerial || controller.signal.aborted) return;
          await playBlob(root, blob, run);
        }
        if (run === runSerial) setStatusBox(root, tr(root, "ttsFinished"), "ok");
      } catch (error) {
        if (error?.name !== "AbortError" && run === runSerial) setStatusBox(root, tr(root, "ttsFailed"), "error");
      } finally {
        if (run === runSerial) {
          aiRunning = false;
          controller = null;
          releaseAudio();
          setControlsDisabled(false);
          refreshUi();
        }
      }
    });

    uiLanguage?.addEventListener("change", () => root.setTimeout(refreshUi, 0));
    refreshUi();

    function syncPromptPanel(mode, focus = false) {
      const custom = normalizeMode(mode) === "custom";
      promptPanel.hidden = !custom;
      if (custom && focus) root.setTimeout(() => promptInput.focus(), 0);
    }

    function setControlsDisabled(disabled) {
      voiceSelect.disabled = disabled;
      promptInput.disabled = disabled;
      modeGroup.querySelectorAll("button").forEach((button) => { button.disabled = disabled; });
    }

    function stopAi(showStatus) {
      if (!aiRunning && !currentAudio) return;
      runSerial += 1;
      controller?.abort();
      controller = null;
      aiRunning = false;
      releaseAudio();
      setControlsDisabled(false);
      refreshUi();
      if (showStatus) setStatusBox(root, tr(root, "ttsStopped"), "");
    }

    function releaseAudio() {
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

    function playBlob(rootObject, blob, run) {
      return new Promise((resolve, reject) => {
        releaseAudio();
        currentAudioUrl = rootObject.URL.createObjectURL(blob);
        currentAudio = new rootObject.Audio(currentAudioUrl);
        currentAudio.onended = () => { releaseAudio(); resolve(); };
        currentAudio.onerror = () => { releaseAudio(); reject(new Error("audio playback failed")); };
        if (run !== runSerial) { releaseAudio(); resolve(); return; }
        currentAudio.play().catch(reject);
      });
    }

    function refreshUi() {
      deviceButton.textContent = `${deviceSpeaking ? "Ⅱ" : "▶"} ${tr(root, "deviceSpeech")}`;
      aiButton.textContent = `${aiRunning ? "■" : "✨"} ${tr(root, "aiSpeech")}`;
      modeLabel.textContent = tr(root, "ttsModeLabel");
      promptInput.placeholder = tr(root, "ttsPromptPlaceholder");
      voiceSelect.setAttribute("aria-label", root.UI_TEXT?.[uiLanguage?.value || "ja"]?.aiVoice || "AI voice");
    }
  }

  function makeButton(root, id, className) {
    const button = root.document.createElement("button");
    button.id = id;
    button.type = "button";
    button.className = className;
    return button;
  }

  function installUiText(root) {
    root.UI_TEXT = root.UI_TEXT || {};
    for (const language of ["ja", "en"]) root.UI_TEXT[language] = { ...(root.UI_TEXT[language] || {}), ...UI[language] };
  }

  function installStyles(root) {
    if (root.document.getElementById("listeningTtsModeStyles")) return;
    const style = root.document.createElement("style");
    style.id = "listeningTtsModeStyles";
    style.textContent = `
      .tts-mode-wrap{display:flex;align-items:center;gap:6px}
      .tts-mode-label{font-size:11px;color:var(--muted);white-space:nowrap}
      .tts-mode-group{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:#fff}
      .tts-mode-button{min-height:32px;padding:0 8px;border:0;border-right:1px solid var(--line);background:#fff;color:var(--muted);font:inherit;font-size:11px;cursor:pointer}
      .tts-mode-button:last-child{border-right:0}
      .tts-mode-button.active{background:var(--text);color:#fff}
      .tts-prompt-panel{flex:1 0 100%;width:100%}
      .tts-prompt-panel[hidden]{display:none!important}
      .tts-prompt-input{box-sizing:border-box;width:100%;min-height:54px;resize:vertical;border:1px solid var(--line);border-radius:8px;padding:8px 10px;background:#fff;color:var(--text);font:inherit;font-size:12px;line-height:1.45}
      @media(max-width:760px){.tts-mode-wrap{flex-wrap:wrap}.tts-mode-label{width:100%}}
    `;
    root.document.head.appendChild(style);
  }

  function currentMode(group) {
    return normalizeMode(group.querySelector(".tts-mode-button.active")?.dataset.ttsMode);
  }

  function setMode(root, group, mode) {
    const normalized = normalizeMode(mode);
    group.querySelectorAll(".tts-mode-button").forEach((button) => {
      const active = button.dataset.ttsMode === normalized;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    root.localStorage?.setItem("annotation.ttsMode", normalized);
    return normalized;
  }

  function resolveLanguage(root, select, text) {
    const selected = String(select?.value || "").trim().toLowerCase().split(/[-_]/, 1)[0];
    if (selected && selected !== "auto") return selected;
    try {
      const fromResult = String(state?.result?.sourceLanguage || "").trim().toLowerCase().split(/[-_]/, 1)[0];
      if (fromResult && fromResult !== "auto") return fromResult;
    } catch {}
    return root.ANNOTATOR_TTS?.inferUnambiguousLanguage(text) || "";
  }

  function matchingDeviceVoice(root, lang) {
    const voices = root.speechSynthesis?.getVoices?.() || [];
    const base = String(lang || "").split("-")[0];
    return voices.find((voice) => voice.lang === lang)
      || voices.find((voice) => voice.lang?.startsWith(`${base}-`))
      || null;
  }

  function tr(root, key, values = {}) {
    const lang = root.document.getElementById("uiLangSelect")?.value || "ja";
    let text = root.UI_TEXT?.[lang]?.[key] || root.UI_TEXT?.en?.[key] || UI.en[key] || key;
    for (const [name, value] of Object.entries(values)) text = String(text).replaceAll(`{${name}}`, String(value));
    return text;
  }

  function setStatusBox(root, message, kind = "") {
    const box = root.document.getElementById("statusBox");
    if (!box) return;
    box.textContent = message;
    box.className = `status ${kind}`.trim();
  }

  async function getOrCreateAudio(root, { text, language, voice, mode, customInstructions, signal }) {
    const effectiveCustom = customInstructionsForMode(mode, customInstructions);
    const material = cacheMaterial({ text, language, model: MODEL, voice, speed: SPEED, mode, customInstructions: effectiveCustom });
    const key = await sha256Hex(root, material);
    const cached = await getCachedAudio(root, key);
    if (cached?.blob) return { blob: cached.blob, cached: true };
    const response = await root.fetch("/api/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, language, voice, model: MODEL, speed: SPEED, mode: normalizeMode(mode), customInstructions: effectiveCustom }),
      signal,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const error = new Error(data.error || "tts_request_failed");
      error.code = data.error || "tts_request_failed";
      throw error;
    }
    const blob = await response.blob();
    await putCachedAudio(root, { key, blob, savedAt: Date.now(), model: MODEL, voice, language, mode: normalizeMode(mode) });
    return { blob, cached: false };
  }

  async function sha256Hex(root, value) {
    const text = String(value || "");
    if (!root.crypto?.subtle || typeof TextEncoder === "undefined") {
      let hash = 2166136261;
      for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
      return `fallback-${text.length}-${(hash >>> 0).toString(16)}`;
    }
    const bytes = new TextEncoder().encode(text);
    const digest = await root.crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function openDb(root) {
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
    const db = await openDb(root);
    if (!db || !db.objectStoreNames.contains(STORE_NAME)) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  }

  async function putCachedAudio(root, entry) {
    const db = await openDb(root);
    if (!db || !db.objectStoreNames.contains(STORE_NAME)) return;
    await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(entry);
      tx.oncomplete = resolve;
      tx.onerror = resolve;
      tx.onabort = resolve;
    });
    void pruneCache(root);
  }

  async function pruneCache(root) {
    const db = await openDb(root);
    if (!db || !db.objectStoreNames.contains(STORE_NAME)) return;
    const entries = await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
    if (entries.length <= MAX_CACHE_ENTRIES) return;
    const remove = entries.sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0)).slice(MAX_CACHE_ENTRIES);
    await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      remove.forEach((entry) => store.delete(entry.key));
      tx.oncomplete = resolve;
      tx.onerror = resolve;
      tx.onabort = resolve;
    });
  }

  async function mapWithConcurrency(items, concurrency, worker) {
    const results = new Array(items.length);
    let next = 0;
    async function run() {
      while (true) {
        const index = next++;
        if (index >= items.length) return;
        results[index] = await worker(items[index], index);
      }
    }
    const count = Math.max(1, Math.min(concurrency, items.length));
    await Promise.all(Array.from({ length: count }, run));
    return results;
  }

  return {
    DEFAULT_MODE,
    MAX_CUSTOM_INSTRUCTIONS,
    MODES,
    PRESET_MODES,
    UI,
    cacheMaterial,
    customInstructionsForMode,
    install,
    normalizeCustomInstructions,
    normalizeMode,
  };
}));
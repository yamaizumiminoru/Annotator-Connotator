const sampleText = `大学に入ったら、専門性・個性・学識を身に付けたい！ そんなあなたには、外国語学部で外国語を学ぶのに加えて、私みたいに日本語を研究することをオススメします！
研究とは、人類の知を広げる活動です。既に誰かが明らかにしたことを学ぶのは、勉強（自分の知を広げること）であって、研究ではありません。まだ誰も明らかにしていないことを明らかにする――これほど明確な専門性と個性があるでしょうか。もちろん、人類の最先端に行くには、それまで明らかになっていることを勉強する必要があり、研究できるほどの知識は立派な学識と言えます。つまり、研究をすれば、専門性も個性も学識も自然に身に付くということです。人類にも貢献できます。
何を研究すればいいかって？ 外国語学部で学ぶ外国語でもいいですが、その言語が相当できるようになる必要があります。それを待っていられなかったら、まずは長年学んできた日本語を研究しましょう。街中で、そして、あなたの頭の中でも、日本語はあなたに解明されるのを待っています。`;

const languageCatalog = window.LANGUAGE_CATALOG || [];
const baseUiText = window.UI_TEXT || {};

const state = {
  level: "intermediate",
  result: null,
  annotationsById: new Map(),
  speaking: false,
  uiLanguage: "ja",
  uiText: baseUiText.ja || {},
};

const typeTextKeys = {
  vocab: "vocab",
  phrase: "expression",
  idiom: "idiom",
  grammar: "grammar",
};

const levelTextKeys = {
  beginner: "beginner",
  intermediate: "intermediate",
  advanced: "advanced",
  academic: "academic",
};

const densityTextKeys = {
  1: "densityLow",
  2: "densityStandard",
  3: "densityHigh",
};

const els = {
  sourceText: document.getElementById("sourceText"),
  sourceLangSelect: document.getElementById("sourceLangSelect"),
  explanationLangSelect: document.getElementById("explanationLangSelect"),
  uiLangSelect: document.getElementById("uiLangSelect"),
  densityRange: document.getElementById("densityRange"),
  densityLabel: document.getElementById("densityLabel"),
  focusSelect: document.getElementById("focusSelect"),
  includeGrammar: document.getElementById("includeGrammar"),
  includeSlash: document.getElementById("includeSlash"),
  annotateBtn: document.getElementById("annotateBtn"),
  sampleBtn: document.getElementById("sampleBtn"),
  clearBtn: document.getElementById("clearBtn"),
  statusBox: document.getElementById("statusBox"),
  annotatedText: document.getElementById("annotatedText"),
  translationText: document.getElementById("translationText"),
  wordList: document.getElementById("wordList"),
  slashText: document.getElementById("slashText"),
  exportText: document.getElementById("exportText"),
  copyJsonBtn: document.getElementById("copyJsonBtn"),
  copyMarkdownBtn: document.getElementById("copyMarkdownBtn"),
  speakBtn: document.getElementById("speakBtn"),
  serverPill: document.getElementById("serverPill"),
  statVocab: document.getElementById("statVocab"),
  statPhrase: document.getElementById("statPhrase"),
  statGrammar: document.getElementById("statGrammar"),
  statLevel: document.getElementById("statLevel"),
  overlay: document.getElementById("overlay"),
  popupClose: document.getElementById("popupClose"),
  popupWord: document.getElementById("popupWord"),
  popupType: document.getElementById("popupType"),
  popupDef: document.getElementById("popupDef"),
  popupNote: document.getElementById("popupNote"),
  popupExample: document.getElementById("popupExample"),
};

function init() {
  populateLanguageSelects();

  els.sourceText.value = localStorage.getItem("annotation.sourceText") || sampleText;
  state.level = localStorage.getItem("annotation.level") || "intermediate";

  const savedDensity = localStorage.getItem("annotation.density");
  if (savedDensity) els.densityRange.value = savedDensity;

  setSelectValue(els.sourceLangSelect, localStorage.getItem("annotation.sourceLanguage") || "auto");
  setSelectValue(els.explanationLangSelect, localStorage.getItem("annotation.explanationLanguage") || "ja");
  setSelectValue(els.uiLangSelect, localStorage.getItem("annotation.uiLanguage") || "ja");

  const savedFocus = localStorage.getItem("annotation.focus");
  if (savedFocus) els.focusSelect.value = savedFocus;
  els.includeGrammar.checked = localStorage.getItem("annotation.includeGrammar") !== "false";
  els.includeSlash.checked = localStorage.getItem("annotation.includeSlash") !== "false";

  document.querySelectorAll(".segment").forEach((button) => {
    button.classList.toggle("active", button.dataset.level === state.level);
    button.addEventListener("click", () => setLevel(button.dataset.level));
  });

  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => showTab(button.dataset.tab));
  });

  els.densityRange.addEventListener("input", updateDensityLabel);
  els.sourceText.addEventListener("input", persistSettings);
  els.sourceLangSelect.addEventListener("change", persistSettings);
  els.explanationLangSelect.addEventListener("change", persistSettings);
  els.uiLangSelect.addEventListener("change", () => applyUiLanguage(els.uiLangSelect.value));
  els.focusSelect.addEventListener("change", persistSettings);
  els.includeGrammar.addEventListener("change", persistSettings);
  els.includeSlash.addEventListener("change", persistSettings);
  els.annotateBtn.addEventListener("click", annotate);
  els.sampleBtn.addEventListener("click", loadSample);
  els.clearBtn.addEventListener("click", clearAll);
  els.copyJsonBtn.addEventListener("click", copyJson);
  els.copyMarkdownBtn.addEventListener("click", copyMarkdown);
  els.speakBtn.addEventListener("click", toggleSpeech);
  els.overlay.addEventListener("click", (event) => {
    if (event.target === els.overlay) closePopup();
  });
  els.popupClose.addEventListener("click", closePopup);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePopup();
  });

  applyUiLanguage(els.uiLangSelect.value, { silent: true });
  renderEmpty();
  checkHealth();
}

function populateLanguageSelects() {
  fillLanguageSelect(els.sourceLangSelect, { includeAuto: true });
  fillLanguageSelect(els.explanationLangSelect, { includeAuto: false });
  fillLanguageSelect(els.uiLangSelect, { includeAuto: false });
}

function fillLanguageSelect(select, { includeAuto }) {
  select.innerHTML = "";
  if (includeAuto) {
    const option = document.createElement("option");
    option.value = "auto";
    option.textContent = t("autoDetect");
    select.appendChild(option);
  }

  for (const language of languageCatalog) {
    const option = document.createElement("option");
    option.value = language.code;
    option.textContent = language.native === language.name
      ? language.name
      : `${language.native} / ${language.name}`;
    select.appendChild(option);
  }
}

function refreshAutoLabel() {
  const option = els.sourceLangSelect.querySelector('option[value="auto"]');
  if (option) option.textContent = t("autoDetect");
}

function setSelectValue(select, value) {
  if ([...select.options].some((option) => option.value === value)) {
    select.value = value;
  }
}

async function applyUiLanguage(languageCode, options = {}) {
  state.uiLanguage = languageCode || "ja";
  localStorage.setItem("annotation.uiLanguage", state.uiLanguage);

  if (baseUiText[state.uiLanguage]) {
    state.uiText = baseUiText[state.uiLanguage];
    updateUiText();
    return;
  }

  const cached = readCachedUiText(state.uiLanguage);
  if (cached) {
    state.uiText = { ...baseUiText.en, ...cached };
    updateUiText();
    return;
  }

  state.uiText = baseUiText.en || baseUiText.ja || {};
  updateUiText();
  if (!options.silent) setStatus(t("uiTranslating"), "");

  try {
    const response = await fetch("/api/ui-translations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        language: state.uiLanguage,
        strings: baseUiText.en || baseUiText.ja,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.strings) throw new Error(data.message || "translation failed");
    state.uiText = { ...baseUiText.en, ...data.strings };
    localStorage.setItem(`annotation.uiText.${state.uiLanguage}`, JSON.stringify(data.strings));
    updateUiText();
  } catch {
    state.uiText = baseUiText.ja || baseUiText.en || {};
    setSelectValue(els.uiLangSelect, "ja");
    state.uiLanguage = "ja";
    updateUiText();
    if (!options.silent) setStatus(t("uiTranslationFailed"), "error");
  }
}

function readCachedUiText(languageCode) {
  try {
    return JSON.parse(localStorage.getItem(`annotation.uiText.${languageCode}`) || "");
  } catch {
    return null;
  }
}

function updateUiText() {
  document.title = t("documentTitle");
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((node) => {
    node.setAttribute("title", t(node.dataset.i18nTitle));
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((node) => {
    node.setAttribute("aria-label", t(node.dataset.i18nAria));
  });
  refreshAutoLabel();
  updateDensityLabel(false);
  updateStats();
  if (state.result) {
    renderWordList();
    renderTranslation();
    renderExportJson();
  } else {
    renderEmpty();
  }
}

function t(key, values = {}) {
  const fallback = baseUiText.ja || baseUiText.en || {};
  const english = baseUiText.en || fallback;
  let text = state.uiText[key] || english[key] || fallback[key] || key;
  for (const [name, value] of Object.entries(values)) {
    text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}

function setLevel(level) {
  state.level = level;
  document.querySelectorAll(".segment").forEach((button) => {
    button.classList.toggle("active", button.dataset.level === state.level);
  });
  persistSettings();
  updateStats();
}

function persistSettings() {
  localStorage.setItem("annotation.sourceText", els.sourceText.value);
  localStorage.setItem("annotation.level", state.level);
  localStorage.setItem("annotation.density", els.densityRange.value);
  localStorage.setItem("annotation.sourceLanguage", els.sourceLangSelect.value);
  localStorage.setItem("annotation.explanationLanguage", els.explanationLangSelect.value);
  localStorage.setItem("annotation.uiLanguage", els.uiLangSelect.value);
  localStorage.setItem("annotation.focus", els.focusSelect.value);
  localStorage.setItem("annotation.includeGrammar", String(els.includeGrammar.checked));
  localStorage.setItem("annotation.includeSlash", String(els.includeSlash.checked));
}

function updateDensityLabel(shouldPersist = true) {
  els.densityLabel.textContent = t(densityTextKeys[els.densityRange.value] || "densityStandard");
  if (shouldPersist) persistSettings();
}

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    els.serverPill.textContent = data.openaiConfigured ? "LLM ready" : "key needed";
    els.serverPill.classList.toggle("ready", data.openaiConfigured);
    els.serverPill.classList.toggle("missing", !data.openaiConfigured);
    if (!data.openaiConfigured) {
      setStatus(t("serverKeyNeeded"), "error");
    } else {
      setStatus(t("modelReady", { model: data.model }), "ok");
    }
  } catch {
    els.serverPill.textContent = "offline";
    els.serverPill.classList.add("missing");
    setStatus(t("serverOffline"), "error");
  }
}

async function annotate() {
  const text = els.sourceText.value.trim();
  if (!text) {
    setStatus(t("enterText"), "error");
    return;
  }
  persistSettings();
  setBusy(true);
  setStatus(t("analyzingStatus"), "");

  try {
    const response = await fetch("/api/annotate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text,
        sourceLanguage: els.sourceLangSelect.value,
        explanationLanguage: els.explanationLangSelect.value,
        uiLanguage: els.uiLangSelect.value,
        level: state.level,
        density: Number(els.densityRange.value),
        focus: els.focusSelect.value,
        includeGrammar: els.includeGrammar.checked,
        includeSlash: els.includeSlash.checked,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (data.error === "missing_api_key") throw new Error(t("apiKeyRequired"));
      throw new Error(data.message || data.error || "annotation failed");
    }

    state.result = normalizeResult(data, text);
    renderResult();
    setStatus(t("extracted", { count: state.result.annotations.length }), "ok");
    showTab("annotated");
  } catch (error) {
    setStatus(String(error.message || error), "error");
  } finally {
    setBusy(false);
  }
}

function normalizeResult(data, fallbackText) {
  const annotations = Array.isArray(data.annotations) ? data.annotations : [];
  const normalized = annotations
    .map((item, index) => ({
      id: item.id || `a${index + 1}`,
      text: String(item.text || "").trim(),
      type: normalizeType(item.type),
      meaningJa: String(item.meaningJa || item.meaning || "").trim(),
      noteJa: String(item.noteJa || item.note || "").trim(),
      example: String(item.example || "").trim(),
      start: Number.isInteger(item.start) ? item.start : null,
      end: Number.isInteger(item.end) ? item.end : null,
    }))
    .filter((item) => item.text && item.meaningJa);

  return {
    sourceText: String(data.sourceText || fallbackText),
    sourceLanguage: data.sourceLanguage || els.sourceLangSelect.value,
    explanationLanguage: data.explanationLanguage || els.explanationLangSelect.value,
    uiLanguage: els.uiLangSelect.value,
    level: data.level || state.level,
    summaryJa: String(data.summaryJa || ""),
    translation: String(data.translation || data.translationText || ""),
    annotations: normalized,
    slashReading: Array.isArray(data.slashReading) ? data.slashReading : [],
  };
}

function normalizeType(type) {
  if (["vocab", "phrase", "idiom", "grammar"].includes(type)) return type;
  return "vocab";
}

function renderResult() {
  state.annotationsById = new Map(state.result.annotations.map((item) => [item.id, item]));
  renderAnnotatedText();
  renderTranslation();
  renderWordList();
  renderSlashText();
  renderExportJson();
  updateStats();
}

function renderAnnotatedText() {
  const text = state.result.sourceText;
  const spans = buildHighlightSpans(text, state.result.annotations);
  els.annotatedText.classList.remove("empty");
  els.annotatedText.innerHTML = "";

  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) appendText(els.annotatedText, text.slice(cursor, span.start));
    const mark = document.createElement("span");
    mark.className = `hl hl-${span.item.type}`;
    mark.dataset.id = span.item.id;
    mark.textContent = text.slice(span.start, span.end);
    mark.addEventListener("click", () => openPopup(span.item.id));
    els.annotatedText.appendChild(mark);
    cursor = span.end;
  }
  if (cursor < text.length) appendText(els.annotatedText, text.slice(cursor));
}

function renderTranslation() {
  const translation = state.result?.translation || "";
  els.translationText.classList.toggle("empty", !translation);
  els.translationText.textContent = translation || t("translationEmpty");
}

function buildHighlightSpans(text, annotations) {
  const occupied = [];
  return annotations
    .map((item) => {
      const located = locateAnnotation(text, item, occupied);
      return located ? { ...located, item } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
}

function locateAnnotation(text, item, occupied) {
  const candidates = [];
  if (Number.isInteger(item.start) && Number.isInteger(item.end)) {
    candidates.push([item.start, item.end]);
  }
  const exact = text.indexOf(item.text);
  if (exact >= 0) candidates.push([exact, exact + item.text.length]);
  const lowerExact = text.toLowerCase().indexOf(item.text.toLowerCase());
  if (lowerExact >= 0) candidates.push([lowerExact, lowerExact + item.text.length]);

  for (const [start, end] of candidates) {
    if (start < 0 || end <= start || end > text.length) continue;
    const actual = text.slice(start, end);
    if (actual !== item.text && actual.toLowerCase() !== item.text.toLowerCase()) continue;
    if (occupied.some((range) => start < range.end && end > range.start)) continue;
    occupied.push({ start, end });
    return { start, end };
  }
  return null;
}

function appendText(parent, text) {
  const parts = text.split(/(\n+)/);
  for (const part of parts) {
    if (!part) continue;
    if (/^\n+$/.test(part)) {
      for (let i = 0; i < part.length; i += 1) parent.appendChild(document.createElement("br"));
    } else {
      parent.appendChild(document.createTextNode(part));
    }
  }
}

function renderWordList() {
  els.wordList.innerHTML = "";
  if (!state.result.annotations.length) {
    els.wordList.appendChild(emptyCard(t("emptyWords")));
    return;
  }

  for (const item of state.result.annotations) {
    const card = document.createElement("article");
    card.className = "word-card";
    card.innerHTML = `
      <div class="word-card-head">
        <h3></h3>
        <span class="badge ${item.type}"></span>
      </div>
      <p class="meaning"></p>
      <p class="note"></p>
      <p class="example"></p>
    `;
    card.querySelector("h3").textContent = item.text;
    card.querySelector(".badge").textContent = t(typeTextKeys[item.type]);
    card.querySelector(".meaning").textContent = item.meaningJa;
    card.querySelector(".note").textContent = item.noteJa;
    card.querySelector(".example").textContent = item.example ? `${t("examplePrefix")}${item.example}` : "";
    card.addEventListener("click", () => openPopup(item.id));
    els.wordList.appendChild(card);
  }
}

function renderSlashText() {
  els.slashText.innerHTML = "";
  const slash = state.result.slashReading;
  if (!slash.length) {
    els.slashText.classList.add("empty");
    els.slashText.textContent = t("slashEmpty");
    return;
  }
  els.slashText.classList.remove("empty");
  slash.forEach((chunk, index) => {
    if (index > 0) {
      const mark = document.createElement("span");
      mark.className = "slash";
      mark.textContent = "/";
      els.slashText.appendChild(mark);
    }
    els.slashText.appendChild(document.createTextNode(chunk));
    els.slashText.appendChild(document.createTextNode(" "));
  });
}

function renderExportJson() {
  els.exportText.value = JSON.stringify(state.result, null, 2);
}

function updateStats() {
  const items = state.result?.annotations || [];
  els.statVocab.textContent = items.filter((item) => item.type === "vocab").length;
  els.statPhrase.textContent = items.filter((item) => item.type === "phrase" || item.type === "idiom").length;
  els.statGrammar.textContent = items.filter((item) => item.type === "grammar").length;
  els.statLevel.textContent = t(levelTextKeys[state.level] || "intermediate");
}

function openPopup(id) {
  const item = state.annotationsById.get(id);
  if (!item) return;
  els.popupWord.textContent = item.text;
  els.popupType.textContent = t(typeTextKeys[item.type]);
  els.popupType.className = `popup-type badge ${item.type}`;
  els.popupDef.textContent = item.meaningJa;
  els.popupNote.textContent = item.noteJa;
  els.popupExample.textContent = item.example ? `${t("examplePrefix")}${item.example}` : "";
  els.overlay.classList.add("show");
}

function closePopup() {
  els.overlay.classList.remove("show");
}

function showTab(name) {
  document.querySelectorAll(".tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === name);
  });
  document.querySelectorAll(".panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `panel-${name}`);
  });
}

function setBusy(isBusy) {
  els.annotateBtn.disabled = isBusy;
  const label = els.annotateBtn.querySelector("[data-i18n]");
  if (label) label.textContent = isBusy ? t("analyzing") : t("analyze");
}

function setStatus(message, kind) {
  els.statusBox.textContent = message;
  els.statusBox.className = `status ${kind || ""}`.trim();
}

function renderEmpty() {
  els.annotatedText.classList.add("empty");
  els.annotatedText.textContent = t("emptyAnnotated");
  els.translationText.classList.add("empty");
  els.translationText.textContent = t("translationEmpty");
  els.wordList.innerHTML = "";
  els.wordList.appendChild(emptyCard(t("emptyWords")));
  els.slashText.classList.add("empty");
  els.slashText.textContent = t("slashEmpty");
  els.exportText.value = "";
  updateStats();
}

function emptyCard(text) {
  const card = document.createElement("article");
  card.className = "word-card";
  card.textContent = text;
  return card;
}

function loadSample() {
  els.sourceText.value = sampleText;
  els.sourceLangSelect.value = "ja";
  persistSettings();
  setStatus(t("sampleLoaded"), "ok");
}

function clearAll() {
  els.sourceText.value = "";
  state.result = null;
  persistSettings();
  renderEmpty();
  setStatus(t("cleared"), "");
}

async function copyJson() {
  if (!state.result) return;
  await navigator.clipboard.writeText(JSON.stringify(state.result, null, 2));
  setStatus(t("jsonCopied"), "ok");
}

async function copyMarkdown() {
  if (!state.result) return;
  const lines = [
    "# Language Annotation",
    "",
    "## Text",
    state.result.sourceText,
    "",
    `${t("sourceLanguageExport")}: ${languageLabel(state.result.sourceLanguage)}`,
    `${t("explanationLanguageExport")}: ${languageLabel(state.result.explanationLanguage)}`,
    `${t("uiLanguageExport")}: ${languageLabel(state.result.uiLanguage)}`,
    "",
    `## ${t("translationTitle")}`,
    state.result.translation || "",
    "",
    "## Annotations",
    ...state.result.annotations.map((item) => `- **${item.text}** (${t(typeTextKeys[item.type])}): ${item.meaningJa}${item.noteJa ? ` / ${item.noteJa}` : ""}`),
  ];
  await navigator.clipboard.writeText(lines.join("\n"));
  els.exportText.value = lines.join("\n");
  setStatus(t("markdownCopied"), "ok");
}

function languageLabel(code) {
  if (code === "auto") return t("autoDetect");
  const language = languageCatalog.find((item) => item.code === code);
  if (!language) return code || "";
  return language.native === language.name ? language.name : `${language.native} / ${language.name}`;
}

function speechLanguage(code) {
  const language = languageCatalog.find((item) => item.code === code);
  return language?.speech || "en-US";
}

function resolvedSpeechLanguage() {
  const selected = els.sourceLangSelect.value;
  if (selected && selected !== "auto") return speechLanguage(selected);
  const detected = state.result?.sourceLanguage;
  if (detected && detected !== "auto") return speechLanguage(detected);
  return inferSpeechLanguage(els.sourceText.value);
}

function inferSpeechLanguage(text) {
  if (/[\u3040-\u30ff]/.test(text)) return speechLanguage("ja");
  if (/[\uac00-\ud7af]/.test(text)) return speechLanguage("ko");
  if (/[\u4e00-\u9fff]/.test(text)) return speechLanguage("zh");
  return speechLanguage("en");
}

function matchingVoice(lang) {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  const base = lang.split("-")[0];
  return voices.find((voice) => voice.lang === lang)
    || voices.find((voice) => voice.lang?.startsWith(`${base}-`))
    || null;
}

function toggleSpeech() {
  if (!window.speechSynthesis) {
    setStatus(t("speechUnsupported"), "error");
    return;
  }
  if (state.speaking) {
    window.speechSynthesis.cancel();
    state.speaking = false;
    els.speakBtn.textContent = "▶";
    return;
  }
  const text = els.sourceText.value.trim();
  if (!text) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = resolvedSpeechLanguage();
  const voice = matchingVoice(utterance.lang);
  if (voice) utterance.voice = voice;
  utterance.rate = 0.86;
  utterance.onend = () => {
    state.speaking = false;
    els.speakBtn.textContent = "▶";
  };
  window.speechSynthesis.speak(utterance);
  state.speaking = true;
  els.speakBtn.textContent = "Ⅱ";
}

init();

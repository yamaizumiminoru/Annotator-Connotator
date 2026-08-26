const sampleText = `大学に入ったら、専門性・個性・学識を身に付けたい！ そんなあなたには、外国語学部で外国語を学ぶのに加えて、私みたいに日本語を研究することをオススメします！
研究とは、人類の知を広げる活動です。既に誰かが明らかにしたことを学ぶのは、勉強（自分の知を広げること）であって、研究ではありません。まだ誰も明らかにしていないことを明らかにする――これほど明確な専門性と個性があるでしょうか。もちろん、人類の最先端に行くには、それまで明らかになっていることを勉強する必要があり、研究できるほどの知識は立派な学識と言えます。つまり、研究をすれば、専門性も個性も学識も自然に身に付くということです。人類にも貢献できます。
何を研究すればいいかって？ 外国語学部で学ぶ外国語でもいいですが、その言語が相当できるようになる必要があります。それを待っていられなかったら、まずは長年学んできた日本語を研究しましょう。街中で、そして、あなたの頭の中でも、日本語はあなたに解明されるのを待っています。`;

const languageCatalog = window.LANGUAGE_CATALOG || [];
const baseUiText = window.UI_TEXT || {};
const cardPresentation = window.CARD_PRESENTATION;
const analysisCore = window.ANALYSIS_CORE;
const clientAnalysis = window.CLIENT_ANALYSIS;
const uiTextCacheVersion = "5";

const state = {
  level: "intermediate",
  result: null,
  annotationsById: new Map(),
  connotationsById: new Map(),
  connotationsByAnnotationId: new Map(),
  speaking: false,
  uiLanguage: "ja",
  uiText: baseUiText.ja || {},
  inputMode: "text",
  analysisMode: "standard",
  analysisController: null,
};

const typeTextKeys = {
  word: "wordType",
  collocation: "collocationType",
  formula: "formulaType",
  construction: "constructionType",
  idiom: "idiom",
  term: "termType",
};

const levelTextKeys = {
  beginner: "beginner",
  intermediate: "intermediate",
  advanced: "advanced",
};

const densityTextKeys = {
  1: "densityLow",
  2: "densityStandard",
  3: "densityHigh",
};

const nuanceTextKeys = {
  1: "nuanceLow",
  2: "nuanceStandard",
  3: "nuanceHigh",
};

const connotationCategoryValues = [
  "evaluative",
  "stance",
  "politeness",
  "implicature",
  "presupposition",
  "register",
  "irony",
  "euphemism",
];

const els = {
  sourceText: document.getElementById("sourceText"),
  youtubeImportPanel: document.getElementById("youtubeImportPanel"),
  youtubeUrl: document.getElementById("youtubeUrl"),
  youtubeImportBtn: document.getElementById("youtubeImportBtn"),
  youtubeCorrect: document.getElementById("youtubeCorrect"),
  youtubeMeta: document.getElementById("youtubeMeta"),
  sourceLangSelect: document.getElementById("sourceLangSelect"),
  explanationLangSelect: document.getElementById("explanationLangSelect"),
  uiLangSelect: document.getElementById("uiLangSelect"),
  densityRange: document.getElementById("densityRange"),
  densityLabel: document.getElementById("densityLabel"),
  nuanceRange: document.getElementById("nuanceRange"),
  nuanceLabel: document.getElementById("nuanceLabel"),
  focusSelect: document.getElementById("focusSelect"),
  includeGrammar: document.getElementById("includeGrammar"),
  includeSlash: document.getElementById("includeSlash"),
  includeTranslation: document.getElementById("includeTranslation"),
  annotateBtn: document.getElementById("annotateBtn"),
  cancelAnalyzeBtn: document.getElementById("cancelAnalyzeBtn"),
  sampleBtn: document.getElementById("sampleBtn"),
  clearBtn: document.getElementById("clearBtn"),
  statusBox: document.getElementById("statusBox"),
  annotatedText: document.getElementById("annotatedText"),
  inlineNuancePanel: document.getElementById("inlineNuancePanel"),
  inlineNuanceCount: document.getElementById("inlineNuanceCount"),
  inlineNuanceList: document.getElementById("inlineNuanceList"),
  translationCard: document.getElementById("translationCard"),
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
  statNuance: document.getElementById("statNuance"),
  statLevel: document.getElementById("statLevel"),
  categoryGlossaryBtn: document.getElementById("categoryGlossaryBtn"),
  overlay: document.getElementById("overlay"),
  popupClose: document.getElementById("popupClose"),
  popupWord: document.getElementById("popupWord"),
  popupType: document.getElementById("popupType"),
  popupDef: document.getElementById("popupDef"),
  popupPattern: document.getElementById("popupPattern"),
  popupNote: document.getElementById("popupNote"),
  popupExample: document.getElementById("popupExample"),
  popupNuances: document.getElementById("popupNuances"),
};

function init() {
  populateLanguageSelects();

  els.sourceText.value = localStorage.getItem("annotation.sourceText") || sampleText;
  els.youtubeUrl.value = localStorage.getItem("annotation.youtubeUrl") || "";
  els.youtubeCorrect.checked = localStorage.getItem("annotation.youtubeCorrect") !== "false";
  const savedLevel = localStorage.getItem("annotation.level") || "intermediate";
  state.level = savedLevel === "academic" ? "advanced" : savedLevel;
  state.analysisMode = localStorage.getItem("annotation.analysisMode") === "precise"
    ? "precise"
    : "standard";

  const savedDensity = localStorage.getItem("annotation.density");
  if (savedDensity) els.densityRange.value = savedDensity;
  const savedNuanceDetail = localStorage.getItem("annotation.nuanceDetail");
  if (savedNuanceDetail) els.nuanceRange.value = savedNuanceDetail;

  setSelectValue(els.sourceLangSelect, localStorage.getItem("annotation.sourceLanguage") || "auto");
  setSelectValue(els.explanationLangSelect, localStorage.getItem("annotation.explanationLanguage") || "ja");
  setSelectValue(els.uiLangSelect, localStorage.getItem("annotation.uiLanguage") || "ja");

  const savedFocus = localStorage.getItem("annotation.focus");
  els.focusSelect.value = ["balanced", "grammar"].includes(savedFocus) ? "all" : (savedFocus || "all");
  els.includeGrammar.checked = localStorage.getItem("annotation.includeGrammar") !== "false";
  els.includeSlash.checked = localStorage.getItem("annotation.includeSlash") !== "false";
  els.includeTranslation.checked = localStorage.getItem("annotation.includeTranslation") === "true";

  document.querySelectorAll(".segment").forEach((button) => {
    if (!button.dataset.level) return;
    button.classList.toggle("active", button.dataset.level === state.level);
    button.addEventListener("click", () => setLevel(button.dataset.level));
  });

  document.querySelectorAll(".analysis-mode-segment").forEach((button) => {
    button.classList.toggle("active", button.dataset.analysisMode === state.analysisMode);
    button.addEventListener("click", () => setAnalysisMode(button.dataset.analysisMode));
  });

  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => showTab(button.dataset.tab));
  });

  document.querySelectorAll(".input-mode-tab").forEach((button) => {
    button.addEventListener("click", () => setInputMode(button.dataset.inputMode));
  });

  els.densityRange.addEventListener("input", updateDensityLabel);
  els.nuanceRange.addEventListener("input", updateNuanceLabel);
  els.sourceText.addEventListener("input", persistSettings);
  els.youtubeUrl.addEventListener("input", persistSettings);
  els.youtubeCorrect.addEventListener("change", persistSettings);
  els.youtubeImportBtn.addEventListener("click", importYouTubeTranscript);
  els.youtubeUrl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") importYouTubeTranscript();
  });
  els.sourceLangSelect.addEventListener("change", persistSettings);
  els.explanationLangSelect.addEventListener("change", persistSettings);
  els.uiLangSelect.addEventListener("change", () => applyUiLanguage(els.uiLangSelect.value));
  els.focusSelect.addEventListener("change", persistSettings);
  els.includeGrammar.addEventListener("change", persistSettings);
  els.includeSlash.addEventListener("change", persistSettings);
  els.includeTranslation.addEventListener("change", () => {
    persistSettings();
    renderTranslation();
  });
  els.annotateBtn.addEventListener("click", annotate);
  els.cancelAnalyzeBtn.addEventListener("click", cancelAnalysis);
  els.sampleBtn.addEventListener("click", loadSample);
  els.clearBtn.addEventListener("click", clearAll);
  els.copyJsonBtn.addEventListener("click", copyJson);
  els.copyMarkdownBtn.addEventListener("click", copyMarkdown);
  els.speakBtn.addEventListener("click", toggleSpeech);
  els.categoryGlossaryBtn.addEventListener("click", openCategoryGlossary);
  els.overlay.addEventListener("click", (event) => {
    if (event.target === els.overlay) closePopup();
  });
  els.popupClose.addEventListener("click", closePopup);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePopup();
  });

  applyUiLanguage(els.uiLangSelect.value, { silent: true });
  setInputMode(localStorage.getItem("annotation.inputMode") || "text", false);
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
    localStorage.setItem(`annotation.uiText.${uiTextCacheVersion}.${state.uiLanguage}`, JSON.stringify(data.strings));
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
    return JSON.parse(localStorage.getItem(`annotation.uiText.${uiTextCacheVersion}.${languageCode}`) || "");
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
  updateNuanceLabel(false);
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
    if (!button.dataset.level) return;
    button.classList.toggle("active", button.dataset.level === state.level);
  });
  persistSettings();
  updateStats();
}

function setAnalysisMode(mode) {
  state.analysisMode = mode === "precise" ? "precise" : "standard";
  document.querySelectorAll(".analysis-mode-segment").forEach((button) => {
    button.classList.toggle("active", button.dataset.analysisMode === state.analysisMode);
  });
  persistSettings();
}

function persistSettings() {
  localStorage.setItem("annotation.sourceText", els.sourceText.value);
  localStorage.setItem("annotation.youtubeUrl", els.youtubeUrl.value);
  localStorage.setItem("annotation.youtubeCorrect", String(els.youtubeCorrect.checked));
  localStorage.setItem("annotation.inputMode", state.inputMode);
  localStorage.setItem("annotation.level", state.level);
  localStorage.setItem("annotation.analysisMode", state.analysisMode);
  localStorage.setItem("annotation.density", els.densityRange.value);
  localStorage.setItem("annotation.nuanceDetail", els.nuanceRange.value);
  localStorage.setItem("annotation.sourceLanguage", els.sourceLangSelect.value);
  localStorage.setItem("annotation.explanationLanguage", els.explanationLangSelect.value);
  localStorage.setItem("annotation.uiLanguage", els.uiLangSelect.value);
  localStorage.setItem("annotation.focus", els.focusSelect.value);
  localStorage.setItem("annotation.includeGrammar", String(els.includeGrammar.checked));
  localStorage.setItem("annotation.includeSlash", String(els.includeSlash.checked));
  localStorage.setItem("annotation.includeTranslation", String(els.includeTranslation.checked));
}

function updateDensityLabel(shouldPersist = true) {
  els.densityLabel.textContent = t(densityTextKeys[els.densityRange.value] || "densityStandard");
  if (shouldPersist) persistSettings();
}

function updateNuanceLabel(shouldPersist = true) {
  els.nuanceLabel.textContent = t(nuanceTextKeys[els.nuanceRange.value] || "nuanceStandard");
  if (shouldPersist) persistSettings();
  if (state.result) {
    renderAnnotatedText();
    renderInlineNuanceList();
    renderWordList();
    closePopup();
  }
}

function setInputMode(mode, shouldPersist = true) {
  state.inputMode = mode === "youtube" ? "youtube" : "text";
  document.querySelectorAll(".input-mode-tab").forEach((button) => {
    const active = button.dataset.inputMode === state.inputMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  els.youtubeImportPanel.hidden = state.inputMode !== "youtube";
  if (shouldPersist) persistSettings();
}

async function importYouTubeTranscript() {
  const url = els.youtubeUrl.value.trim();
  if (!url) {
    setStatus(t("youtubeUrlRequired"), "error");
    return;
  }

  persistSettings();
  els.youtubeImportBtn.disabled = true;
  els.youtubeImportBtn.textContent = t("youtubeImporting");
  setStatus(t("youtubeImportStatus"), "");

  try {
    const response = await fetch("/api/youtube-transcript", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url,
        sourceLanguage: els.sourceLangSelect.value,
        correctWithAi: els.youtubeCorrect.checked,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || t(youtubeErrorTextKey(data.error)));
      error.code = data.error;
      throw error;
    }

    els.sourceText.value = data.transcript;
    const sourceCode = normalizeCaptionLanguageCode(data.languageCode);
    if ([...els.sourceLangSelect.options].some((option) => option.value === sourceCode)) {
      els.sourceLangSelect.value = sourceCode;
    }
    state.result = null;
    renderEmpty();
    persistSettings();

    const kind = data.isGenerated ? t("captionAuto") : t("captionManual");
    els.youtubeMeta.textContent = [data.title, data.language, kind].filter(Boolean).join(" · ");
    els.youtubeMeta.hidden = false;
    const correction = t({
      applied: "youtubeCorrectionApplied",
      failed: "youtubeCorrectionFailed",
      skipped: "youtubeCorrectionSkipped",
    }[data.correctionStatus] || "youtubeCorrectionSkipped");
    setStatus(t("youtubeImported", {
      title: data.title || "YouTube",
      chars: data.transcript.length,
      correction,
    }), data.correctionStatus === "failed" ? "" : "ok");
  } catch (error) {
    setStatus(error.code ? t(youtubeErrorTextKey(error.code)) : String(error.message || error), "error");
  } finally {
    els.youtubeImportBtn.disabled = false;
    els.youtubeImportBtn.textContent = t("youtubeImport");
  }
}

function youtubeErrorTextKey(code) {
  return {
    invalid_youtube_url: "youtubeUrlRequired",
    youtube_no_captions: "youtubeNoCaptions",
    youtube_blocked: "youtubeBlocked",
    youtube_unavailable: "youtubeUnavailable",
  }[code] || "youtubeImportFailed";
}

function normalizeCaptionLanguageCode(code) {
  const normalized = String(code || "").toLowerCase().replace("_", "-");
  if (normalized === "iw") return "he";
  const base = normalized.split("-")[0];
  return languageCatalog.some((language) => language.code === normalized) ? normalized : base;
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
      const models = data.models || { standard: data.model, precise: data.model };
      setStatus(t("modelsReady", {
        standard: models.standard,
        precise: models.precise,
      }), "ok");
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
  const controller = new AbortController();
  state.analysisController = controller;
  setBusy(true);
  setStatus(t("analyzingStatus"), "");

  try {
    const useProgressStream = text.length > analysisCore.LONG_FORM_THRESHOLD;
    const response = await fetch("/api/annotate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        text,
        sourceLanguage: els.sourceLangSelect.value,
        explanationLanguage: els.explanationLangSelect.value,
        uiLanguage: els.uiLangSelect.value,
        analysisMode: state.analysisMode,
        level: state.level,
        density: Number(els.densityRange.value),
        focus: els.focusSelect.value,
        includeGrammar: els.includeGrammar.checked,
        includeSlash: els.includeSlash.checked,
        includeTranslation: els.includeTranslation.checked,
        streamProgress: useProgressStream,
      }),
    });

    let data;
    if (response.headers.get("content-type")?.includes("application/x-ndjson")) {
      data = await clientAnalysis.readProgressResponse(response, (progress) => {
        if (progress.stage === "merging") {
          setStatus(t("mergingSections"), "");
        } else {
          setStatus(t("analyzingChunk", { current: progress.current, total: progress.total }), "");
        }
      });
    } else {
      data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data.error === "missing_api_key") throw new Error(t("apiKeyRequired"));
        const requestError = new Error(data.message || data.error || "annotation failed");
        Object.assign(requestError, data);
        throw requestError;
      }
    }

    state.result = normalizeResult(data, text);
    renderResult();
    setStatus(t("extracted", {
      count: state.result.annotations.length,
      nuances: state.result.connotations.length,
    }), "ok");
    showTab("annotated");
  } catch (error) {
    if (clientAnalysis.isCancellation(error, controller.signal)) {
      setStatus(t("analysisCancelled"), "");
    } else if (error.error === "long_form_partial_failure") {
      setStatus(t("analysisPartialFailure", {
        completed: error.completedChunks || 0,
        total: error.totalChunks || "?",
      }), "error");
    } else {
      setStatus(String(error.message || error), "error");
    }
  } finally {
    if (state.analysisController === controller) {
      state.analysisController = null;
      setBusy(false);
    }
  }
}

function cancelAnalysis() {
  if (!state.analysisController) return;
  els.cancelAnalyzeBtn.disabled = true;
  setStatus(t("analysisCancelling"), "");
  state.analysisController.abort();
}

function normalizeResult(data, fallbackText) {
  const annotations = Array.isArray(data.annotations) ? data.annotations : [];
  const connotations = Array.isArray(data.connotations) ? data.connotations : [];
  const normalized = annotations
    .map((item, index) => {
      const text = String(item.text || "").trim();
      return {
        id: item.id || `a${index + 1}`,
        text,
        type: normalizeType(item.type),
        meaningJa: String(item.meaningJa || item.meaning || "").trim(),
        noteJa: String(item.noteJa || item.note || "").trim(),
        example: String(item.example || "").trim(),
        pattern: String(item.pattern || "").trim(),
        coreRanges: cardPresentation.resolveCoreRanges(text, item.pattern, item.coreRanges),
        start: Number.isInteger(item.start) ? item.start : null,
        end: Number.isInteger(item.end) ? item.end : null,
      };
    })
    .filter((item) => item.text && item.meaningJa);

  const normalizedConnotations = connotations
    .map((item, index) => ({
      id: item.id || `c${index + 1}`,
      text: String(item.text || ""),
      start: Number.isInteger(item.start) ? item.start : null,
      end: Number.isInteger(item.end) ? item.end : null,
      scope: normalizeConnotationScope(item.scope),
      category: normalizeConnotationCategory(item.category),
      secondaryCategories: normalizeStringArray(item.secondaryCategories)
        .filter((category) => connotationCategoryValues.includes(category))
        .filter((category, categoryIndex, categories) => (
          category !== normalizeConnotationCategory(item.category)
          && categories.indexOf(category) === categoryIndex
        )),
      subtype: String(item.subtype || "unspecified").trim() || "unspecified",
      literalMeaning: String(item.literalMeaning || "").trim(),
      suggestedMeaning: String(item.suggestedMeaning || "").trim(),
      pragmaticEffect: String(item.pragmaticEffect || "").trim(),
      contextNote: String(item.contextNote || "").trim(),
      confidence: ["high", "medium", "low"].includes(item.confidence) ? item.confidence : "medium",
      alternatives: normalizeStringArray(item.alternatives),
      evidence: normalizeStringArray(item.evidence),
      conventionality: ["conventional", "contextual", "mixed"].includes(item.conventionality)
        ? item.conventionality
        : "contextual",
    }))
    .filter((item) => item.text && item.suggestedMeaning);

  return {
    sourceText: String(data.sourceText || fallbackText),
    sourceLanguage: data.sourceLanguage || els.sourceLangSelect.value,
    explanationLanguage: data.explanationLanguage || els.explanationLangSelect.value,
    uiLanguage: els.uiLangSelect.value,
    level: data.level || state.level,
    summaryJa: String(data.summaryJa || ""),
    translation: String(data.translation || data.translationText || ""),
    annotations: normalized,
    connotations: normalizedConnotations,
    slashReading: Array.isArray(data.slashReading) ? data.slashReading : [],
  };
}

function normalizeType(type) {
  return cardPresentation.normalizeAnnotationType(type);
}

function normalizeConnotationScope(scope) {
  return ["span", "sentence", "utterance", "passage"].includes(scope) ? scope : "span";
}

function normalizeConnotationCategory(category) {
  return connotationCategoryValues.includes(category) ? category : "stance";
}

function normalizeStringArray(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function renderResult() {
  state.annotationsById = new Map(state.result.annotations.map((item) => [item.id, item]));
  state.connotationsById = new Map(state.result.connotations.map((item) => [item.id, item]));
  state.connotationsByAnnotationId = assignConnotationsToAnnotations(
    state.result.annotations,
    state.result.connotations,
  );
  renderAnnotatedText();
  renderInlineNuanceList();
  renderTranslation();
  renderWordList();
  renderSlashText();
  renderExportJson();
  updateStats();
}

function renderAnnotatedText() {
  const text = state.result.sourceText;
  const annotationSpans = buildHighlightSpans(text, state.result.annotations);
  const nuanceSpans = state.result.connotations.filter((item) => (
    Number.isInteger(item.start)
    && Number.isInteger(item.end)
    && item.start >= 0
    && item.end > item.start
    && item.end <= text.length
  ));
  els.annotatedText.classList.remove("empty");
  els.annotatedText.innerHTML = "";

  const boundaries = new Set([0, text.length]);
  for (const span of [...annotationSpans, ...nuanceSpans]) {
    boundaries.add(span.start);
    boundaries.add(span.end);
  }

  const points = [...boundaries].sort((a, b) => a - b);
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (end <= start) continue;

    const annotation = annotationSpans.find((span) => span.start <= start && span.end >= end)?.item;
    const nuances = nuanceSpans.filter((span) => span.start <= start && span.end >= end);
    const classes = [];
    if (annotation) classes.push("hl", `hl-${annotation.type}`);
    if (nuances.length) classes.push("nuance-inline", annotation ? "nuance-overlap" : "nuance-only");

    const segmentText = text.slice(start, end);
    if (!classes.length) {
      appendText(els.annotatedText, segmentText);
      continue;
    }

    const title = nuances.length
      ? `${t("nuance")}: ${nuances.map((item) => t(item.category)).join(" / ")}`
      : t(typeTextKeys[annotation.type]);
    appendInteractiveText(
      els.annotatedText,
      segmentText,
      classes.join(" "),
      () => (nuances.length ? openConnotationPopup(nuances[0].id) : openPopup(annotation.id)),
      title,
    );
  }
}

function renderInlineNuanceList() {
  const connotations = state.result?.connotations || [];
  els.inlineNuanceList.innerHTML = "";
  els.inlineNuancePanel.hidden = !connotations.length;
  els.inlineNuanceCount.textContent = connotations.length;

  for (const connotation of connotations) {
    const button = document.createElement("button");
    button.className = "inline-nuance-chip";
    button.type = "button";
    button.title = connotation.suggestedMeaning;

    const target = document.createElement("span");
    target.className = "inline-nuance-target";
    target.textContent = connotation.text;
    const category = document.createElement("span");
    category.className = "inline-nuance-category";
    category.textContent = t(connotation.category);
    button.append(target, category);
    button.addEventListener("click", () => openConnotationPopup(connotation.id));
    els.inlineNuanceList.appendChild(button);
  }
}

function renderTranslation() {
  const translation = state.result?.translation || "";
  const shouldShow = clientAnalysis.shouldShowTranslation(els.includeTranslation.checked, translation);
  els.translationCard.hidden = !shouldShow;
  els.translationText.classList.toggle("empty", !shouldShow);
  els.translationText.textContent = shouldShow ? translation : "";
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
  const annotations = state.result.annotations;
  const connotations = state.result.connotations;
  if (!annotations.length && !connotations.length) {
    els.wordList.appendChild(emptyCard(t("emptyWords")));
    return;
  }

  const attachedConnotationIds = new Set();
  for (const item of annotations) {
    const related = state.connotationsByAnnotationId.get(item.id) || [];
    related.forEach((connotation) => attachedConnotationIds.add(connotation.id));

    const card = document.createElement("article");
    card.className = "word-card";
    card.innerHTML = `
      <div class="word-card-head">
        <h3></h3>
        <span class="badge ${item.type}"></span>
      </div>
      <p class="meaning"></p>
      <p class="annotation-pattern"><strong></strong> <code></code></p>
      <p class="note"></p>
      <p class="example"></p>
    `;
    renderAnnotationTitle(card.querySelector("h3"), item);
    card.querySelector(".badge").textContent = t(typeTextKeys[item.type]);
    card.querySelector(".meaning").textContent = cardPresentation.quoteGloss(item.meaningJa, state.uiLanguage);
    const pattern = card.querySelector(".annotation-pattern");
    pattern.hidden = !item.pattern;
    pattern.querySelector("strong").textContent = t("patternLabel");
    pattern.querySelector("code").textContent = item.pattern;
    card.querySelector(".note").textContent = item.noteJa;
    card.querySelector(".example").textContent = item.example ? `${t("examplePrefix")}${item.example}` : "";
    if (related.length) card.appendChild(renderNuanceBlock(related));
    card.addEventListener("click", () => openPopup(item.id));
    els.wordList.appendChild(card);
  }

  for (const connotation of connotations) {
    if (attachedConnotationIds.has(connotation.id)) continue;
    const card = document.createElement("article");
    card.className = "word-card nuance-card";
    const head = document.createElement("div");
    head.className = "word-card-head";
    const title = document.createElement("h3");
    title.textContent = connotation.text;
    head.append(title, renderNuanceMeta(connotation));
    card.append(head, renderNuanceBlock([connotation], { hideMeta: true }));
    card.addEventListener("click", () => openConnotationPopup(connotation.id));
    els.wordList.appendChild(card);
  }
}

function renderAnnotationTitle(parent, annotation) {
  parent.innerHTML = "";
  if (!annotation.coreRanges.length) {
    parent.textContent = annotation.text;
    return;
  }

  let cursor = 0;
  for (const range of annotation.coreRanges) {
    if (range.start > cursor) {
      parent.appendChild(document.createTextNode(annotation.text.slice(cursor, range.start)));
    }
    const core = document.createElement("strong");
    core.className = "construction-core";
    core.textContent = annotation.text.slice(range.start, range.end);
    parent.appendChild(core);
    cursor = range.end;
  }
  if (cursor < annotation.text.length) {
    parent.appendChild(document.createTextNode(annotation.text.slice(cursor)));
  }
}

function appendInteractiveText(parent, text, className, onClick, title) {
  const parts = text.split(/(\n+)/);
  for (const part of parts) {
    if (!part) continue;
    if (/^\n+$/.test(part)) {
      for (let index = 0; index < part.length; index += 1) {
        parent.appendChild(document.createElement("br"));
      }
      continue;
    }
    const mark = document.createElement("span");
    mark.className = className;
    mark.textContent = part;
    mark.title = title;
    mark.addEventListener("click", onClick);
    parent.appendChild(mark);
  }
}

function assignConnotationsToAnnotations(annotations, connotations) {
  const assignments = new Map();
  for (const connotation of connotations) {
    if (connotation.scope !== "span") continue;
    let best = null;
    for (const annotation of annotations) {
      const score = connotationAnnotationScore(connotation, annotation);
      if (score > 0 && (!best || score > best.score)) best = { annotation, score };
    }
    if (!best) continue;
    const items = assignments.get(best.annotation.id) || [];
    items.push(connotation);
    assignments.set(best.annotation.id, items);
  }
  return assignments;
}

function connotationAnnotationScore(connotation, annotation) {
  const hasRanges = [connotation.start, connotation.end, annotation.start, annotation.end]
    .every(Number.isInteger);
  if (hasRanges) {
    if (connotation.start === annotation.start && connotation.end === annotation.end) return 10000;
    if (annotation.start >= connotation.start && annotation.end <= connotation.end) {
      const edgeBonus = annotation.start === connotation.start ? 5000 : 0;
      return 1000 + edgeBonus + (annotation.end - annotation.start);
    }
    const overlap = Math.min(connotation.end, annotation.end) - Math.max(connotation.start, annotation.start);
    if (overlap > 0) return overlap;
  }
  if (connotation.text === annotation.text) return 10000;
  if (connotation.text.includes(annotation.text)) return 100 + annotation.text.length;
  return 0;
}

function renderNuanceBlock(connotations, options = {}) {
  const detail = Number(els.nuanceRange.value || 2);
  const block = document.createElement("div");
  block.className = `nuance-block nuance-detail-${detail}`;

  for (const connotation of connotations) {
    const entry = document.createElement("section");
    entry.className = "nuance-entry";

    if (!options.hideMeta) {
      entry.appendChild(renderNuanceMeta(connotation));
    }

    if (detail === 1) {
      appendNuanceRow(entry, "nuanceSuggested", connotation.suggestedMeaning, "nuance-summary");
    } else {
      appendNuanceRow(
        entry,
        "nuanceSurface",
        cardPresentation.quoteGloss(connotation.literalMeaning, state.uiLanguage),
        "nuance-gloss",
      );
      appendNuanceRow(entry, "nuanceSuggested", connotation.suggestedMeaning, "nuance-summary");
      appendNuanceRow(entry, "nuanceEffect", connotation.pragmaticEffect);
      appendNuanceRow(entry, "nuanceEvidence", connotation.evidence.join(" / "));
    }

    if (detail >= 3) {
      if (cardPresentation.shouldShowQualification(connotation.contextNote, [
        connotation.literalMeaning,
        connotation.suggestedMeaning,
        connotation.pragmaticEffect,
      ])) {
        appendNuanceRow(entry, "nuanceContext", connotation.contextNote);
      }
      const alternatives = cardPresentation.meaningfulAlternatives(connotation.alternatives, [
        connotation.literalMeaning,
        connotation.suggestedMeaning,
      ]);
      appendNuanceRow(entry, "nuanceAlternatives", alternatives.join(" / "));
    }
    block.appendChild(entry);
  }
  return block;
}

function renderNuanceMeta(connotation) {
  const meta = document.createElement("div");
  meta.className = "nuance-meta";
  meta.appendChild(renderCategoryBadges(connotation));

  const confidence = document.createElement("span");
  confidence.className = `nuance-confidence confidence-${connotation.confidence}`;
  confidence.textContent = `${t("nuanceConfidence")}: ${t(`confidence${capitalize(connotation.confidence)}`)}`;
  meta.appendChild(confidence);
  return meta;
}

function renderCategoryBadges(connotation) {
  const group = document.createElement("span");
  group.className = "badge-group";
  group.setAttribute("aria-label", t("categoryGlossaryLabel"));

  for (const category of [connotation.category, ...(connotation.secondaryCategories || [])]) {
    const badge = document.createElement("span");
    const help = t(`categoryHelp${capitalize(category)}`);
    badge.className = "badge nuance category-help";
    badge.textContent = t(category);
    badge.title = help;
    badge.tabIndex = 0;
    badge.setAttribute("aria-label", `${t(category)}: ${help}`);
    group.appendChild(badge);
  }
  return group;
}

function appendNuanceRow(parent, labelKey, value, className = "") {
  if (!value) return;
  const row = document.createElement("p");
  row.className = `nuance-row ${className}`.trim();
  if (labelKey) {
    const label = document.createElement("strong");
    label.textContent = t(labelKey);
    row.append(label, document.createTextNode(" "));
  }
  row.appendChild(document.createTextNode(value));
  parent.appendChild(row);
}

function capitalize(value) {
  return value ? value[0].toUpperCase() + value.slice(1) : "";
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
  const connotations = state.result?.connotations || [];
  els.statVocab.textContent = items.filter((item) => item.type === "word" || item.type === "term").length;
  els.statPhrase.textContent = items.filter((item) => (
    item.type === "collocation" || item.type === "formula" || item.type === "idiom"
  )).length;
  els.statGrammar.textContent = items.filter((item) => item.type === "construction").length;
  els.statNuance.textContent = connotations.length;
  els.statLevel.textContent = t(levelTextKeys[state.level] || "intermediate");
}

function openPopup(id) {
  const item = state.annotationsById.get(id);
  if (!item) return;
  const related = state.connotationsByAnnotationId.get(item.id) || [];
  renderAnnotationTitle(els.popupWord, item);
  els.popupType.textContent = t(typeTextKeys[item.type]);
  els.popupType.className = `popup-type badge ${item.type}`;
  els.popupType.hidden = false;
  els.popupDef.textContent = cardPresentation.quoteGloss(item.meaningJa, state.uiLanguage);
  els.popupPattern.hidden = !item.pattern;
  els.popupPattern.querySelector("strong").textContent = t("patternLabel");
  els.popupPattern.querySelector("code").textContent = item.pattern;
  els.popupNote.textContent = item.noteJa;
  els.popupExample.textContent = item.example ? `${t("examplePrefix")}${item.example}` : "";
  els.popupNuances.innerHTML = "";
  if (related.length) els.popupNuances.appendChild(renderNuanceBlock(related));
  els.overlay.classList.add("show");
}

function openConnotationPopup(id) {
  const item = state.connotationsById.get(id);
  if (!item) return;
  els.popupWord.textContent = item.text;
  els.popupType.hidden = true;
  els.popupDef.textContent = "";
  els.popupPattern.hidden = true;
  els.popupNote.textContent = "";
  els.popupExample.textContent = "";
  els.popupNuances.innerHTML = "";
  els.popupNuances.appendChild(renderNuanceBlock([item]));
  els.overlay.classList.add("show");
}

function openCategoryGlossary() {
  els.popupWord.textContent = t("categoryGlossaryTitle");
  els.popupType.hidden = true;
  els.popupDef.textContent = "";
  els.popupPattern.hidden = true;
  els.popupNote.textContent = "";
  els.popupExample.textContent = "";
  els.popupNuances.innerHTML = "";

  const glossary = document.createElement("div");
  glossary.className = "category-glossary";
  for (const category of connotationCategoryValues) {
    const item = document.createElement("section");
    const heading = document.createElement("h3");
    const description = document.createElement("p");
    heading.textContent = t(category);
    description.textContent = t(`categoryHelp${capitalize(category)}`);
    item.append(heading, description);
    glossary.appendChild(item);
  }
  els.popupNuances.appendChild(glossary);
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
  els.cancelAnalyzeBtn.hidden = !isBusy;
  els.cancelAnalyzeBtn.disabled = false;
  els.sampleBtn.disabled = isBusy;
  els.clearBtn.disabled = isBusy;
  els.sourceText.disabled = isBusy;
  els.sourceLangSelect.disabled = isBusy;
  els.explanationLangSelect.disabled = isBusy;
  els.densityRange.disabled = isBusy;
  els.focusSelect.disabled = isBusy;
  els.includeGrammar.disabled = isBusy;
  els.includeSlash.disabled = isBusy;
  els.includeTranslation.disabled = isBusy;
  document.querySelectorAll(".segment, .analysis-mode-segment").forEach((button) => {
    button.disabled = isBusy;
  });
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
  els.inlineNuancePanel.hidden = true;
  els.inlineNuanceList.innerHTML = "";
  els.inlineNuanceCount.textContent = "0";
  els.translationCard.hidden = true;
  els.translationText.classList.add("empty");
  els.translationText.textContent = "";
  els.wordList.innerHTML = "";
  els.wordList.appendChild(emptyCard(t("emptyWords")));
  els.slashText.classList.add("empty");
  els.slashText.textContent = t("slashEmpty");
  els.exportText.value = "";
  state.annotationsById = new Map();
  state.connotationsById = new Map();
  state.connotationsByAnnotationId = new Map();
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
    "",
    `## ${t("nuance")}`,
    ...(state.result.connotations.length
      ? state.result.connotations.map((item) => [
          `- **${item.text}** (${[item.category, ...item.secondaryCategories].map((category) => t(category)).join(" / ")}): ${item.suggestedMeaning}`,
          `  - ${t("nuanceSurface")}: ${item.literalMeaning}`,
          `  - ${t("nuanceEffect")}: ${item.pragmaticEffect}`,
          `  - ${t("nuanceContext")}: ${item.contextNote}`,
          `  - ${t("nuanceConfidence")}: ${t(`confidence${capitalize(item.confidence)}`)}`,
        ].join("\n"))
      : [`- ${t("noNuances")}`]),
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

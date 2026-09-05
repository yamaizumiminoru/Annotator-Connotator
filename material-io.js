(function initMaterialIo(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root?.document) api.install(root);
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const MATERIAL_FORMAT = "annotator-connotator-material";
  const MATERIAL_SCHEMA_VERSION = 2;
  const LEARNER_LEVELS = ["beginner", "intermediate", "advanced"];

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeLevels(value, fallback = ["intermediate"]) {
    const source = Array.isArray(value) ? value : [value];
    const selected = LEARNER_LEVELS.filter((level) => source.includes(level));
    return selected.length ? selected : [...fallback];
  }

  function materialResultFromFullResult(fullResult, settings = {}) {
    if (!fullResult || typeof fullResult !== "object") throw new Error("missing_result");
    const pool = fullResult?._selection?.candidates;
    if (!Array.isArray(pool)) throw new Error("missing_candidate_pool");

    const result = cloneJson(fullResult);
    result.annotations = cloneJson(pool);
    delete result._selection;
    delete result._api;

    const levels = normalizeLevels(settings.levels || result.levels);
    result.levels = levels;
    result.level = levels.length === 1 ? levels[0] : "multiple";
    return result;
  }

  function buildMaterialEnvelope(fullResult, settings = {}, exportedAt = new Date().toISOString()) {
    const normalizedSettings = cloneJson(settings || {});
    normalizedSettings.levels = normalizeLevels(normalizedSettings.levels);
    delete normalizedSettings.level;
    return {
      format: MATERIAL_FORMAT,
      schemaVersion: MATERIAL_SCHEMA_VERSION,
      exportedAt,
      result: materialResultFromFullResult(fullResult, normalizedSettings),
      settings: normalizedSettings,
    };
  }

  function unwrapMaterial(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("invalid_material");
    }
    if (payload.format !== MATERIAL_FORMAT || Number(payload.schemaVersion) !== MATERIAL_SCHEMA_VERSION) {
      throw new Error("unsupported_schema");
    }
    if (!payload.result || typeof payload.result !== "object") throw new Error("invalid_material");
    const material = {
      result: cloneJson(payload.result),
      settings: cloneJson(payload.settings || {}),
      schemaVersion: MATERIAL_SCHEMA_VERSION,
    };
    if (!validateResult(material.result)) throw new Error("invalid_material");
    material.settings.levels = normalizeLevels(material.settings.levels || material.result.levels);
    return material;
  }

  function validateResult(result) {
    if (!(
      result
      && typeof result === "object"
      && typeof result.sourceText === "string"
      && Array.isArray(result.annotations)
      && Array.isArray(result.connotations)
    )) return false;

    return result.annotations.every((item) => (
      item
      && typeof item === "object"
      && LEARNER_LEVELS.includes(item?.judgeMeta?.primaryLearnerBand)
    ));
  }

  function safeFilenameStem(text) {
    const firstLine = String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) || "annotator-connotator";
    const cleaned = firstLine
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 48);
    return cleaned || "annotator-connotator";
  }

  function install(root) {
    if (root.__materialIoInstalled) return;
    root.__materialIoInstalled = true;

    let importedFullResult = null;
    let normalizePatched = false;

    root.UI_TEXT = root.UI_TEXT || {};
    root.UI_TEXT.ja = {
      ...(root.UI_TEXT.ja || {}),
      ioTab: "入出力",
      jsonImport: "📂 JSONを読み込む",
      jsonSave: "💾 JSONを保存",
      jsonIoHint: "全難易度の解析候補を教材JSONとして保存・再読み込みできます。読み込み後もAPIなしで難易度を切り替えられます。",
      jsonImported: "教材JSONを読み込みました。",
      jsonSaved: "全難易度の候補を教材JSONに保存しました。",
      jsonImportInvalid: "このJSONは現在の教材形式ではありません。",
      jsonNothingToSave: "全難易度の候補を含む解析結果がありません。",
    };
    root.UI_TEXT.en = {
      ...(root.UI_TEXT.en || {}),
      ioTab: "Import / Export",
      jsonImport: "📂 Load JSON",
      jsonSave: "💾 Save JSON",
      jsonIoHint: "Save the full learner-band candidate pool as material JSON. After loading it, difficulty bands can be switched without another API call.",
      jsonImported: "Material JSON loaded.",
      jsonSaved: "Saved the full learner-band candidate pool as material JSON.",
      jsonImportInvalid: "This JSON is not in the current material format.",
      jsonNothingToSave: "There is no analysis with a full learner-band candidate pool to save.",
    };

    function text(key, fallbackJa, fallbackEn) {
      try {
        if (typeof t === "function") {
          const translated = t(key);
          if (translated && translated !== key) return translated;
        }
      } catch {
        // Fall back below.
      }
      const language = root.document.getElementById("uiLangSelect")?.value || "ja";
      return String(language).toLowerCase().startsWith("ja") ? fallbackJa : fallbackEn;
    }

    function patchNormalizeResult() {
      if (normalizePatched || typeof normalizeResult !== "function") return normalizePatched;
      const originalNormalizeResult = normalizeResult;
      normalizeResult = function materialAwareNormalizeResult(data, fallbackText) {
        const normalized = originalNormalizeResult(data, fallbackText);
        if (Array.isArray(data?._selection?.candidates)) {
          normalized._selection = cloneJson(data._selection);
        }
        if (data?._api && typeof data._api === "object") normalized._api = cloneJson(data._api);
        if (Array.isArray(data?.levels)) normalized.levels = normalizeLevels(data.levels);
        return normalized;
      };
      normalizePatched = true;
      return true;
    }

    function ensureNormalizePatch() {
      if (patchNormalizeResult()) return;
      let attempts = 0;
      const timer = root.setInterval(() => {
        attempts += 1;
        if (patchNormalizeResult() || attempts >= 200) root.clearInterval(timer);
      }, 25);
    }

    function selectedLevels() {
      const inputs = [...root.document.querySelectorAll('[data-level-checkbox]')];
      if (!inputs.length) {
        try {
          return normalizeLevels(JSON.parse(root.localStorage.getItem("annotation.levels") || "null"));
        } catch {
          return ["intermediate"];
        }
      }
      return normalizeLevels(inputs.filter((input) => input.checked).map((input) => input.value));
    }

    function setSelectedLevels(levels) {
      const normalized = normalizeLevels(levels);
      const inputs = [...root.document.querySelectorAll('[data-level-checkbox]')];
      for (const input of inputs) input.checked = normalized.includes(input.value);
      root.localStorage.setItem("annotation.levels", JSON.stringify(normalized));
      root.localStorage.setItem("annotation.level", "beginner");
      return normalized;
    }

    function currentSettings() {
      try {
        return {
          levels: selectedLevels(),
          analysisMode: state.analysisMode,
          extractionMode: root.INTENSIVE_MODE?.getMode?.()
            || root.localStorage.getItem("annotation.extractionMode")
            || "standard",
          density: els.densityRange.value,
          nuanceDetail: els.nuanceRange.value,
          focus: els.focusSelect.value,
          sourceLanguageSelection: els.sourceLangSelect.value,
          explanationLanguageSelection: els.explanationLangSelect.value,
          includeGrammar: els.includeGrammar.checked,
          includeTranslation: els.includeTranslation.checked,
          showExplanations: root.INTENSIVE_MODE?.getExplanationsVisible?.()
            ?? (root.localStorage.getItem("annotation.showExplanations") !== "false"),
        };
      } catch {
        return { levels: selectedLevels() };
      }
    }

    function applySelect(select, value) {
      if (!select || value == null) return;
      if ([...select.options].some((option) => option.value === value)) select.value = value;
    }

    function applyImportedDisplaySettings(settings) {
      const extractionMode = settings.extractionMode === "intensive" ? "intensive" : "standard";
      if (root.INTENSIVE_MODE?.setMode) {
        root.INTENSIVE_MODE.setMode(extractionMode, { adjustDensity: false });
      } else {
        root.localStorage.setItem("annotation.extractionMode", extractionMode);
      }

      if (typeof settings.showExplanations === "boolean") {
        if (root.INTENSIVE_MODE?.setExplanationsVisible) {
          root.INTENSIVE_MODE.setExplanationsVisible(settings.showExplanations);
        } else {
          root.localStorage.setItem("annotation.showExplanations", String(settings.showExplanations));
        }
      }
    }

    function fullResultFromMaterialResult(materialResult) {
      const result = cloneJson(materialResult);
      const pool = cloneJson(result.annotations || []);
      result._selection = {
        version: MATERIAL_SCHEMA_VERSION,
        candidates: pool,
      };
      return result;
    }

    function displayImportedSelection() {
      if (!importedFullResult || !root.REASON_SELECTION) return false;
      patchNormalizeResult();
      if (typeof normalizeResult !== "function") return false;

      const levels = selectedLevels();
      const density = Number(root.document.getElementById("densityRange")?.value || 2);
      const engine = root.REASON_SELECTION;
      const full = cloneJson(importedFullResult);
      const pool = Array.isArray(full?._selection?.candidates) ? full._selection.candidates : [];
      const preparedPool = pool.map((candidate) => engine.prepareCandidate(candidate, levels));
      full.annotations = engine.selectAnnotationsByDensity(preparedPool, density, levels)
        .map(engine.stripInternalSelectionFields);
      full._selection = {
        ...(full._selection || {}),
        candidates: preparedPool,
      };
      full.levels = levels;
      full.level = levels.length === 1 ? levels[0] : "multiple";
      full._api = {
        ...(full._api || {}),
        selectedLevels: levels,
        candidateCount: preparedPool.length,
        displayedAnnotationCount: full.annotations.length,
        localMaterial: true,
      };

      try {
        state.result = normalizeResult(full, full.sourceText || "");
        state.result._selection = cloneJson(full._selection);
        state.result.levels = [...levels];
        els.sourceText.value = full.sourceText || "";
        renderResult();
        updateDensityLabel(false);
        updateNuanceLabel(false);
        persistSettings();
        if (typeof setStatus === "function" && typeof t === "function") {
          setStatus(t("extracted", {
            count: state.result.annotations.length,
            nuances: state.result.connotations.length,
          }), "ok");
        }
        return true;
      } catch {
        return false;
      }
    }

    function applyImportedMaterial(material) {
      if (!validateResult(material.result)) throw new Error("invalid_material");
      const settings = material.settings || {};
      patchNormalizeResult();

      if (["standard", "precise"].includes(settings.analysisMode)) setAnalysisMode(settings.analysisMode);
      applyImportedDisplaySettings(settings);
      if (["1", "2", "3", "4"].includes(String(settings.density))) els.densityRange.value = String(settings.density);
      if (["1", "2", "3"].includes(String(settings.nuanceDetail))) els.nuanceRange.value = String(settings.nuanceDetail);
      if (["all", "speaking", "academic"].includes(settings.focus)) els.focusSelect.value = settings.focus;
      if (typeof settings.includeGrammar === "boolean") els.includeGrammar.checked = settings.includeGrammar;
      els.includeTranslation.checked = typeof settings.includeTranslation === "boolean"
        ? settings.includeTranslation
        : Boolean(material.result.translation);

      applySelect(els.sourceLangSelect, settings.sourceLanguageSelection || material.result.sourceLanguage);
      applySelect(els.explanationLangSelect, settings.explanationLanguageSelection || material.result.explanationLanguage);
      setSelectedLevels(settings.levels || material.result.levels);

      importedFullResult = fullResultFromMaterialResult(material.result);
      importedFullResult.uiLanguage = els.uiLangSelect.value;
      importedFullResult.slashReading = Array.isArray(importedFullResult.slashReading)
        ? importedFullResult.slashReading
        : [];

      if (!displayImportedSelection()) throw new Error("material_display_unavailable");
      showTab("annotated");
      setStatus(text("jsonImported", "教材JSONを読み込みました。", "Material JSON loaded."), "ok");
    }

    function saveMaterial() {
      patchNormalizeResult();
      if (typeof state === "undefined" || !Array.isArray(state.result?._selection?.candidates)) {
        setStatus(text(
          "jsonNothingToSave",
          "全難易度の候補を含む解析結果がありません。",
          "There is no analysis with a full learner-band candidate pool to save.",
        ), "error");
        return;
      }
      try {
        const envelope = buildMaterialEnvelope(state.result, currentSettings());
        const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = root.document.createElement("a");
        link.href = url;
        link.download = `${safeFilenameStem(state.result.sourceText)}.json`;
        root.document.body.appendChild(link);
        link.click();
        link.remove();
        root.setTimeout(() => URL.revokeObjectURL(url), 0);
        setStatus(text("jsonSaved", "全難易度の候補を教材JSONに保存しました。", "Saved the full learner-band candidate pool as material JSON."), "ok");
      } catch {
        setStatus(text(
          "jsonNothingToSave",
          "全難易度の候補を含む解析結果がありません。",
          "There is no analysis with a full learner-band candidate pool to save.",
        ), "error");
      }
    }

    async function loadMaterialFile(file) {
      if (!file) return;
      try {
        const payload = JSON.parse(await file.text());
        applyImportedMaterial(unwrapMaterial(payload));
      } catch {
        setStatus(text(
          "jsonImportInvalid",
          "このJSONは現在の教材形式ではありません。",
          "This JSON is not in the current material format.",
        ), "error");
      }
    }

    function installImportedMaterialGuards() {
      root.document.addEventListener("change", (event) => {
        if (!importedFullResult) return;
        const target = event.target;
        const isLevel = target?.matches?.('[data-level-checkbox]');
        const isDensity = target?.id === "densityRange";
        if (!isLevel && !isDensity) return;

        if (isLevel) {
          const inputs = [...root.document.querySelectorAll('[data-level-checkbox]')];
          if (!inputs.some((input) => input.checked)) target.checked = true;
          root.localStorage.setItem("annotation.levels", JSON.stringify(selectedLevels()));
        }
        displayImportedSelection();
        event.stopImmediatePropagation();
      }, true);

      root.document.addEventListener("input", (event) => {
        if (!importedFullResult || event.target?.id !== "sourceText") return;
        if (String(event.target.value || "") !== String(importedFullResult.sourceText || "")) {
          importedFullResult = null;
        }
      }, true);

      root.document.addEventListener("click", (event) => {
        if (!importedFullResult) return;
        if (["annotateBtn", "reanalyzeBtn", "clearBtn"].includes(event.target?.id)) {
          importedFullResult = null;
        }
      }, true);
    }

    function installStyles() {
      if (root.document.getElementById("materialIoStyles")) return;
      const style = root.document.createElement("style");
      style.id = "materialIoStyles";
      style.textContent = `
        .material-io-card{border:1px solid var(--line);border-radius:8px;background:#fffdf7;padding:18px}
        .material-io-actions{display:flex;flex-wrap:wrap;gap:9px;align-items:center}
        .material-io-hint{margin:12px 0 0;color:var(--muted);font-size:12px;line-height:1.6}
      `;
      root.document.head.appendChild(style);
    }

    function relabel() {
      const tab = root.document.querySelector('.tab[data-tab="export"]');
      if (tab) {
        tab.dataset.i18n = "ioTab";
        tab.textContent = text("ioTab", "入出力", "Import / Export");
      }
      const importButton = root.document.getElementById("materialJsonImportBtn");
      const saveButton = root.document.getElementById("materialJsonSaveBtn");
      const hint = root.document.getElementById("materialJsonHint");
      if (importButton) importButton.textContent = text("jsonImport", "📂 JSONを読み込む", "📂 Load JSON");
      if (saveButton) saveButton.textContent = text("jsonSave", "💾 JSONを保存", "💾 Save JSON");
      if (hint) hint.textContent = text(
        "jsonIoHint",
        "全難易度の解析候補を教材JSONとして保存・再読み込みできます。読み込み後もAPIなしで難易度を切り替えられます。",
        "Save the full learner-band candidate pool as material JSON. After loading it, difficulty bands can be switched without another API call.",
      );
    }

    function installPanel() {
      const panel = root.document.getElementById("panel-export");
      if (!panel || root.document.getElementById("materialIoCard")) return;

      const legacyGrid = panel.querySelector(".export-grid");
      if (legacyGrid) legacyGrid.style.display = "none";
      const legacyText = root.document.getElementById("exportText");
      if (legacyText) legacyText.style.display = "none";

      const card = root.document.createElement("section");
      card.id = "materialIoCard";
      card.className = "material-io-card";

      const actions = root.document.createElement("div");
      actions.className = "material-io-actions";

      const importButton = root.document.createElement("button");
      importButton.id = "materialJsonImportBtn";
      importButton.className = "ghost-btn";
      importButton.type = "button";

      const saveButton = root.document.createElement("button");
      saveButton.id = "materialJsonSaveBtn";
      saveButton.className = "ghost-btn";
      saveButton.type = "button";

      const fileInput = root.document.createElement("input");
      fileInput.id = "materialJsonFileInput";
      fileInput.type = "file";
      fileInput.accept = ".json,application/json";
      fileInput.hidden = true;

      const hint = root.document.createElement("p");
      hint.id = "materialJsonHint";
      hint.className = "material-io-hint";

      importButton.addEventListener("click", () => fileInput.click());
      saveButton.addEventListener("click", saveMaterial);
      fileInput.addEventListener("change", async () => {
        const [file] = fileInput.files || [];
        await loadMaterialFile(file);
        fileInput.value = "";
      });

      actions.append(importButton, saveButton, fileInput);
      card.append(actions, hint);
      panel.prepend(card);
      relabel();
    }

    function installNow() {
      installStyles();
      installPanel();
      installImportedMaterialGuards();
      ensureNormalizePatch();
      relabel();
      root.document.getElementById("uiLangSelect")?.addEventListener("change", () => root.setTimeout(relabel, 0));
    }

    if (root.document.readyState === "loading") {
      root.document.addEventListener("DOMContentLoaded", installNow, { once: true });
    } else {
      root.setTimeout(installNow, 0);
    }
  }

  return {
    MATERIAL_FORMAT,
    MATERIAL_SCHEMA_VERSION,
    LEARNER_LEVELS,
    buildMaterialEnvelope,
    materialResultFromFullResult,
    normalizeLevels,
    safeFilenameStem,
    unwrapMaterial,
    validateResult,
    install,
  };
}));

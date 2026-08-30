(function initMaterialIo(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root?.document) api.install(root);
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const MATERIAL_FORMAT = "annotator-connotator-material";
  const MATERIAL_SCHEMA_VERSION = 1;

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function buildMaterialEnvelope(result, settings = {}, exportedAt = new Date().toISOString()) {
    if (!result || typeof result !== "object") throw new Error("missing_result");
    return {
      format: MATERIAL_FORMAT,
      schemaVersion: MATERIAL_SCHEMA_VERSION,
      exportedAt,
      result: cloneJson(result),
      settings: cloneJson(settings || {}),
    };
  }

  function unwrapMaterial(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("invalid_material");
    }

    const wrapped = payload.format === MATERIAL_FORMAT || Object.hasOwn(payload, "result");
    if (wrapped) {
      const version = Number(payload.schemaVersion || 1);
      if (version > MATERIAL_SCHEMA_VERSION) throw new Error("newer_schema");
      if (!payload.result || typeof payload.result !== "object") throw new Error("invalid_material");
      return {
        result: cloneJson(payload.result),
        settings: cloneJson(payload.settings || {}),
        schemaVersion: version,
        legacy: false,
      };
    }

    // Backward compatibility: JSON copied from the old Output tab was the result object itself.
    return {
      result: cloneJson(payload),
      settings: {},
      schemaVersion: 0,
      legacy: true,
    };
  }

  function validateResult(result) {
    return Boolean(
      result
      && typeof result === "object"
      && typeof result.sourceText === "string"
      && Array.isArray(result.annotations)
      && Array.isArray(result.connotations),
    );
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

    root.UI_TEXT = root.UI_TEXT || {};
    root.UI_TEXT.ja = {
      ...(root.UI_TEXT.ja || {}),
      ioTab: "入出力",
      jsonImport: "📂 JSONを読み込む",
      jsonSave: "💾 JSONを保存",
      jsonIoHint: "解析結果を教材JSONとして保存・再読み込みできます。読み込み時にAPIは使いません。",
      jsonImported: "教材JSONを読み込みました。",
      jsonSaved: "教材JSONを保存しました。",
      jsonImportInvalid: "このJSONは教材として読み込めません。",
      jsonImportNewer: "このJSONは、より新しい形式で作成されています。アプリを更新してください。",
      jsonNothingToSave: "保存できる解析結果がありません。",
    };
    root.UI_TEXT.en = {
      ...(root.UI_TEXT.en || {}),
      ioTab: "Import / Export",
      jsonImport: "📂 Load JSON",
      jsonSave: "💾 Save JSON",
      jsonIoHint: "Save an analysis as a reusable material JSON file and load it again without an API call.",
      jsonImported: "Material JSON loaded.",
      jsonSaved: "Material JSON saved.",
      jsonImportInvalid: "This JSON cannot be loaded as material.",
      jsonImportNewer: "This JSON uses a newer format. Please update the app.",
      jsonNothingToSave: "There is no analysis result to save.",
    };

    function text(key, fallbackJa, fallbackEn) {
      try {
        if (typeof t === "function") {
          const translated = t(key);
          if (translated && translated !== key) return translated;
        }
      } catch {
        // Use fallback below.
      }
      const language = root.document.getElementById("uiLangSelect")?.value || "ja";
      return String(language).toLowerCase().startsWith("ja") ? fallbackJa : fallbackEn;
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

    function currentSettings() {
      try {
        return {
          level: state.level,
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
        return {};
      }
    }

    function applySelect(select, value) {
      if (!select || value == null) return;
      if ([...select.options].some((option) => option.value === value)) select.value = value;
    }

    function normalizedImportedResult(rawResult) {
      const candidate = cloneJson(rawResult);
      if (!Array.isArray(candidate.slashReading)) candidate.slashReading = [];
      const annotationsReady = candidate.annotations.every((item) => Array.isArray(item.coreRanges));
      if (annotationsReady) return candidate;
      if (typeof normalizeResult === "function") return normalizeResult(candidate, candidate.sourceText || "");
      return candidate;
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

    function applyImportedMaterial(material) {
      if (!validateResult(material.result)) throw new Error("invalid_material");
      const imported = normalizedImportedResult(material.result);
      const settings = material.settings || {};

      if (["beginner", "intermediate", "advanced"].includes(settings.level || imported.level)) {
        setLevel(settings.level || imported.level);
      }
      if (["standard", "precise"].includes(settings.analysisMode)) setAnalysisMode(settings.analysisMode);
      applyImportedDisplaySettings(settings);
      if (["1", "2", "3"].includes(String(settings.density))) els.densityRange.value = String(settings.density);
      if (["1", "2", "3"].includes(String(settings.nuanceDetail))) els.nuanceRange.value = String(settings.nuanceDetail);
      if (["all", "speaking", "academic"].includes(settings.focus)) els.focusSelect.value = settings.focus;
      if (typeof settings.includeGrammar === "boolean") els.includeGrammar.checked = settings.includeGrammar;
      els.includeTranslation.checked = typeof settings.includeTranslation === "boolean"
        ? settings.includeTranslation
        : Boolean(imported.translation);

      applySelect(els.sourceLangSelect, settings.sourceLanguageSelection || imported.sourceLanguage);
      applySelect(els.explanationLangSelect, settings.explanationLanguageSelection || imported.explanationLanguage);

      imported.uiLanguage = els.uiLangSelect.value;
      imported.slashReading = [];
      state.result = imported;
      els.sourceText.value = imported.sourceText;
      updateDensityLabel(false);
      updateNuanceLabel(false);
      renderResult();
      persistSettings();
      showTab("annotated");
      setStatus(text("jsonImported", "教材JSONを読み込みました。", "Material JSON loaded."), "ok");
    }

    function saveMaterial() {
      if (typeof state === "undefined" || !state.result) {
        setStatus(text("jsonNothingToSave", "保存できる解析結果がありません。", "There is no analysis result to save."), "error");
        return;
      }
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
      setStatus(text("jsonSaved", "教材JSONを保存しました。", "Material JSON saved."), "ok");
    }

    async function loadMaterialFile(file) {
      if (!file) return;
      try {
        const payload = JSON.parse(await file.text());
        const material = unwrapMaterial(payload);
        applyImportedMaterial(material);
      } catch (error) {
        const message = error?.message === "newer_schema"
          ? text("jsonImportNewer", "このJSONは、より新しい形式で作成されています。アプリを更新してください。", "This JSON uses a newer format. Please update the app.")
          : text("jsonImportInvalid", "このJSONは教材として読み込めません。", "This JSON cannot be loaded as material.");
        setStatus(message, "error");
      }
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
        "解析結果を教材JSONとして保存・再読み込みできます。読み込み時にAPIは使いません。",
        "Save an analysis as a reusable material JSON file and load it again without an API call.",
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
    buildMaterialEnvelope,
    safeFilenameStem,
    unwrapMaterial,
    validateResult,
    install,
  };
}));

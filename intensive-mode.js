(function installComprehensiveDensityMode(root) {
  if (!root?.document) return;
  const core = root.INTENSIVE_MODE_CORE;
  if (!core) return;

  root.UI_TEXT = root.UI_TEXT || {};
  root.UI_TEXT.ja = {
    ...(root.UI_TEXT.ja || {}),
    densityComprehensive: "網羅",
    comprehensiveTooLong: `「網羅」は${core.INTENSIVE_MAX_SOURCE_LENGTH.toLocaleString("ja-JP")}文字以内の短い文章向けです。「多め」以下にするか、文章を短くしてください。`,
    showExplanations: "解説を表示",
  };
  root.UI_TEXT.en = {
    ...(root.UI_TEXT.en || {}),
    densityComprehensive: "Comprehensive",
    comprehensiveTooLong: `Comprehensive density is for short passages up to ${core.INTENSIVE_MAX_SOURCE_LENGTH.toLocaleString("en-US")} characters. Choose High or shorten the text.`,
    showExplanations: "Show explanations",
  };

  let explanationsVisible = root.localStorage.getItem("annotation.showExplanations") !== "false";
  const previousFetch = root.fetch.bind(root);

  function currentUiLanguage() {
    return root.document.getElementById("uiLangSelect")?.value || "ja";
  }

  function text(key, fallbackJa, fallbackEn) {
    const language = String(currentUiLanguage()).toLowerCase();
    if (language.startsWith("ja")) return root.UI_TEXT.ja?.[key] || fallbackJa;
    if (language.startsWith("en")) return root.UI_TEXT.en?.[key] || fallbackEn;
    try {
      if (typeof t === "function") {
        const translated = t(key);
        if (translated && translated !== key) return translated;
      }
    } catch {
      // Use English fallback for dynamically added keys in other UI languages.
    }
    return fallbackEn;
  }

  function installStyles() {
    if (root.document.getElementById("intensiveModeStyles")) return;
    const style = root.document.createElement("style");
    style.id = "intensiveModeStyles";
    style.textContent = `
      .teaching-display-toggle{display:flex;align-items:center;gap:7px}
      html.hide-annotation-explanations #panel-words .meaning,
      html.hide-annotation-explanations #panel-words .annotation-pattern,
      html.hide-annotation-explanations #panel-words .note,
      html.hide-annotation-explanations #panel-words .example,
      html.hide-annotation-explanations #panel-words .nuance-block,
      html.hide-annotation-explanations .popup .popup-def,
      html.hide-annotation-explanations .popup .popup-pattern,
      html.hide-annotation-explanations .popup .popup-note,
      html.hide-annotation-explanations .popup .popup-ex,
      html.hide-annotation-explanations .popup .popup-nuances{display:none!important}
    `;
    root.document.head.appendChild(style);
  }

  function densityRange() {
    return root.document.getElementById("densityRange");
  }

  function currentMode() {
    return core.modeForDensity(densityRange()?.value || 2);
  }

  function syncDensityLabel() {
    const range = densityRange();
    const label = root.document.getElementById("densityLabel");
    if (!range || !label) return;
    if (core.isComprehensiveDensity(range.value)) {
      label.textContent = text("densityComprehensive", "網羅", "Comprehensive");
    }
    root.localStorage.setItem("annotation.extractionMode", currentMode());
  }

  function migrateOldSeparateMode() {
    const range = densityRange();
    if (!range) return;
    range.max = String(core.COMPREHENSIVE_DENSITY);
    const oldMode = core.normalizeMode(root.localStorage.getItem("annotation.extractionMode"));
    if (core.isIntensive(oldMode) && !core.isComprehensiveDensity(range.value)) {
      range.value = String(core.COMPREHENSIVE_DENSITY);
      root.localStorage.setItem("annotation.density", range.value);
    }
    root.document.getElementById("extractionModeControl")?.remove();
    try {
      if (typeof densityTextKeys === "object") densityTextKeys[core.COMPREHENSIVE_DENSITY] = "densityComprehensive";
    } catch {
      // The main script may not have created the label map yet; direct relabeling below still works.
    }
    syncDensityLabel();
  }

  function setMode(nextMode, options = {}) {
    const range = densityRange();
    if (!range) return;
    const normalized = core.normalizeMode(nextMode);
    if (core.isIntensive(normalized)) {
      range.value = String(core.COMPREHENSIVE_DENSITY);
    } else if (core.isComprehensiveDensity(range.value)) {
      range.value = "3";
    }
    if (options.persist !== false) {
      root.localStorage.setItem("annotation.density", range.value);
      root.localStorage.setItem("annotation.extractionMode", currentMode());
    }
    try {
      if (typeof updateDensityLabel === "function") updateDensityLabel(options.persist !== false);
    } catch {
      // Direct relabel below is enough.
    }
    syncDensityLabel();
  }

  function setExplanationsVisible(visible, options = {}) {
    explanationsVisible = visible !== false;
    if (options.persist !== false) {
      root.localStorage.setItem("annotation.showExplanations", String(explanationsVisible));
    }
    root.document.documentElement.classList.toggle("hide-annotation-explanations", !explanationsVisible);
    const checkbox = root.document.getElementById("showExplanations");
    if (checkbox) checkbox.checked = explanationsVisible;
  }

  function installControls() {
    root.document.getElementById("extractionModeControl")?.remove();
    if (!root.document.getElementById("showExplanations")) {
      const toggleGrid = root.document.querySelector(".toggle-grid");
      if (toggleGrid) {
        const label = root.document.createElement("label");
        label.className = "teaching-display-toggle";
        const checkbox = root.document.createElement("input");
        checkbox.id = "showExplanations";
        checkbox.type = "checkbox";
        const span = root.document.createElement("span");
        span.dataset.intensiveI18n = "showExplanations";
        checkbox.addEventListener("change", () => setExplanationsVisible(checkbox.checked));
        label.append(checkbox, span);
        toggleGrid.appendChild(label);
      }
    }
  }

  function relabel() {
    const show = root.document.querySelector('[data-intensive-i18n="showExplanations"]');
    if (show) show.textContent = text("showExplanations", "解説を表示", "Show explanations");
    syncDensityLabel();
  }

  function tooLongMessage() {
    return text(
      "comprehensiveTooLong",
      `「網羅」は${core.INTENSIVE_MAX_SOURCE_LENGTH.toLocaleString("ja-JP")}文字以内の短い文章向けです。「多め」以下にするか、文章を短くしてください。`,
      `Comprehensive density is for short passages up to ${core.INTENSIVE_MAX_SOURCE_LENGTH.toLocaleString("en-US")} characters. Choose High or shorten the text.`,
    );
  }

  root.fetch = async function comprehensiveAwareFetch(input, init) {
    let url;
    try {
      url = new URL(typeof input === "string" ? input : input.url, root.location.href);
    } catch {
      return previousFetch(input, init);
    }
    const method = String(init?.method || (typeof input !== "string" ? input.method : "GET") || "GET").toUpperCase();
    if (method !== "POST" || url.pathname !== "/api/annotate" || typeof init?.body !== "string") {
      return previousFetch(input, init);
    }

    let payload;
    try {
      payload = JSON.parse(init.body);
    } catch {
      return previousFetch(input, init);
    }
    const comprehensive = core.isComprehensiveDensity(payload.density ?? densityRange()?.value);
    payload.extractionMode = comprehensive ? core.INTENSIVE_MODE : core.STANDARD_MODE;
    if (comprehensive && core.isTooLong(payload.text)) {
      return new Response(JSON.stringify({
        error: "comprehensive_too_long",
        message: tooLongMessage(),
      }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
    return previousFetch(input, { ...init, body: JSON.stringify(payload) });
  };

  function install() {
    installStyles();
    migrateOldSeparateMode();
    installControls();
    setExplanationsVisible(explanationsVisible, { persist: false });
    const range = densityRange();
    range?.addEventListener("input", () => root.setTimeout(syncDensityLabel, 0));
    relabel();
    root.document.getElementById("uiLangSelect")?.addEventListener("change", () => root.setTimeout(relabel, 0));
  }

  root.INTENSIVE_MODE = {
    getMode: currentMode,
    getExplanationsVisible: () => explanationsVisible,
    isComprehensive: () => core.isComprehensiveDensity(densityRange()?.value),
    setMode,
    setExplanationsVisible,
    syncDensity: syncDensityLabel,
  };

  if (root.document.readyState === "loading") {
    root.document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    root.setTimeout(install, 0);
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
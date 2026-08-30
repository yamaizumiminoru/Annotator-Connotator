(function installIntensiveReadingMode(root) {
  if (!root?.document) return;
  const core = root.INTENSIVE_MODE_CORE;
  if (!core) return;

  root.UI_TEXT = root.UI_TEXT || {};
  root.UI_TEXT.ja = {
    ...(root.UI_TEXT.ja || {}),
    extractionMode: "抽出方針",
    extractionStandard: "通常",
    extractionIntensive: "精読",
    intensiveHint: "短い文章向け。候補を高密度に拾い、抽出量は自動で「多め」にします。",
    intensiveTooLong: `精読モードは${core.INTENSIVE_MAX_SOURCE_LENGTH.toLocaleString("ja-JP")}文字以内の短い文章向けです。通常モードに切り替えるか、文章を短くしてください。`,
    showExplanations: "解説を表示",
  };
  root.UI_TEXT.en = {
    ...(root.UI_TEXT.en || {}),
    extractionMode: "Extraction",
    extractionStandard: "Standard",
    extractionIntensive: "Close reading",
    intensiveHint: "For short passages. Finds much denser teaching targets and automatically uses High density.",
    intensiveTooLong: `Close-reading mode is for short passages up to ${core.INTENSIVE_MAX_SOURCE_LENGTH.toLocaleString("en-US")} characters. Switch to Standard or shorten the text.`,
    showExplanations: "Show explanations",
  };

  let mode = core.normalizeMode(root.localStorage.getItem("annotation.extractionMode"));
  let explanationsVisible = root.localStorage.getItem("annotation.showExplanations") !== "false";
  let previousDensity = root.localStorage.getItem("annotation.preIntensiveDensity") || "2";
  const previousFetch = root.fetch.bind(root);

  function currentUiLanguage() {
    return root.document.getElementById("uiLangSelect")?.value || "ja";
  }

  function text(key, fallbackJa, fallbackEn) {
    try {
      if (typeof t === "function") {
        const translated = t(key);
        if (translated && translated !== key) return translated;
      }
    } catch {
      // Use bundled fallback.
    }
    return String(currentUiLanguage()).toLowerCase().startsWith("ja") ? fallbackJa : fallbackEn;
  }

  function installStyles() {
    if (root.document.getElementById("intensiveModeStyles")) return;
    const style = root.document.createElement("style");
    style.id = "intensiveModeStyles";
    style.textContent = `
      .extraction-mode-control{margin-top:0}
      .extraction-mode-hint{margin:7px 0 0;color:var(--muted);font-size:11px;line-height:1.5}
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

  function updateDensityForMode(nextMode, previousMode) {
    const range = root.document.getElementById("densityRange");
    if (!range) return;
    if (core.isIntensive(nextMode)) {
      if (!core.isIntensive(previousMode)) {
        previousDensity = range.value || "2";
        root.localStorage.setItem("annotation.preIntensiveDensity", previousDensity);
      }
      range.value = "3";
    } else if (core.isIntensive(previousMode)) {
      range.value = ["1", "2", "3"].includes(previousDensity) ? previousDensity : "2";
    }
    try {
      if (typeof updateDensityLabel === "function") updateDensityLabel(true);
      else range.dispatchEvent(new Event("input", { bubbles: true }));
    } catch {
      range.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function setMode(nextMode, options = {}) {
    const previousMode = mode;
    mode = core.normalizeMode(nextMode);
    if (options.adjustDensity !== false) updateDensityForMode(mode, previousMode);
    if (options.persist !== false) root.localStorage.setItem("annotation.extractionMode", mode);
    root.document.querySelectorAll(".extraction-mode-segment").forEach((button) => {
      const active = button.dataset.extractionMode === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    relabel();
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
    if (!root.document.getElementById("extractionModeControl")) {
      const anchor = root.document.querySelector(".analysis-mode-segment")?.closest(".control-group");
      if (anchor) {
        const group = root.document.createElement("div");
        group.id = "extractionModeControl";
        group.className = "control-group extraction-mode-control";

        const label = root.document.createElement("div");
        label.className = "field-label";
        label.dataset.intensiveI18n = "extractionMode";

        const segmented = root.document.createElement("div");
        segmented.className = "segmented";
        segmented.setAttribute("role", "group");
        segmented.setAttribute("aria-label", "Extraction mode");

        for (const value of [core.STANDARD_MODE, core.INTENSIVE_MODE]) {
          const button = root.document.createElement("button");
          button.type = "button";
          button.className = "segment extraction-mode-segment";
          button.dataset.extractionMode = value;
          button.addEventListener("click", () => setMode(value));
          segmented.appendChild(button);
        }

        const hint = root.document.createElement("p");
        hint.id = "intensiveModeHint";
        hint.className = "extraction-mode-hint";
        group.append(label, segmented, hint);
        anchor.insertAdjacentElement("afterend", group);
      }
    }

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
    const label = root.document.querySelector('[data-intensive-i18n="extractionMode"]');
    const standard = root.document.querySelector('[data-extraction-mode="standard"]');
    const intensive = root.document.querySelector('[data-extraction-mode="intensive"]');
    const hint = root.document.getElementById("intensiveModeHint");
    const show = root.document.querySelector('[data-intensive-i18n="showExplanations"]');
    if (label) label.textContent = text("extractionMode", "抽出方針", "Extraction");
    if (standard) standard.textContent = text("extractionStandard", "通常", "Standard");
    if (intensive) intensive.textContent = text("extractionIntensive", "精読", "Close reading");
    if (hint) {
      hint.textContent = core.isIntensive(mode)
        ? text(
          "intensiveHint",
          "短い文章向け。候補を高密度に拾い、抽出量は自動で「多め」にします。",
          "For short passages. Finds much denser teaching targets and automatically uses High density.",
        )
        : "";
      hint.hidden = !core.isIntensive(mode);
    }
    if (show) show.textContent = text("showExplanations", "解説を表示", "Show explanations");
  }

  function tooLongMessage() {
    return text(
      "intensiveTooLong",
      `精読モードは${core.INTENSIVE_MAX_SOURCE_LENGTH.toLocaleString("ja-JP")}文字以内の短い文章向けです。通常モードに切り替えるか、文章を短くしてください。`,
      `Close-reading mode is for short passages up to ${core.INTENSIVE_MAX_SOURCE_LENGTH.toLocaleString("en-US")} characters. Switch to Standard or shorten the text.`,
    );
  }

  root.fetch = async function intensiveAwareFetch(input, init) {
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
    payload.extractionMode = mode;
    if (core.isIntensive(mode)) {
      if (core.isTooLong(payload.text)) {
        return new Response(JSON.stringify({
          error: "intensive_too_long",
          message: tooLongMessage(),
        }), {
          status: 400,
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      }
      payload.density = 3;
    }
    return previousFetch(input, { ...init, body: JSON.stringify(payload) });
  };

  function install() {
    installStyles();
    installControls();
    setMode(mode, { adjustDensity: false, persist: false });
    if (core.isIntensive(mode)) updateDensityForMode(mode, core.STANDARD_MODE);
    setExplanationsVisible(explanationsVisible, { persist: false });
    relabel();
    root.document.getElementById("uiLangSelect")?.addEventListener("change", () => root.setTimeout(relabel, 0));
  }

  root.INTENSIVE_MODE = {
    getMode: () => mode,
    getExplanationsVisible: () => explanationsVisible,
    setMode,
    setExplanationsVisible,
  };

  if (root.document.readyState === "loading") {
    root.document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    root.setTimeout(install, 0);
  }
}(typeof globalThis !== "undefined" ? globalThis : this));

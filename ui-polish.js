(function installUiPolish(root) {
  function isStructuralLine(line) {
    const value = String(line || "").trim();
    if (!value) return false;
    return /^(?:[-*•▪◦‣⁃]\s+|(?:\d+|[A-Za-z])[.)]\s+|#{1,6}\s+|>\s+)/u.test(value);
  }

  function canDehyphenate(left, right) {
    return /[A-Za-z]-$/u.test(left) && /^[a-z]/u.test(right);
  }

  function needsJoinSpace(left, right) {
    const cjkEnd = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}、。，．！？）」』】〕〉》]$/u;
    const cjkStart = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}「『（【〔〈《]/u;
    return !(cjkEnd.test(left) || cjkStart.test(right));
  }

  function joinProseBlock(block) {
    const lines = String(block || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length <= 1) return lines[0] || "";

    let output = lines[0];
    for (let index = 1; index < lines.length; index += 1) {
      const previous = lines[index - 1];
      const current = lines[index];
      if (isStructuralLine(previous) || isStructuralLine(current)) {
        output += `\n${current}`;
        continue;
      }
      if (canDehyphenate(output, current)) {
        output = `${output.slice(0, -1)}${current}`;
        continue;
      }
      output += `${needsJoinSpace(output, current) ? " " : ""}${current}`;
    }
    return output;
  }

  function normalizePastedProse(text) {
    const normalized = String(text ?? "")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .trim();
    if (!normalized.includes("\n")) return normalized;

    return normalized
      .split(/\n{2,}/)
      .map(joinProseBlock)
      .filter(Boolean)
      .join("\n\n");
  }

  const api = { normalizePastedProse, joinProseBlock, isStructuralLine };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (!root?.document) return;
  root.UI_POLISH = api;

  const filterDefinitions = [
    {
      key: "vocab",
      textKey: "vocab",
      fallbackJa: "単語・専門語",
      fallbackEn: "Words / terms",
      statId: "statVocab",
    },
    {
      key: "phrase",
      textKey: "expression",
      fallbackJa: "表現・慣用表現",
      fallbackEn: "Expressions / idioms",
      statId: "statPhrase",
    },
    {
      key: "grammar",
      textKey: "grammar",
      fallbackJa: "構文",
      fallbackEn: "Constructions",
      statId: "statGrammar",
    },
    {
      key: "nuance",
      textKey: "nuance",
      fallbackJa: "ニュアンス",
      fallbackEn: "Nuance",
      statId: "statNuance",
    },
  ];

  const enabledFilters = new Set(filterDefinitions.map((item) => item.key));

  function uiText(key, fallbackJa, fallbackEn) {
    try {
      if (typeof root.t === "function") {
        const translated = root.t(key);
        if (translated && translated !== key) return translated;
      }
    } catch {
      // Use bundled fallback below.
    }
    const language = root.document.getElementById("uiLangSelect")?.value || "ja";
    return String(language).toLowerCase().startsWith("ja") ? fallbackJa : fallbackEn;
  }

  function updateFilterVisibility() {
    const pane = root.document.querySelector(".result-pane");
    if (!pane) return;
    filterDefinitions.forEach(({ key }) => {
      pane.classList.toggle(`filter-hide-${key}`, !enabledFilters.has(key));
    });
  }

  function updateFilterButtons() {
    const bar = root.document.getElementById("annotationFilterBar");
    if (!bar) return;
    const allEnabled = enabledFilters.size === filterDefinitions.length;
    const allButton = bar.querySelector('[data-highlight-filter="all"]');
    if (allButton) {
      allButton.classList.toggle("active", allEnabled);
      allButton.setAttribute("aria-pressed", String(allEnabled));
      allButton.textContent = uiText("allFocus", "すべて", "All");
    }

    filterDefinitions.forEach((definition) => {
      const button = bar.querySelector(`[data-highlight-filter="${definition.key}"]`);
      if (!button) return;
      const enabled = enabledFilters.has(definition.key);
      const label = uiText(
        definition.textKey,
        definition.fallbackJa,
        definition.fallbackEn,
      );
      const count = root.document.getElementById(definition.statId)?.textContent || "0";
      button.classList.toggle("active", enabled);
      button.setAttribute("aria-pressed", String(enabled));
      button.innerHTML = `<span>${label}</span><strong>${count}</strong>`;
    });
  }

  function installFilterBar() {
    if (root.document.getElementById("annotationFilterBar")) return;
    const legend = root.document.querySelector(".legend");
    const stats = root.document.querySelector(".stats-row");
    if (!legend || !stats) return;

    const bar = root.document.createElement("div");
    bar.id = "annotationFilterBar";
    bar.className = "annotation-filter-bar";
    bar.setAttribute("aria-label", "Highlight filters");

    const allButton = root.document.createElement("button");
    allButton.type = "button";
    allButton.className = "annotation-filter-chip filter-all active";
    allButton.dataset.highlightFilter = "all";
    allButton.setAttribute("aria-pressed", "true");
    allButton.addEventListener("click", () => {
      filterDefinitions.forEach(({ key }) => enabledFilters.add(key));
      updateFilterVisibility();
      updateFilterButtons();
    });
    bar.appendChild(allButton);

    filterDefinitions.forEach((definition) => {
      const button = root.document.createElement("button");
      button.type = "button";
      button.className = `annotation-filter-chip filter-${definition.key} active`;
      button.dataset.highlightFilter = definition.key;
      button.setAttribute("aria-pressed", "true");
      button.addEventListener("click", () => {
        if (enabledFilters.has(definition.key)) enabledFilters.delete(definition.key);
        else enabledFilters.add(definition.key);
        updateFilterVisibility();
        updateFilterButtons();
      });
      bar.appendChild(button);
    });

    const helpButton = root.document.createElement("button");
    helpButton.type = "button";
    helpButton.className = "annotation-filter-help";
    helpButton.textContent = "?";
    helpButton.title = uiText("categoryGlossaryOpen", "ニュアンスカテゴリの説明", "Nuance category help");
    helpButton.setAttribute("aria-label", helpButton.title);
    helpButton.addEventListener("click", () => {
      if (typeof root.openCategoryGlossary === "function") root.openCategoryGlossary();
      else root.document.getElementById("categoryGlossaryBtn")?.click();
    });
    bar.appendChild(helpButton);

    stats.insertAdjacentElement("afterend", bar);
    stats.hidden = true;
    legend.hidden = true;

    const observer = new MutationObserver(updateFilterButtons);
    filterDefinitions.forEach(({ statId }) => {
      const node = root.document.getElementById(statId);
      if (node) observer.observe(node, { childList: true, characterData: true, subtree: true });
    });
    updateFilterButtons();
  }

  function removeSlashUi() {
    const checkbox = root.document.getElementById("includeSlash");
    if (checkbox) {
      checkbox.checked = false;
      checkbox.closest("label")?.setAttribute("hidden", "");
      try { root.localStorage.setItem("annotation.includeSlash", "false"); } catch {}
    }
    root.document.querySelector('.tab[data-tab="slash"]')?.setAttribute("hidden", "");
    root.document.getElementById("panel-slash")?.setAttribute("hidden", "");
  }

  function hideInlineNuanceSummary() {
    root.document.getElementById("inlineNuancePanel")?.setAttribute("hidden", "");
  }

  function polishBrandTitle() {
    const title = root.document.querySelector('h1[data-i18n="appTitle"]');
    if (!title || title.dataset.wrapPolished === title.textContent) return;
    const text = title.textContent.trim();
    if (text !== "あの手ーターこの手ーター") return;
    title.dataset.wrapPolished = text;
    title.replaceChildren();
    for (const [index, unit] of ["あの手ーター", "この手ーター"].entries()) {
      if (index) title.appendChild(root.document.createElement("wbr"));
      const span = root.document.createElement("span");
      span.className = "brand-title-unit";
      span.textContent = unit;
      title.appendChild(span);
    }
  }

  function cleanBeforeAnalysis() {
    const source = root.document.getElementById("sourceText");
    if (!source || !source.value.trim()) return;
    const cleaned = normalizePastedProse(source.value);
    if (!cleaned || cleaned === source.value) return;
    source.value = cleaned;
    try { root.localStorage.setItem("annotation.sourceText", cleaned); } catch {}
  }

  function installTextCleanup() {
    ["annotateBtn", "reanalyzeBtn"].forEach((id) => {
      root.document.getElementById(id)?.addEventListener("click", cleanBeforeAnalysis, true);
    });
  }

  function install() {
    installFilterBar();
    removeSlashUi();
    hideInlineNuanceSummary();
    polishBrandTitle();
    installTextCleanup();

    const title = root.document.querySelector('h1[data-i18n="appTitle"]');
    if (title) new MutationObserver(polishBrandTitle).observe(title, { childList: true, subtree: true });
    root.document.getElementById("uiLangSelect")?.addEventListener("change", () => {
      root.setTimeout(() => {
        polishBrandTitle();
        updateFilterButtons();
        removeSlashUi();
        hideInlineNuanceSummary();
      }, 0);
    });

    const resultPane = root.document.querySelector(".result-pane");
    if (resultPane) {
      new MutationObserver(() => {
        removeSlashUi();
        hideInlineNuanceSummary();
      }).observe(resultPane, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
    }
  }

  if (root.document.readyState === "loading") {
    root.document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    root.setTimeout(install, 0);
  }
}(typeof globalThis !== "undefined" ? globalThis : this));

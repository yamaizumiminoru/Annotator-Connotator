(function installDisplaySettingsPolish(root) {
  if (!root?.document) return;

  function currentLanguage() {
    return String(root.document.getElementById("uiLangSelect")?.value || "ja").toLowerCase();
  }

  function patchLabelCatalog() {
    if (root.UI_TEXT?.ja) {
      root.UI_TEXT.ja.includeTranslation = "翻訳を生成";
      root.UI_TEXT.ja.showExplanations = "語句解説を表示";
    }
    if (root.UI_TEXT?.en) {
      root.UI_TEXT.en.includeTranslation = "Generate translation";
      root.UI_TEXT.en.showExplanations = "Show word explanations";
    }
  }

  function relabelTranslationGeneration() {
    patchLabelCatalog();
    const labelText = root.document.querySelector('label:has(#includeTranslation) [data-i18n="includeTranslation"]');
    if (!labelText) return;

    const language = currentLanguage();
    let nextText;
    if (language.startsWith("ja")) nextText = "翻訳を生成";
    else if (language.startsWith("en")) nextText = "Generate translation";
    else {
      try {
        const translated = typeof root.t === "function" ? root.t("includeTranslation") : "";
        nextText = translated && translated !== "翻訳を表示" && translated !== "Show translation"
          ? translated
          : "Generate translation";
      } catch {
        nextText = "Generate translation";
      }
    }
    if (labelText.textContent !== nextText) labelText.textContent = nextText;
  }

  function relabelExplanationVisibility() {
    patchLabelCatalog();
    const labelText = root.document.querySelector('[data-teaching-i18n="showExplanations"]');
    if (!labelText) return;

    const language = currentLanguage();
    let nextText;
    if (language.startsWith("ja")) nextText = "語句解説を表示";
    else if (language.startsWith("en")) nextText = "Show word explanations";
    else {
      try {
        const translated = typeof root.t === "function" ? root.t("showExplanations") : "";
        nextText = translated && translated !== "解説を表示" && translated !== "Show explanations"
          ? translated
          : "Show word explanations";
      } catch {
        nextText = "Show word explanations";
      }
    }
    if (labelText.textContent !== nextText) labelText.textContent = nextText;
  }

  function moveExplanationToggleToResults() {
    const checkbox = root.document.getElementById("showExplanations");
    const label = checkbox?.closest("label");
    const filterBar = root.document.getElementById("annotationFilterBar");
    if (!label || !filterBar) return;

    label.classList.add("result-display-toggle");
    const help = filterBar.querySelector(".annotation-filter-help");
    if (help) {
      if (help.nextElementSibling !== label) help.insertAdjacentElement("afterend", label);
    } else if (!filterBar.contains(label) || filterBar.lastElementChild !== label) {
      filterBar.appendChild(label);
    }
  }

  function hideVocabularyControlInCategoryGlossary() {
    const overlay = root.document.getElementById("overlay");
    if (!overlay) return;
    const isGlossary = Boolean(overlay.querySelector(".category-glossary"));
    overlay.querySelectorAll(".vocab-register-control").forEach((control) => {
      const nextDisplay = isGlossary ? "none" : "";
      if (control.style.display !== nextDisplay) control.style.display = nextDisplay;
    });
  }

  function refresh() {
    relabelTranslationGeneration();
    relabelExplanationVisibility();
    moveExplanationToggleToResults();
    hideVocabularyControlInCategoryGlossary();
  }

  function install() {
    patchLabelCatalog();
    refresh();

    root.document.getElementById("uiLangSelect")?.addEventListener("change", () => {
      root.setTimeout(refresh, 0);
    });

    const observer = new MutationObserver(refresh);
    observer.observe(root.document.body, { childList: true, subtree: true });
  }

  if (root.document.readyState === "loading") {
    root.document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    root.setTimeout(install, 0);
  }
}(typeof globalThis !== "undefined" ? globalThis : this));

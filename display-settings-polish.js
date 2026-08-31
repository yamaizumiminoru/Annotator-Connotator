(function installDisplaySettingsPolish(root) {
  if (!root?.document) return;

  function currentLanguage() {
    return String(root.document.getElementById("uiLangSelect")?.value || "ja").toLowerCase();
  }

  function patchTranslationLabelCatalog() {
    if (root.UI_TEXT?.ja) root.UI_TEXT.ja.includeTranslation = "翻訳を生成";
    if (root.UI_TEXT?.en) root.UI_TEXT.en.includeTranslation = "Generate translation";
  }

  function relabelTranslationGeneration() {
    patchTranslationLabelCatalog();
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

  function moveExplanationToggleToResults() {
    const checkbox = root.document.getElementById("showExplanations");
    const label = checkbox?.closest("label");
    const filterBar = root.document.getElementById("annotationFilterBar");
    if (!label || !filterBar || filterBar.contains(label)) return;

    label.classList.add("result-display-toggle");
    const help = filterBar.querySelector(".annotation-filter-help");
    filterBar.insertBefore(label, help || null);
  }

  function refresh() {
    relabelTranslationGeneration();
    moveExplanationToggleToResults();
  }

  function install() {
    patchTranslationLabelCatalog();
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

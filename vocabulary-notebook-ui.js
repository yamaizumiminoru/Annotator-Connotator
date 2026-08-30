(function polishVocabularyNotebookUi(root) {
  if (!root?.document) return;

  root.UI_TEXT = root.UI_TEXT || {};
  root.UI_TEXT.ja = {
    ...(root.UI_TEXT.ja || {}),
    vocabularySource: "出典",
    vocabularyExportLabel: "エクスポート",
  };
  root.UI_TEXT.en = {
    ...(root.UI_TEXT.en || {}),
    vocabularySource: "Source",
    vocabularyExportLabel: "Export",
  };

  function uiLanguageCode() {
    try {
      if (typeof state === "object" && state?.uiLanguage) return state.uiLanguage;
    } catch {
      // Fall back to the selector.
    }
    return root.document.getElementById("uiLangSelect")?.value || "ja";
  }

  function labelText(key, fallbackJa, fallbackEn) {
    try {
      if (typeof t === "function") {
        const translated = t(key);
        if (translated && translated !== key) return translated;
      }
    } catch {
      // Fall back to bundled Japanese/English text.
    }
    return String(uiLanguageCode()).toLowerCase().startsWith("ja") ? fallbackJa : fallbackEn;
  }

  function preferLightColorScheme() {
    let meta = root.document.querySelector('meta[name="color-scheme"]');
    if (!meta) {
      meta = root.document.createElement("meta");
      meta.name = "color-scheme";
      root.document.head.appendChild(meta);
    }
    meta.content = "only light";
    root.document.documentElement.style.colorScheme = "only light";
  }

  function loadUiPolishModule() {
    if (root.document.querySelector('script[data-ui-polish="true"]')) return;
    const script = root.document.createElement("script");
    script.src = "./ui-polish.js";
    script.dataset.uiPolish = "true";
    root.document.head.appendChild(script);
  }

  function resyncSelectedUiLanguage() {
    const select = root.document.getElementById("uiLangSelect");
    if (!select) return;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function resyncUiAfterPageLoad() {
    if (root.document.readyState === "complete") {
      root.setTimeout(resyncSelectedUiLanguage, 0);
      return;
    }
    root.addEventListener("load", () => root.setTimeout(resyncSelectedUiLanguage, 0), { once: true });
  }

  function loadMaterialIoModule() {
    if (root.document.querySelector('script[data-material-io="true"]')) return;
    const script = root.document.createElement("script");
    script.src = "./material-io.js";
    script.async = false;
    script.dataset.materialIo = "true";
    script.addEventListener("load", resyncUiAfterPageLoad, { once: true });
    root.document.head.appendChild(script);
  }

  function installStyles() {
    if (root.document.getElementById("vocabularyNotebookUiPolishStyles")) return;
    const style = root.document.createElement("style");
    style.id = "vocabularyNotebookUiPolishStyles";
    style.textContent = `
      .vocabulary-export-label{display:inline-flex;align-items:center;color:var(--muted);font-size:12px;font-weight:650;margin-right:2px}
      .word-card > .vocab-register-control{margin-top:12px;margin-bottom:0}
      .stats-row,.legend,.tab[data-tab="slash"],#panel-slash,label:has(#includeSlash){display:none!important}
    `;
    root.document.head.appendChild(style);
  }

  function updateExportLabel() {
    const toolbar = root.document.querySelector(".vocabulary-export");
    if (!toolbar) return;
    let label = toolbar.querySelector(".vocabulary-export-label");
    if (!label) {
      label = root.document.createElement("span");
      label.className = "vocabulary-export-label";
      toolbar.prepend(label);
    }
    label.textContent = labelText("vocabularyExportLabel", "エクスポート", "Export");
  }

  function moveRegistrationControlsToEnd() {
    root.document.querySelectorAll("#wordList > .word-card:not(.nuance-card)").forEach((card) => {
      const control = card.querySelector(":scope > .vocab-register-control");
      if (control && card.lastElementChild !== control) card.appendChild(control);
    });
  }

  function polishBrandTitle() {
    const title = root.document.querySelector('h1[data-i18n="appTitle"]');
    if (!title) return;
    const text = title.textContent.trim();
    if (text !== "あの手ーターこの手ーター") return;

    const units = [...title.querySelectorAll(":scope > .brand-title-unit")];
    if (
      units.length === 2
      && units[0].textContent === "あの手ーター"
      && units[1].textContent === "この手ーター"
    ) return;

    title.replaceChildren();
    ["あの手ーター", "この手ーター"].forEach((unit, index) => {
      if (index) title.appendChild(root.document.createElement("wbr"));
      const span = root.document.createElement("span");
      span.className = "brand-title-unit";
      span.textContent = unit;
      title.appendChild(span);
    });
  }

  function polishDynamicUi() {
    updateExportLabel();
    moveRegistrationControlsToEnd();
    polishBrandTitle();
  }

  function install() {
    installStyles();
    polishDynamicUi();

    const wordList = root.document.getElementById("wordList");
    if (wordList) {
      new MutationObserver(moveRegistrationControlsToEnd).observe(wordList, { childList: true, subtree: true });
    }

    const vocabularyList = root.document.getElementById("vocabularyList");
    if (vocabularyList) {
      new MutationObserver(updateExportLabel).observe(vocabularyList, { childList: true, subtree: true });
    }

    const title = root.document.querySelector('h1[data-i18n="appTitle"]');
    if (title) {
      new MutationObserver(polishBrandTitle).observe(title, { childList: true, subtree: true, characterData: true });
    }

    root.document.getElementById("uiLangSelect")?.addEventListener("change", () => root.setTimeout(polishDynamicUi, 0));
  }

  preferLightColorScheme();
  loadUiPolishModule();
  loadMaterialIoModule();
  if (root.document.readyState === "loading") {
    root.document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    root.setTimeout(install, 0);
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
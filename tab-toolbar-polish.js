(function installTabToolbarPolish(root) {
  if (!root?.document || root.__tabToolbarPolishInstalled) return;
  root.__tabToolbarPolishInstalled = true;

  function installStyles() {
    if (root.document.getElementById("tabToolbarPolishStyles")) return;
    const style = root.document.createElement("style");
    style.id = "tabToolbarPolishStyles";
    style.textContent = `
      .result-pane .top-bar{margin-bottom:10px}
      .tab-specific-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px 14px;flex-wrap:wrap;margin:0 0 12px}
      .tab-specific-toolbar[hidden]{display:none!important}
      .tab-specific-toolbar .annotation-filter-bar{flex:1 1 520px;margin:0;min-width:0}
      .tab-specific-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px 10px;flex-wrap:wrap;margin-left:auto}
      .tab-specific-actions[hidden]{display:none!important}
      .tab-specific-toolbar .tts-controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0}
      .tab-specific-toolbar .reading-difficulty-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0}
      .tab-specific-toolbar .reading-difficulty-hint{max-width:220px;line-height:1.35}
      .tab-specific-toolbar[data-active-tab="annotated"] .result-display-toggle{display:none!important}
      .vocabulary-head.vocabulary-head-no-title{justify-content:flex-end}
      @media(max-width:900px){
        .tab-specific-toolbar{align-items:flex-start}
        .tab-specific-toolbar .annotation-filter-bar{flex-basis:100%}
        .tab-specific-actions{width:100%;justify-content:flex-start;margin-left:0}
        .tab-specific-toolbar .reading-difficulty-hint{max-width:none}
      }
    `;
    root.document.head.appendChild(style);
  }

  function activeTabName() {
    return root.document.querySelector(".tab.active")?.dataset.tab || "annotated";
  }

  function removeRedundantVocabularyTitle() {
    const title = root.document.getElementById("vocabularyTitle");
    if (!title) return;
    const head = title.closest(".vocabulary-head");
    if (head) head.classList.add("vocabulary-head-no-title");
    title.remove();
  }

  function ensureToolbar() {
    const topBar = root.document.querySelector(".result-pane .top-bar");
    const filterBar = root.document.getElementById("annotationFilterBar");
    if (!topBar || !filterBar) return false;

    let toolbar = root.document.getElementById("tabSpecificToolbar");
    if (!toolbar) {
      toolbar = root.document.createElement("div");
      toolbar.id = "tabSpecificToolbar";
      toolbar.className = "tab-specific-toolbar";
      topBar.insertAdjacentElement("afterend", toolbar);
    }

    if (filterBar.parentElement !== toolbar) toolbar.prepend(filterBar);

    let actions = root.document.getElementById("annotatedTabTools");
    if (!actions) {
      actions = root.document.createElement("div");
      actions.id = "annotatedTabTools";
      actions.className = "tab-specific-actions";
      toolbar.appendChild(actions);
    }

    const reading = root.document.querySelector(".reading-difficulty-actions");
    if (reading && reading.parentElement !== actions) actions.appendChild(reading);

    const tts = root.document.querySelector(".tts-controls") || root.document.getElementById("speakBtn");
    if (tts && tts.parentElement !== actions) actions.appendChild(tts);

    removeRedundantVocabularyTitle();
    updateToolbar(toolbar, actions);
    return true;
  }

  function updateToolbar(
    toolbar = root.document.getElementById("tabSpecificToolbar"),
    actions = root.document.getElementById("annotatedTabTools"),
  ) {
    if (!toolbar) return;
    const active = activeTabName();
    toolbar.dataset.activeTab = active;
    const usesAnnotationTools = active === "annotated" || active === "words";
    toolbar.hidden = !usesAnnotationTools;
    if (actions) actions.hidden = active !== "annotated";
  }

  function observeTabs() {
    const row = root.document.querySelector(".tab-row");
    if (!row || row.dataset.tabToolbarObserved === "true") return;
    row.dataset.tabToolbarObserved = "true";
    const observer = new MutationObserver(() => {
      updateToolbar();
      removeRedundantVocabularyTitle();
    });
    observer.observe(row, {
      attributes: true,
      attributeFilter: ["class"],
      childList: true,
      subtree: true,
    });
  }

  function install(attempt = 0) {
    installStyles();
    const ready = ensureToolbar();
    if (ready) observeTabs();
    if ((!ready || attempt < 8) && attempt < 40) {
      root.setTimeout(() => install(attempt + 1), ready ? 120 : 50);
    }
  }

  if (root.document.readyState === "loading") {
    root.document.addEventListener("DOMContentLoaded", () => install(), { once: true });
  } else {
    root.setTimeout(() => install(), 0);
  }
}(typeof globalThis !== "undefined" ? globalThis : this));

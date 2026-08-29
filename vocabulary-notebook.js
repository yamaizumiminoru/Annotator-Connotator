(function initVocabularyNotebook(root) {
  if (!root?.document) return;

  const core = root.VOCABULARY_NOTEBOOK_CORE;
  if (!core) return;

  const DB_NAME = "annotator-connotator-study";
  const DB_VERSION = 1;
  const SOURCE_STORE = "sources";
  const CARD_STORE = "cards";
  const UI = {
    ja: {
      tab: "単語帳",
      register: "単語帳に登録",
      title: "単語帳",
      count: "{count}件登録",
      search: "語句・意味・例文を検索",
      allLanguages: "すべての言語",
      allTypes: "すべての種類",
      exportJson: "JSON",
      exportCsv: "CSV",
      exportAnki: "Anki CSV",
      empty: "まだ単語帳に登録された語句はありません。語句カードやポップアップのチェックボックスから登録できます。",
      noMatches: "条件に一致する語句がありません。",
      source: "出典を見る",
      sourceUrl: "元のYouTubeを開く",
      remove: "登録解除",
      added: "登録",
      example: "例",
      pattern: "型",
      nuance: "ニュアンス",
      storageError: "単語帳の保存領域を開けませんでした。ブラウザのサイトデータ設定を確認してください。",
    },
    en: {
      tab: "Vocabulary",
      register: "Add to vocabulary",
      title: "Vocabulary notebook",
      count: "{count} saved",
      search: "Search words, meanings, and examples",
      allLanguages: "All languages",
      allTypes: "All types",
      exportJson: "JSON",
      exportCsv: "CSV",
      exportAnki: "Anki CSV",
      empty: "No saved items yet. Add them from a word card or annotation popup.",
      noMatches: "No saved items match these filters.",
      source: "Show source context",
      sourceUrl: "Open source YouTube video",
      remove: "Remove",
      added: "Saved",
      example: "Example",
      pattern: "Pattern",
      nuance: "Nuance",
      storageError: "The vocabulary storage could not be opened. Check this site's browser storage settings.",
    },
  };

  let dbPromise = null;
  let activePopupAnnotationId = null;
  let refreshTimer = null;
  let notebookCards = [];
  let notebookSources = [];

  function appState() {
    try {
      return typeof state === "object" ? state : null;
    } catch {
      return null;
    }
  }

  function appElements() {
    try {
      return typeof els === "object" ? els : null;
    } catch {
      return null;
    }
  }

  function uiLanguage() {
    const code = appState()?.uiLanguage || root.document.getElementById("uiLangSelect")?.value || "ja";
    return String(code).toLowerCase().startsWith("ja") ? "ja" : "en";
  }

  function vt(key, values = {}) {
    let text = UI[uiLanguage()]?.[key] || UI.en[key] || key;
    for (const [name, value] of Object.entries(values)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
    return text;
  }

  function extendBaseUiText() {
    if (!root.UI_TEXT) return;
    root.UI_TEXT.ja = { ...(root.UI_TEXT.ja || {}), vocabularyTab: UI.ja.tab };
    root.UI_TEXT.en = { ...(root.UI_TEXT.en || {}), vocabularyTab: UI.en.tab };
  }

  function openDb() {
    if (dbPromise) return dbPromise;
    if (!root.indexedDB) return Promise.reject(new Error("indexeddb_unavailable"));
    dbPromise = new Promise((resolve, reject) => {
      const request = root.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(SOURCE_STORE)) {
          db.createObjectStore(SOURCE_STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(CARD_STORE)) {
          const store = db.createObjectStore(CARD_STORE, { keyPath: "id" });
          store.createIndex("sourceId", "sourceId", { unique: false });
          store.createIndex("addedAt", "addedAt", { unique: false });
          store.createIndex("sourceLanguage", "sourceLanguage", { unique: false });
          store.createIndex("type", "type", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("indexeddb_open_failed"));
      request.onblocked = () => reject(new Error("indexeddb_blocked"));
    });
    return dbPromise;
  }

  async function getAll(storeName) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readonly");
      const request = transaction.objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || new Error("indexeddb_read_failed"));
    });
  }

  async function saveSourceAndCard(source, card) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction([SOURCE_STORE, CARD_STORE], "readwrite");
      transaction.objectStore(SOURCE_STORE).put(source);
      transaction.objectStore(CARD_STORE).put(card);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("indexeddb_write_failed"));
      transaction.onabort = () => reject(transaction.error || new Error("indexeddb_write_aborted"));
    });
  }

  async function deleteCard(id) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(CARD_STORE, "readwrite");
      transaction.objectStore(CARD_STORE).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("indexeddb_delete_failed"));
      transaction.onabort = () => reject(transaction.error || new Error("indexeddb_delete_aborted"));
    });
  }

  async function requestPersistentStorage() {
    try {
      if (root.navigator?.storage?.persist) await root.navigator.storage.persist();
    } catch {
      // IndexedDB remains usable even when persistent-storage permission is unavailable or denied.
    }
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function currentSourceSnapshot() {
    const current = appState();
    const elements = appElements();
    const result = current?.result;
    if (!result?.sourceText) return null;
    const source = {
      text: String(result.sourceText),
      sourceLanguage: result.sourceLanguage || elements?.sourceLangSelect?.value || "auto",
      explanationLanguage: result.explanationLanguage || elements?.explanationLangSelect?.value || "ja",
      inputMode: current.inputMode || "text",
      youtubeUrl: current.inputMode === "youtube" ? String(elements?.youtubeUrl?.value || "").trim() : "",
      label: current.inputMode === "youtube" && elements?.youtubeMeta?.textContent
        ? String(elements.youtubeMeta.textContent).trim()
        : String(result.sourceText).trim().replace(/\s+/g, " ").slice(0, 100),
    };
    source.id = core.makeSourceId(source);
    source.savedAt = new Date().toISOString();
    return source;
  }

  function cardForAnnotation(annotation) {
    const source = currentSourceSnapshot();
    if (!source || !annotation) return null;
    const current = appState();
    const related = current?.connotationsByAnnotationId?.get?.(annotation.id) || [];
    const card = {
      sourceId: source.id,
      sourceLanguage: source.sourceLanguage,
      text: String(annotation.text || ""),
      type: String(annotation.type || "word"),
      meaningJa: String(annotation.meaningJa || ""),
      noteJa: String(annotation.noteJa || ""),
      example: String(annotation.example || ""),
      pattern: String(annotation.pattern || ""),
      start: Number.isInteger(annotation.start) ? annotation.start : null,
      end: Number.isInteger(annotation.end) ? annotation.end : null,
      nuances: clone(related),
    };
    card.id = core.makeCardId(card);
    return { source, card };
  }

  function currentAnnotation(id) {
    return appState()?.annotationsById?.get?.(id) || null;
  }

  async function toggleAnnotation(annotationId, checked) {
    const annotation = currentAnnotation(annotationId);
    const payload = cardForAnnotation(annotation);
    if (!payload) return;
    try {
      if (checked) {
        await requestPersistentStorage();
        payload.card.addedAt = new Date().toISOString();
        await saveSourceAndCard(payload.source, payload.card);
      } else {
        await deleteCard(payload.card.id);
      }
      await reloadNotebookData();
    } catch {
      showStorageError();
    }
  }

  function showStorageError() {
    const box = root.document.getElementById("vocabularyStatus");
    if (box) {
      box.textContent = vt("storageError");
      box.hidden = false;
    }
  }

  function installStyles() {
    if (root.document.getElementById("vocabularyNotebookStyles")) return;
    const style = root.document.createElement("style");
    style.id = "vocabularyNotebookStyles";
    style.textContent = `
      .vocab-register-control { display:inline-flex; align-items:center; gap:7px; margin:8px 0 2px; padding:6px 9px; border:1px solid var(--line); border-radius:6px; background:var(--surface-2); color:var(--text); font-size:12px; cursor:pointer; }
      .vocab-register-control input { margin:0; }
      .popup .vocab-register-control { margin-top:10px; }
      .vocabulary-shell { display:flex; flex-direction:column; gap:12px; }
      .vocabulary-head { display:flex; align-items:center; justify-content:space-between; gap:12px; }
      .vocabulary-head h2 { margin:0; font-size:18px; }
      .vocabulary-count { color:var(--muted); font-size:12px; }
      .vocabulary-toolbar { display:grid; grid-template-columns:minmax(180px, 1.5fr) minmax(130px, .7fr) minmax(130px, .7fr); gap:8px; }
      .vocabulary-toolbar input, .vocabulary-toolbar select { width:100%; border:1px solid var(--line); background:var(--surface); color:var(--text); border-radius:6px; padding:8px 9px; }
      .vocabulary-export { display:flex; flex-wrap:wrap; gap:8px; }
      .vocabulary-list { display:grid; gap:10px; }
      .vocabulary-card { border:1px solid var(--line); border-radius:7px; background:var(--surface); padding:12px; }
      .vocabulary-card-head { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
      .vocabulary-card-title { display:flex; align-items:center; flex-wrap:wrap; gap:8px; }
      .vocabulary-card h3 { margin:0; font-size:17px; }
      .vocabulary-card p { margin:7px 0 0; line-height:1.55; }
      .vocabulary-card .meaning { font-weight:600; }
      .vocabulary-card .meta { color:var(--muted); font-size:11px; }
      .vocabulary-card details { margin-top:10px; border-top:1px solid var(--line); padding-top:9px; }
      .vocabulary-card summary { cursor:pointer; color:var(--accent); font-size:12px; }
      .vocabulary-context { margin-top:8px; padding:9px; border-radius:6px; background:var(--surface-2); white-space:pre-wrap; line-height:1.55; }
      .vocabulary-context mark { background:var(--vocab-bg); color:var(--vocab-fg); padding:1px 2px; }
      .vocabulary-source-link { display:inline-block; margin-top:8px; color:var(--accent); font-size:12px; }
      .vocabulary-empty { border:1px dashed var(--line-strong); border-radius:7px; padding:20px; color:var(--muted); text-align:center; }
      .vocabulary-status { color:var(--accent-2); font-size:12px; }
      @media (max-width: 760px) { .vocabulary-toolbar { grid-template-columns:1fr; } .vocabulary-card-head { align-items:stretch; } }
    `;
    root.document.head.appendChild(style);
  }

  function installTabAndPanel() {
    if (root.document.querySelector('.tab[data-tab="vocabulary"]')) return;
    const wordsTab = root.document.querySelector('.tab[data-tab="words"]');
    const wordsPanel = root.document.getElementById("panel-words");
    if (!wordsTab || !wordsPanel) return;

    const tab = root.document.createElement("button");
    tab.className = "tab";
    tab.type = "button";
    tab.dataset.tab = "vocabulary";
    tab.textContent = vt("tab");
    wordsTab.insertAdjacentElement("afterend", tab);

    const panel = root.document.createElement("section");
    panel.className = "panel";
    panel.id = "panel-vocabulary";
    panel.innerHTML = `
      <div class="vocabulary-shell">
        <div class="vocabulary-head">
          <h2 id="vocabularyTitle"></h2>
          <span class="vocabulary-count" id="vocabularyCount"></span>
        </div>
        <div class="vocabulary-toolbar">
          <input id="vocabularySearch" type="search">
          <select id="vocabularyLanguageFilter"></select>
          <select id="vocabularyTypeFilter"></select>
        </div>
        <div class="vocabulary-export">
          <button class="ghost-btn" id="vocabularyExportJson" type="button"></button>
          <button class="ghost-btn" id="vocabularyExportCsv" type="button"></button>
          <button class="ghost-btn" id="vocabularyExportAnki" type="button"></button>
        </div>
        <p class="vocabulary-status" id="vocabularyStatus" hidden></p>
        <div class="vocabulary-list" id="vocabularyList"></div>
      </div>
    `;
    wordsPanel.insertAdjacentElement("afterend", panel);

    tab.addEventListener("click", () => {
      if (typeof root.showTab === "function") root.showTab("vocabulary");
      else {
        root.document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item === tab));
        root.document.querySelectorAll(".panel").forEach((item) => item.classList.toggle("active", item === panel));
      }
      void reloadNotebookData();
    });

    root.document.getElementById("vocabularySearch")?.addEventListener("input", renderNotebookList);
    root.document.getElementById("vocabularyLanguageFilter")?.addEventListener("change", renderNotebookList);
    root.document.getElementById("vocabularyTypeFilter")?.addEventListener("change", renderNotebookList);
    root.document.getElementById("vocabularyExportJson")?.addEventListener("click", exportJson);
    root.document.getElementById("vocabularyExportCsv")?.addEventListener("click", exportCsv);
    root.document.getElementById("vocabularyExportAnki")?.addEventListener("click", exportAnki);
    updateNotebookUiText();
  }

  function updateNotebookUiText() {
    const tab = root.document.querySelector('.tab[data-tab="vocabulary"]');
    if (tab) tab.textContent = vt("tab");
    const title = root.document.getElementById("vocabularyTitle");
    if (title) title.textContent = vt("title");
    const search = root.document.getElementById("vocabularySearch");
    if (search) search.placeholder = vt("search");
    const json = root.document.getElementById("vocabularyExportJson");
    const csv = root.document.getElementById("vocabularyExportCsv");
    const anki = root.document.getElementById("vocabularyExportAnki");
    if (json) json.textContent = vt("exportJson");
    if (csv) csv.textContent = vt("exportCsv");
    if (anki) anki.textContent = vt("exportAnki");
    updateFilterOptions();
    updateRegistrationLabels();
    renderNotebookList();
  }

  function installPopupControl() {
    const popup = root.document.querySelector(".popup");
    const nuances = root.document.getElementById("popupNuances");
    if (!popup || !nuances || root.document.getElementById("popupVocabularyControl")) return;
    const label = root.document.createElement("label");
    label.className = "vocab-register-control";
    label.id = "popupVocabularyControl";
    label.hidden = true;
    const input = root.document.createElement("input");
    input.type = "checkbox";
    input.id = "popupVocabularyCheckbox";
    const text = root.document.createElement("span");
    text.className = "vocab-register-label";
    text.textContent = vt("register");
    label.append(input, text);
    nuances.insertAdjacentElement("beforebegin", label);
    label.addEventListener("click", (event) => event.stopPropagation());
    input.addEventListener("change", () => {
      if (!activePopupAnnotationId) return;
      void toggleAnnotation(activePopupAnnotationId, input.checked);
    });
  }

  function patchPopupFunctions() {
    if (typeof root.openPopup === "function" && !root.openPopup.__vocabularyPatched) {
      const original = root.openPopup;
      const patched = function vocabularyAwareOpenPopup(id) {
        activePopupAnnotationId = id;
        const value = original.apply(this, arguments);
        void refreshPopupControl();
        return value;
      };
      patched.__vocabularyPatched = true;
      root.openPopup = patched;
    }
    if (typeof root.openConnotationPopup === "function" && !root.openConnotationPopup.__vocabularyPatched) {
      const original = root.openConnotationPopup;
      const patched = function vocabularyAwareOpenConnotationPopup() {
        activePopupAnnotationId = null;
        const value = original.apply(this, arguments);
        const control = root.document.getElementById("popupVocabularyControl");
        if (control) control.hidden = true;
        return value;
      };
      patched.__vocabularyPatched = true;
      root.openConnotationPopup = patched;
    }
  }

  function decorateWordList() {
    const current = appState();
    const list = root.document.getElementById("wordList");
    if (!current?.result || !list) return;
    const cards = [...list.querySelectorAll(":scope > .word-card:not(.nuance-card)")];
    current.result.annotations.forEach((annotation, index) => {
      const card = cards[index];
      if (!card || card.querySelector(".vocab-register-control")) return;
      const label = root.document.createElement("label");
      label.className = "vocab-register-control";
      label.dataset.annotationId = annotation.id;
      const input = root.document.createElement("input");
      input.type = "checkbox";
      input.className = "vocab-register-input";
      const text = root.document.createElement("span");
      text.className = "vocab-register-label";
      text.textContent = vt("register");
      label.append(input, text);
      const head = card.querySelector(".word-card-head");
      if (head) head.insertAdjacentElement("afterend", label);
      else card.prepend(label);
      label.addEventListener("click", (event) => event.stopPropagation());
      input.addEventListener("change", () => void toggleAnnotation(annotation.id, input.checked));
    });
    void refreshRegistrationControls();
  }

  function scheduleDecorateWordList() {
    root.clearTimeout(refreshTimer);
    refreshTimer = root.setTimeout(decorateWordList, 0);
  }

  function installWordListObserver() {
    const list = root.document.getElementById("wordList");
    if (!list) return;
    const observer = new MutationObserver(scheduleDecorateWordList);
    observer.observe(list, { childList: true, subtree: true });
    decorateWordList();
  }

  function updateRegistrationLabels() {
    root.document.querySelectorAll(".vocab-register-label").forEach((label) => {
      label.textContent = vt("register");
    });
  }

  async function refreshRegistrationControls() {
    const source = currentSourceSnapshot();
    const current = appState();
    if (!source || !current?.result) return;
    const savedIds = new Set(notebookCards.map((card) => card.id));
    root.document.querySelectorAll(".vocab-register-control[data-annotation-id]").forEach((label) => {
      const annotation = currentAnnotation(label.dataset.annotationId);
      const payload = cardForAnnotation(annotation);
      const input = label.querySelector("input");
      if (input && payload) input.checked = savedIds.has(payload.card.id);
    });
    await refreshPopupControl();
  }

  async function refreshPopupControl() {
    const control = root.document.getElementById("popupVocabularyControl");
    const input = root.document.getElementById("popupVocabularyCheckbox");
    if (!control || !input || !activePopupAnnotationId) {
      if (control) control.hidden = true;
      return;
    }
    const annotation = currentAnnotation(activePopupAnnotationId);
    const payload = cardForAnnotation(annotation);
    if (!payload) {
      control.hidden = true;
      return;
    }
    control.hidden = false;
    input.checked = notebookCards.some((card) => card.id === payload.card.id);
  }

  async function reloadNotebookData() {
    try {
      [notebookCards, notebookSources] = await Promise.all([getAll(CARD_STORE), getAll(SOURCE_STORE)]);
      notebookCards.sort((a, b) => String(b.addedAt || "").localeCompare(String(a.addedAt || "")));
      const status = root.document.getElementById("vocabularyStatus");
      if (status) status.hidden = true;
      updateFilterOptions();
      renderNotebookList();
      await refreshRegistrationControls();
    } catch {
      showStorageError();
    }
  }

  function updateFilterOptions() {
    const language = root.document.getElementById("vocabularyLanguageFilter");
    const type = root.document.getElementById("vocabularyTypeFilter");
    if (!language || !type) return;
    const languageValue = language.value;
    const typeValue = type.value;
    const languages = [...new Set(notebookCards.map((card) => card.sourceLanguage).filter(Boolean))].sort();
    const types = [...new Set(notebookCards.map((card) => card.type).filter(Boolean))].sort();
    language.replaceChildren(option("", vt("allLanguages")), ...languages.map((value) => option(value, languageLabel(value))));
    type.replaceChildren(option("", vt("allTypes")), ...types.map((value) => option(value, annotationTypeLabel(value))));
    if (languages.includes(languageValue)) language.value = languageValue;
    if (types.includes(typeValue)) type.value = typeValue;
  }

  function option(value, text) {
    const item = root.document.createElement("option");
    item.value = value;
    item.textContent = text;
    return item;
  }

  function languageLabel(code) {
    try {
      if (typeof languageCatalog !== "undefined") {
        const match = languageCatalog.find((item) => item.code === code);
        if (match) return match.native === match.name ? match.name : `${match.native} / ${match.name}`;
      }
    } catch {
      // Fall through to language code.
    }
    return code || "";
  }

  function annotationTypeLabel(type) {
    try {
      if (typeof t === "function" && typeof typeTextKeys === "object" && typeTextKeys[type]) return t(typeTextKeys[type]);
    } catch {
      // Fall through to the stable internal type name.
    }
    return type || "word";
  }

  function filteredCards() {
    const query = String(root.document.getElementById("vocabularySearch")?.value || "").trim().toLowerCase();
    const language = root.document.getElementById("vocabularyLanguageFilter")?.value || "";
    const type = root.document.getElementById("vocabularyTypeFilter")?.value || "";
    return notebookCards.filter((card) => {
      if (language && card.sourceLanguage !== language) return false;
      if (type && card.type !== type) return false;
      if (!query) return true;
      const haystack = [card.text, card.meaningJa, card.noteJa, card.example, card.pattern]
        .join("\n")
        .toLowerCase();
      return haystack.includes(query);
    });
  }

  function renderNotebookList() {
    const list = root.document.getElementById("vocabularyList");
    const count = root.document.getElementById("vocabularyCount");
    if (!list || !count) return;
    count.textContent = vt("count", { count: notebookCards.length });
    list.replaceChildren();
    const cards = filteredCards();
    if (!notebookCards.length) {
      list.appendChild(emptyMessage(vt("empty")));
      setExportDisabled(true);
      return;
    }
    setExportDisabled(false);
    if (!cards.length) {
      list.appendChild(emptyMessage(vt("noMatches")));
      return;
    }
    const bySource = new Map(notebookSources.map((source) => [source.id, source]));
    for (const card of cards) list.appendChild(renderNotebookCard(card, bySource.get(card.sourceId)));
  }

  function emptyMessage(text) {
    const node = root.document.createElement("div");
    node.className = "vocabulary-empty";
    node.textContent = text;
    return node;
  }

  function setExportDisabled(disabled) {
    ["vocabularyExportJson", "vocabularyExportCsv", "vocabularyExportAnki"].forEach((id) => {
      const button = root.document.getElementById(id);
      if (button) button.disabled = disabled;
    });
  }

  function renderNotebookCard(card, source) {
    const article = root.document.createElement("article");
    article.className = "vocabulary-card";

    const head = root.document.createElement("div");
    head.className = "vocabulary-card-head";
    const titleWrap = root.document.createElement("div");
    titleWrap.className = "vocabulary-card-title";
    const title = root.document.createElement("h3");
    title.textContent = card.text;
    const badge = root.document.createElement("span");
    badge.className = `badge ${card.type}`;
    badge.textContent = annotationTypeLabel(card.type);
    titleWrap.append(title, badge);
    const remove = root.document.createElement("button");
    remove.className = "ghost-btn";
    remove.type = "button";
    remove.textContent = vt("remove");
    remove.addEventListener("click", async () => {
      try {
        await deleteCard(card.id);
        await reloadNotebookData();
      } catch {
        showStorageError();
      }
    });
    head.append(titleWrap, remove);
    article.appendChild(head);

    appendParagraph(article, card.meaningJa, "meaning");
    appendLabeledParagraph(article, vt("pattern"), card.pattern);
    appendParagraph(article, card.noteJa);
    appendLabeledParagraph(article, vt("example"), card.example);
    const nuance = (Array.isArray(card.nuances) ? card.nuances : [])
      .map((item) => item?.suggestedMeaning || item?.pragmaticEffect || "")
      .filter(Boolean)
      .join(" / ");
    appendLabeledParagraph(article, vt("nuance"), nuance);

    if (card.addedAt) {
      const meta = root.document.createElement("p");
      meta.className = "meta";
      const date = new Date(card.addedAt);
      meta.textContent = `${vt("added")}: ${Number.isNaN(date.getTime()) ? card.addedAt : date.toLocaleString(uiLanguage() === "ja" ? "ja-JP" : "en")}`;
      article.appendChild(meta);
    }

    if (source?.text) {
      const details = root.document.createElement("details");
      const summary = root.document.createElement("summary");
      summary.textContent = source.label ? `${vt("source")}: ${source.label}` : vt("source");
      details.appendChild(summary);
      const context = core.contextWindow(source.text, card);
      const contextBox = root.document.createElement("div");
      contextBox.className = "vocabulary-context";
      contextBox.appendChild(root.document.createTextNode(context.before));
      if (context.target) {
        const mark = root.document.createElement("mark");
        mark.textContent = context.target;
        contextBox.appendChild(mark);
      }
      contextBox.appendChild(root.document.createTextNode(context.after));
      details.appendChild(contextBox);
      if (source.youtubeUrl) {
        const link = root.document.createElement("a");
        link.className = "vocabulary-source-link";
        link.href = source.youtubeUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = vt("sourceUrl");
        details.appendChild(link);
      }
      article.appendChild(details);
    }
    return article;
  }

  function appendParagraph(parent, value, className = "") {
    if (!value) return;
    const p = root.document.createElement("p");
    p.className = className;
    p.textContent = value;
    parent.appendChild(p);
  }

  function appendLabeledParagraph(parent, label, value) {
    if (!value) return;
    const p = root.document.createElement("p");
    const strong = root.document.createElement("strong");
    strong.textContent = `${label}: `;
    p.append(strong, root.document.createTextNode(value));
    parent.appendChild(p);
  }

  function downloadText(filename, text, mime) {
    const blob = new Blob(["\ufeff", text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = root.document.createElement("a");
    link.href = url;
    link.download = filename;
    root.document.body.appendChild(link);
    link.click();
    link.remove();
    root.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function exportStamp() {
    return new Date().toISOString().slice(0, 10);
  }

  function exportJson() {
    const bundle = core.buildExportBundle(notebookCards, notebookSources);
    downloadText(`annotator-connotator-vocabulary-${exportStamp()}.json`, JSON.stringify(bundle, null, 2), "application/json");
  }

  function exportCsv() {
    downloadText(`annotator-connotator-vocabulary-${exportStamp()}.csv`, core.buildCsv(notebookCards, notebookSources), "text/csv");
  }

  function exportAnki() {
    downloadText(`annotator-connotator-anki-${exportStamp()}.csv`, core.buildAnkiCsv(notebookCards, notebookSources), "text/csv");
  }

  function installUiLanguageListener() {
    root.document.getElementById("uiLangSelect")?.addEventListener("change", () => {
      root.setTimeout(updateNotebookUiText, 0);
    });
  }

  function installOverlayObserver() {
    const overlay = root.document.getElementById("overlay");
    if (!overlay) return;
    const observer = new MutationObserver(() => {
      if (!overlay.classList.contains("show")) {
        activePopupAnnotationId = null;
        const control = root.document.getElementById("popupVocabularyControl");
        if (control) control.hidden = true;
      }
    });
    observer.observe(overlay, { attributes: true, attributeFilter: ["class"] });
  }

  function install() {
    extendBaseUiText();
    installStyles();
    installTabAndPanel();
    installPopupControl();
    patchPopupFunctions();
    installWordListObserver();
    installUiLanguageListener();
    installOverlayObserver();
    void reloadNotebookData();
  }

  extendBaseUiText();
  if (root.document.readyState === "loading") {
    root.document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    root.setTimeout(install, 0);
  }
}(typeof globalThis !== "undefined" ? globalThis : this));

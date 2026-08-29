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
      vocabularyTab: "単語帳",
      vocabularyRegister: "単語帳に登録",
      vocabularyTitle: "単語帳",
      vocabularyCount: "{count}件登録",
      vocabularySearch: "語句・意味・例文を検索",
      vocabularyAllLanguages: "すべての言語",
      vocabularyAllTypes: "すべての種類",
      vocabularyExportJson: "JSON",
      vocabularyExportCsv: "CSV",
      vocabularyExportAnki: "Anki CSV",
      vocabularyEmpty: "まだ単語帳に登録された語句はありません。語句カードやポップアップのチェックボックスから登録できます。",
      vocabularyNoMatches: "条件に一致する語句がありません。",
      vocabularySource: "出典を見る",
      vocabularySourceUrl: "元のYouTubeを開く",
      vocabularyRemove: "登録解除",
      vocabularyAdded: "登録",
      vocabularyExample: "例",
      vocabularyPattern: "型",
      vocabularyNuance: "ニュアンス",
      vocabularyExplanationLanguage: "解説言語",
      vocabularyStorageError: "単語帳の保存領域を開けませんでした。ブラウザのサイトデータ設定を確認してください。",
    },
    en: {
      vocabularyTab: "Vocabulary",
      vocabularyRegister: "Add to vocabulary",
      vocabularyTitle: "Vocabulary notebook",
      vocabularyCount: "{count} saved",
      vocabularySearch: "Search words, meanings, and examples",
      vocabularyAllLanguages: "All languages",
      vocabularyAllTypes: "All types",
      vocabularyExportJson: "JSON",
      vocabularyExportCsv: "CSV",
      vocabularyExportAnki: "Anki CSV",
      vocabularyEmpty: "No saved items yet. Add them from a word card or annotation popup.",
      vocabularyNoMatches: "No saved items match these filters.",
      vocabularySource: "Show source context",
      vocabularySourceUrl: "Open source YouTube video",
      vocabularyRemove: "Remove",
      vocabularyAdded: "Saved",
      vocabularyExample: "Example",
      vocabularyPattern: "Pattern",
      vocabularyNuance: "Nuance",
      vocabularyExplanationLanguage: "Explanation language",
      vocabularyStorageError: "The vocabulary storage could not be opened. Check this site's browser storage settings.",
    },
  };

  let dbPromise = null;
  let activePopupAnnotationId = null;
  let decorateTimer = null;
  let notebookCards = [];
  let notebookSources = [];

  function extendBaseUiText() {
    root.UI_TEXT = root.UI_TEXT || {};
    root.UI_TEXT.ja = { ...(root.UI_TEXT.ja || {}), ...UI.ja };
    root.UI_TEXT.en = { ...(root.UI_TEXT.en || {}), ...UI.en };
  }

  function invalidateStaleUiTranslationCaches() {
    try {
      for (let index = 0; index < root.localStorage.length; index += 1) {
        const key = root.localStorage.key(index);
        if (!key?.startsWith("annotation.uiText.")) continue;
        const value = JSON.parse(root.localStorage.getItem(key) || "{}");
        if (value && !Object.prototype.hasOwnProperty.call(value, "vocabularyTab")) {
          root.localStorage.removeItem(key);
          index -= 1;
        }
      }
    } catch {
      // UI translation caching is optional; never block the notebook.
    }
  }

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

  function uiLanguageCode() {
    return appState()?.uiLanguage || root.document.getElementById("uiLangSelect")?.value || "ja";
  }

  function fallbackUiLanguage() {
    return String(uiLanguageCode()).toLowerCase().startsWith("ja") ? "ja" : "en";
  }

  function vt(key, values = {}) {
    try {
      if (typeof t === "function") {
        const translated = t(key, values);
        if (translated && translated !== key) return translated;
      }
    } catch {
      // Fall back to bundled Japanese/English strings.
    }
    let text = UI[fallbackUiLanguage()]?.[key] || UI.en[key] || key;
    for (const [name, value] of Object.entries(values)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
    return text;
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

  async function putSourceAndCard(source, card) {
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
      // IndexedDB still works if persistent-storage permission is unavailable or denied.
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
    const result = current?.result || {};
    const elements = appElements();
    const related = current?.connotationsByAnnotationId?.get?.(annotation.id) || [];
    const card = {
      sourceId: source.id,
      sourceLanguage: source.sourceLanguage,
      explanationLanguage: result.explanationLanguage || elements?.explanationLangSelect?.value || "ja",
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
    const payload = cardForAnnotation(currentAnnotation(annotationId));
    if (!payload) return;
    try {
      if (checked) {
        await requestPersistentStorage();
        const existing = notebookCards.find((card) => card.id === payload.card.id);
        payload.card.addedAt = existing?.addedAt || new Date().toISOString();
        await putSourceAndCard(payload.source, payload.card);
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
    if (!box) return;
    box.textContent = vt("vocabularyStorageError");
    box.hidden = false;
  }

  function installStyles() {
    if (root.document.getElementById("vocabularyNotebookStyles")) return;
    const style = root.document.createElement("style");
    style.id = "vocabularyNotebookStyles";
    style.textContent = `
      .vocab-register-control{display:inline-flex;align-items:center;gap:7px;margin:8px 0 2px;padding:6px 9px;border:1px solid var(--line);border-radius:6px;background:var(--surface-2);color:var(--text);font-size:12px;cursor:pointer}
      .vocab-register-control input{margin:0}.popup .vocab-register-control{margin-top:10px}
      .vocabulary-shell{display:flex;flex-direction:column;gap:12px}.vocabulary-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.vocabulary-head h2{margin:0;font-size:18px}.vocabulary-count{color:var(--muted);font-size:12px}
      .vocabulary-toolbar{display:grid;grid-template-columns:minmax(180px,1.5fr) minmax(130px,.7fr) minmax(130px,.7fr);gap:8px}.vocabulary-toolbar input,.vocabulary-toolbar select{width:100%;border:1px solid var(--line);background:var(--surface);color:var(--text);border-radius:6px;padding:8px 9px}
      .vocabulary-export{display:flex;flex-wrap:wrap;gap:8px}.vocabulary-list{display:grid;gap:10px}.vocabulary-card{border:1px solid var(--line);border-radius:7px;background:var(--surface);padding:12px}.vocabulary-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.vocabulary-card-title{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.vocabulary-card h3{margin:0;font-size:17px}.vocabulary-card p{margin:7px 0 0;line-height:1.55}.vocabulary-card .meaning{font-weight:600}.vocabulary-card .meta{color:var(--muted);font-size:11px}
      .vocabulary-card details{margin-top:10px;border-top:1px solid var(--line);padding-top:9px}.vocabulary-card summary{cursor:pointer;color:var(--accent);font-size:12px}.vocabulary-context{margin-top:8px;padding:9px;border-radius:6px;background:var(--surface-2);white-space:pre-wrap;line-height:1.55}.vocabulary-context mark{background:var(--vocab-bg);color:var(--vocab-fg);padding:1px 2px}.vocabulary-source-link{display:inline-block;margin-top:8px;color:var(--accent);font-size:12px}.vocabulary-empty{border:1px dashed var(--line-strong);border-radius:7px;padding:20px;color:var(--muted);text-align:center}.vocabulary-status{color:var(--accent-2);font-size:12px}
      @media(max-width:760px){.vocabulary-toolbar{grid-template-columns:1fr}.vocabulary-card-head{align-items:stretch;flex-direction:column}}
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
    wordsTab.insertAdjacentElement("afterend", tab);

    const panel = root.document.createElement("section");
    panel.className = "panel";
    panel.id = "panel-vocabulary";
    panel.innerHTML = `
      <div class="vocabulary-shell">
        <div class="vocabulary-head"><h2 id="vocabularyTitle"></h2><span class="vocabulary-count" id="vocabularyCount"></span></div>
        <div class="vocabulary-toolbar"><input id="vocabularySearch" type="search"><select id="vocabularyLanguageFilter"></select><select id="vocabularyTypeFilter"></select></div>
        <div class="vocabulary-export"><button class="ghost-btn" id="vocabularyExportJson" type="button"></button><button class="ghost-btn" id="vocabularyExportCsv" type="button"></button><button class="ghost-btn" id="vocabularyExportAnki" type="button"></button></div>
        <p class="vocabulary-status" id="vocabularyStatus" hidden></p><div class="vocabulary-list" id="vocabularyList"></div>
      </div>`;
    wordsPanel.insertAdjacentElement("afterend", panel);

    tab.addEventListener("click", () => {
      try {
        if (typeof showTab === "function") showTab("vocabulary");
      } catch {
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
  }

  function installPopupControl() {
    const nuances = root.document.getElementById("popupNuances");
    if (!nuances || root.document.getElementById("popupVocabularyControl")) return;
    const label = root.document.createElement("label");
    label.className = "vocab-register-control";
    label.id = "popupVocabularyControl";
    label.hidden = true;
    const input = root.document.createElement("input");
    input.type = "checkbox";
    input.id = "popupVocabularyCheckbox";
    const text = root.document.createElement("span");
    text.className = "vocab-register-label";
    label.append(input, text);
    nuances.insertAdjacentElement("beforebegin", label);
    label.addEventListener("click", (event) => event.stopPropagation());
    input.addEventListener("change", () => {
      if (activePopupAnnotationId) void toggleAnnotation(activePopupAnnotationId, input.checked);
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
    const wordCards = [...list.querySelectorAll(":scope > .word-card:not(.nuance-card)")];
    current.result.annotations.forEach((annotation, index) => {
      const card = wordCards[index];
      if (!card || card.querySelector(".vocab-register-control")) return;
      const label = root.document.createElement("label");
      label.className = "vocab-register-control";
      label.dataset.annotationId = annotation.id;
      const input = root.document.createElement("input");
      input.type = "checkbox";
      const text = root.document.createElement("span");
      text.className = "vocab-register-label";
      label.append(input, text);
      const head = card.querySelector(".word-card-head");
      if (head) head.insertAdjacentElement("afterend", label);
      else card.prepend(label);
      label.addEventListener("click", (event) => event.stopPropagation());
      input.addEventListener("change", () => void toggleAnnotation(annotation.id, input.checked));
    });
    updateRegistrationLabels();
    void refreshRegistrationControls();
  }

  function installWordListObserver() {
    const list = root.document.getElementById("wordList");
    if (!list) return;
    new MutationObserver(() => {
      root.clearTimeout(decorateTimer);
      decorateTimer = root.setTimeout(decorateWordList, 0);
    }).observe(list, { childList: true, subtree: true });
    decorateWordList();
  }

  function updateRegistrationLabels() {
    root.document.querySelectorAll(".vocab-register-label").forEach((label) => {
      label.textContent = vt("vocabularyRegister");
    });
  }

  async function refreshRegistrationControls() {
    const current = appState();
    if (!current?.result || !currentSourceSnapshot()) return;
    const savedIds = new Set(notebookCards.map((card) => card.id));
    root.document.querySelectorAll(".vocab-register-control[data-annotation-id]").forEach((label) => {
      const payload = cardForAnnotation(currentAnnotation(label.dataset.annotationId));
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
    const payload = cardForAnnotation(currentAnnotation(activePopupAnnotationId));
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
      // Fall through to stable internal name.
    }
    return type || "word";
  }

  function updateFilterOptions() {
    const language = root.document.getElementById("vocabularyLanguageFilter");
    const type = root.document.getElementById("vocabularyTypeFilter");
    if (!language || !type) return;
    const languageValue = language.value;
    const typeValue = type.value;
    const languages = [...new Set(notebookCards.map((card) => card.sourceLanguage).filter(Boolean))].sort();
    const types = [...new Set(notebookCards.map((card) => card.type).filter(Boolean))].sort();
    language.replaceChildren(option("", vt("vocabularyAllLanguages")), ...languages.map((value) => option(value, languageLabel(value))));
    type.replaceChildren(option("", vt("vocabularyAllTypes")), ...types.map((value) => option(value, annotationTypeLabel(value))));
    if (languages.includes(languageValue)) language.value = languageValue;
    if (types.includes(typeValue)) type.value = typeValue;
  }

  function filteredCards() {
    const query = String(root.document.getElementById("vocabularySearch")?.value || "").trim().toLowerCase();
    const language = root.document.getElementById("vocabularyLanguageFilter")?.value || "";
    const type = root.document.getElementById("vocabularyTypeFilter")?.value || "";
    return notebookCards.filter((card) => {
      if (language && card.sourceLanguage !== language) return false;
      if (type && card.type !== type) return false;
      if (!query) return true;
      return [card.text, card.meaningJa, card.noteJa, card.example, card.pattern]
        .join("\n").toLowerCase().includes(query);
    });
  }

  function renderNotebookList() {
    const list = root.document.getElementById("vocabularyList");
    const count = root.document.getElementById("vocabularyCount");
    if (!list || !count) return;
    count.textContent = vt("vocabularyCount", { count: notebookCards.length });
    list.replaceChildren();
    const cards = filteredCards();
    setExportDisabled(!notebookCards.length);
    if (!notebookCards.length) {
      list.appendChild(emptyMessage(vt("vocabularyEmpty")));
      return;
    }
    if (!cards.length) {
      list.appendChild(emptyMessage(vt("vocabularyNoMatches")));
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
    remove.textContent = vt("vocabularyRemove");
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
    appendLabeledParagraph(article, vt("vocabularyPattern"), card.pattern);
    appendParagraph(article, card.noteJa);
    appendLabeledParagraph(article, vt("vocabularyExample"), card.example);
    const nuance = (Array.isArray(card.nuances) ? card.nuances : [])
      .map((item) => item?.suggestedMeaning || item?.pragmaticEffect || "")
      .filter(Boolean).join(" / ");
    appendLabeledParagraph(article, vt("vocabularyNuance"), nuance);

    const explanationLanguage = card.explanationLanguage || source?.explanationLanguage || "";
    const metadata = [];
    if (explanationLanguage) metadata.push(`${vt("vocabularyExplanationLanguage")}: ${languageLabel(explanationLanguage)}`);
    if (card.addedAt) {
      const date = new Date(card.addedAt);
      metadata.push(`${vt("vocabularyAdded")}: ${Number.isNaN(date.getTime()) ? card.addedAt : date.toLocaleString(uiLanguageCode())}`);
    }
    if (metadata.length) appendParagraph(article, metadata.join(" · "), "meta");

    if (source?.text) {
      const details = root.document.createElement("details");
      const summary = root.document.createElement("summary");
      summary.textContent = source.label ? `${vt("vocabularySource")}: ${source.label}` : vt("vocabularySource");
      details.appendChild(summary);
      const context = core.contextWindow(source.text, card);
      const box = root.document.createElement("div");
      box.className = "vocabulary-context";
      box.appendChild(root.document.createTextNode(context.before));
      if (context.target) {
        const mark = root.document.createElement("mark");
        mark.textContent = context.target;
        box.appendChild(mark);
      }
      box.appendChild(root.document.createTextNode(context.after));
      details.appendChild(box);
      if (source.youtubeUrl) {
        const link = root.document.createElement("a");
        link.className = "vocabulary-source-link";
        link.href = source.youtubeUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = vt("vocabularySourceUrl");
        details.appendChild(link);
      }
      article.appendChild(details);
    }
    return article;
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
    downloadText(`annotator-connotator-vocabulary-${exportStamp()}.json`, JSON.stringify(core.buildExportBundle(notebookCards, notebookSources), null, 2), "application/json");
  }

  function exportCsv() {
    downloadText(`annotator-connotator-vocabulary-${exportStamp()}.csv`, core.buildCsv(notebookCards, notebookSources), "text/csv");
  }

  function exportAnki() {
    downloadText(`annotator-connotator-anki-${exportStamp()}.csv`, core.buildAnkiCsv(notebookCards, notebookSources), "text/csv");
  }

  function updateNotebookUiText() {
    const tab = root.document.querySelector('.tab[data-tab="vocabulary"]');
    if (tab) tab.textContent = vt("vocabularyTab");
    const title = root.document.getElementById("vocabularyTitle");
    if (title) title.textContent = vt("vocabularyTitle");
    const search = root.document.getElementById("vocabularySearch");
    if (search) search.placeholder = vt("vocabularySearch");
    const json = root.document.getElementById("vocabularyExportJson");
    const csv = root.document.getElementById("vocabularyExportCsv");
    const anki = root.document.getElementById("vocabularyExportAnki");
    if (json) json.textContent = vt("vocabularyExportJson");
    if (csv) csv.textContent = vt("vocabularyExportCsv");
    if (anki) anki.textContent = vt("vocabularyExportAnki");
    updateRegistrationLabels();
    updateFilterOptions();
    renderNotebookList();
  }

  function installUiLanguageObservers() {
    root.document.getElementById("uiLangSelect")?.addEventListener("change", () => root.setTimeout(updateNotebookUiText, 0));
    const appTitle = root.document.querySelector('[data-i18n="appTitle"]');
    if (appTitle) new MutationObserver(() => updateNotebookUiText()).observe(appTitle, { childList: true, subtree: true });
  }

  function installOverlayObserver() {
    const overlay = root.document.getElementById("overlay");
    if (!overlay) return;
    new MutationObserver(() => {
      if (overlay.classList.contains("show")) return;
      activePopupAnnotationId = null;
      const control = root.document.getElementById("popupVocabularyControl");
      if (control) control.hidden = true;
    }).observe(overlay, { attributes: true, attributeFilter: ["class"] });
  }

  function install() {
    installStyles();
    installTabAndPanel();
    installPopupControl();
    patchPopupFunctions();
    installWordListObserver();
    installUiLanguageObservers();
    installOverlayObserver();
    updateNotebookUiText();
    void reloadNotebookData();
  }

  extendBaseUiText();
  invalidateStaleUiTranslationCaches();
  if (root.document.readyState === "loading") {
    root.document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    root.setTimeout(install, 0);
  }
}(typeof globalThis !== "undefined" ? globalThis : this));

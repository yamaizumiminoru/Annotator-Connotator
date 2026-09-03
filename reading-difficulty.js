(function installReadingDifficulty(root) {
  if (!root?.document || root.__readingDifficultyInstalled) return;
  root.__readingDifficultyInstalled = true;

  const TYPE = "reading";
  const EVENT_KIND = "reading_difficulty";
  let rememberedSelection = null;
  let originalNormalizeType = null;
  let originalRenderWordList = null;
  let originalOpenPopup = null;

  function language() {
    return String(root.document.getElementById("uiLangSelect")?.value || "ja").toLowerCase();
  }

  function text(key, ja, en) {
    try {
      if (typeof t === "function") {
        const translated = t(key);
        if (translated && translated !== key) return translated;
      }
    } catch {}
    return language().startsWith("ja") ? ja : en;
  }

  function installText() {
    root.UI_TEXT = root.UI_TEXT || {};
    root.UI_TEXT.ja = {
      ...(root.UI_TEXT.ja || {}),
      readingDifficultyType: "読解で詰まった",
      readingDifficultyAction: "📖 読みで詰まった",
      readingDifficultyHint: "本文で詰まった箇所を選択して記録",
      readingDifficultySaved: "読解で詰まった箇所として記録しました。",
      readingDifficultyDuplicate: "この箇所はすでに記録されています。",
      readingDifficultyRemove: "記録を解除",
      readingDifficultyDescription: "読解中に理解・処理が止まった箇所として記録されています。",
    };
    root.UI_TEXT.en = {
      ...(root.UI_TEXT.en || {}),
      readingDifficultyType: "Reading difficulty",
      readingDifficultyAction: "📖 Reading difficulty",
      readingDifficultyHint: "Select a passage that interrupted your reading and record it",
      readingDifficultySaved: "Recorded as a reading difficulty.",
      readingDifficultyDuplicate: "This passage is already recorded.",
      readingDifficultyRemove: "Remove record",
      readingDifficultyDescription: "Recorded because comprehension or processing broke down while reading.",
    };
    try {
      if (typeof typeTextKeys === "object") typeTextKeys[TYPE] = "readingDifficultyType";
      if (typeof baseUiText === "object") {
        baseUiText.ja = { ...(baseUiText.ja || {}), readingDifficultyType: "読解で詰まった" };
        baseUiText.en = { ...(baseUiText.en || {}), readingDifficultyType: "Reading difficulty" };
      }
    } catch {}
  }

  function installStyles() {
    if (root.document.getElementById("readingDifficultyStyles")) return;
    const style = root.document.createElement("style");
    style.id = "readingDifficultyStyles";
    style.textContent = `
      .reading-difficulty-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:10px 0 12px}
      .reading-difficulty-action{border:1px solid rgba(42,112,150,.38);border-radius:999px;background:#eef7fc;color:#245b78;padding:7px 11px;font:inherit;font-size:12px;font-weight:700;cursor:pointer}
      .reading-difficulty-action:disabled{opacity:.45;cursor:default}
      .reading-difficulty-hint{font-size:11px;color:var(--muted)}
      .hl-reading{background:#d9eef9!important;color:#245b78}
      .badge.reading{background:#d9eef9;color:#245b78}
      .reading-difficulty-remove{margin-top:12px;border:1px solid rgba(42,112,150,.35);border-radius:9px;background:transparent;color:#245b78;padding:8px 11px;font:inherit;font-weight:700;cursor:pointer}
      html.reading-difficulty-popup-open .popup .vocab-register-control{display:none!important}
    `;
    root.document.head.appendChild(style);
  }

  function patchTypeNormalization() {
    try {
      if (typeof normalizeType !== "function" || normalizeType.__readingDifficultyAware) return;
      originalNormalizeType = normalizeType;
      normalizeType = function readingAwareNormalizeType(value) {
        return value === TYPE ? TYPE : originalNormalizeType(value);
      };
      normalizeType.__readingDifficultyAware = true;
    } catch {}
  }

  function patchWordList() {
    try {
      if (typeof renderWordList !== "function" || renderWordList.__readingDifficultyAware) return;
      originalRenderWordList = renderWordList;
      renderWordList = function readingAwareRenderWordList(...args) {
        const annotations = state?.result?.annotations;
        if (!Array.isArray(annotations)) return originalRenderWordList.apply(this, args);
        const visible = annotations.filter((item) => item?.type !== TYPE);
        if (visible.length === annotations.length) return originalRenderWordList.apply(this, args);
        state.result.annotations = visible;
        try {
          return originalRenderWordList.apply(this, args);
        } finally {
          state.result.annotations = annotations;
        }
      };
      renderWordList.__readingDifficultyAware = true;
    } catch {}
  }

  function sourceText() {
    try { return String(state?.result?.sourceText || ""); } catch { return ""; }
  }

  function resolveSelection() {
    const container = root.document.getElementById("annotatedText");
    const selection = root.getSelection?.();
    if (!container || !selection || selection.rangeCount < 1 || selection.isCollapsed) return null;
    const range = selection.getRangeAt(0);
    if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) return null;
    const selectedText = range.toString();
    if (!selectedText.trim()) return null;

    let approximateStart = 0;
    try {
      const prefix = root.document.createRange();
      prefix.selectNodeContents(container);
      prefix.setEnd(range.startContainer, range.startOffset);
      approximateStart = prefix.toString().length;
    } catch {}

    const source = sourceText();
    if (!source) return null;
    let start = approximateStart;
    if (source.slice(start, start + selectedText.length) !== selectedText) {
      let best = -1;
      let bestDistance = Infinity;
      let cursor = 0;
      while (cursor <= source.length) {
        const found = source.indexOf(selectedText, cursor);
        if (found < 0) break;
        const distance = Math.abs(found - approximateStart);
        if (distance < bestDistance) {
          best = found;
          bestDistance = distance;
        }
        cursor = found + Math.max(1, selectedText.length);
      }
      start = best;
    }
    if (start < 0) return null;
    return { text: selectedText, start, end: start + selectedText.length };
  }

  function updateButton() {
    const button = root.document.getElementById("readingDifficultyBtn");
    if (!button) return;
    button.disabled = !rememberedSelection || !state?.result;
  }

  function rememberSelection() {
    const next = resolveSelection();
    if (next) rememberedSelection = next;
    updateButton();
  }

  function ensureLearningLog() {
    if (!Array.isArray(state.result.learningLog)) state.result.learningLog = [];
    return state.result.learningLog;
  }

  function duplicate(selection) {
    return state.result.annotations.some((item) => (
      item?.type === TYPE && item.start === selection.start && item.end === selection.end
    ));
  }

  function addMark() {
    if (!state?.result || !rememberedSelection) return;
    const selection = rememberedSelection;
    if (duplicate(selection)) {
      if (typeof setStatus === "function") setStatus(text("readingDifficultyDuplicate", "この箇所はすでに記録されています。", "This passage is already recorded."), "");
      return;
    }

    const id = `reading-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const recordedAt = new Date().toISOString();
    const eventId = `event-${id}`;
    state.result.annotations.push({
      id,
      text: selection.text,
      type: TYPE,
      meaningJa: "",
      noteJa: "",
      example: "",
      pattern: "",
      coreRanges: [],
      start: selection.start,
      end: selection.end,
      reasons: [],
      level: state.level,
      userAdded: true,
      learningEventId: eventId,
      recordedAt,
    });
    ensureLearningLog().push({
      id: eventId,
      kind: EVENT_KIND,
      modality: "reading",
      text: selection.text,
      start: selection.start,
      end: selection.end,
      recordedAt,
    });

    rememberedSelection = null;
    if (typeof renderResult === "function") renderResult();
    if (typeof persistSettings === "function") persistSettings();
    if (typeof setStatus === "function") setStatus(text("readingDifficultySaved", "読解で詰まった箇所として記録しました。", "Recorded as a reading difficulty."), "ok");
    updateButton();
  }

  function removeMark(item) {
    if (!state?.result || !item) return;
    state.result.annotations = state.result.annotations.filter((annotation) => annotation.id !== item.id);
    if (Array.isArray(state.result.learningLog)) {
      state.result.learningLog = state.result.learningLog.filter((event) => event.id !== item.learningEventId);
    }
    root.document.documentElement.classList.remove("reading-difficulty-popup-open");
    if (typeof closePopup === "function") closePopup();
    if (typeof renderResult === "function") renderResult();
    if (typeof persistSettings === "function") persistSettings();
  }

  function patchPopup() {
    try {
      if (typeof openPopup !== "function" || openPopup.__readingDifficultyAware) return;
      originalOpenPopup = openPopup;
      openPopup = function readingAwareOpenPopup(id) {
        const item = state?.annotationsById?.get(id);
        if (!item || item.type !== TYPE) {
          root.document.documentElement.classList.remove("reading-difficulty-popup-open");
          return originalOpenPopup(id);
        }
        root.document.documentElement.classList.add("reading-difficulty-popup-open");
        els.popupWord.textContent = item.text;
        els.popupType.textContent = text("readingDifficultyType", "読解で詰まった", "Reading difficulty");
        els.popupType.className = "popup-type badge reading";
        els.popupType.hidden = false;
        els.popupDef.textContent = text(
          "readingDifficultyDescription",
          "読解中に理解・処理が止まった箇所として記録されています。",
          "Recorded because comprehension or processing broke down while reading.",
        );
        els.popupDef.hidden = false;
        els.popupPattern.textContent = "";
        els.popupPattern.hidden = true;
        els.popupNote.textContent = "";
        els.popupNote.hidden = true;
        els.popupExample.textContent = "";
        els.popupExample.hidden = true;
        els.popupNuances.innerHTML = "";
        els.popupNuances.hidden = false;
        const remove = root.document.createElement("button");
        remove.type = "button";
        remove.className = "reading-difficulty-remove";
        remove.textContent = text("readingDifficultyRemove", "記録を解除", "Remove record");
        remove.addEventListener("click", () => removeMark(item));
        els.popupNuances.appendChild(remove);
        els.overlay.classList.add("show");
      };
      openPopup.__readingDifficultyAware = true;
    } catch {}
  }

  function installControls() {
    if (root.document.getElementById("readingDifficultyBtn")) return;
    const annotated = root.document.getElementById("annotatedText");
    if (!annotated) return;
    const row = root.document.createElement("div");
    row.className = "reading-difficulty-actions";
    const button = root.document.createElement("button");
    button.id = "readingDifficultyBtn";
    button.type = "button";
    button.className = "reading-difficulty-action";
    button.disabled = true;
    button.textContent = text("readingDifficultyAction", "📖 読みで詰まった", "📖 Reading difficulty");
    const hint = root.document.createElement("span");
    hint.className = "reading-difficulty-hint";
    hint.textContent = text("readingDifficultyHint", "本文で詰まった箇所を選択して記録", "Select a passage that interrupted your reading and record it");
    button.addEventListener("click", addMark);
    row.append(button, hint);
    annotated.insertAdjacentElement("beforebegin", row);

    root.document.addEventListener("selectionchange", () => {
      if (root.document.getElementById("annotatedText")?.contains(root.getSelection()?.anchorNode)) rememberSelection();
    });
    annotated.addEventListener("mouseup", () => root.setTimeout(rememberSelection, 0));
    annotated.addEventListener("keyup", () => root.setTimeout(rememberSelection, 0));
    root.document.getElementById("uiLangSelect")?.addEventListener("change", () => {
      root.setTimeout(() => {
        button.textContent = text("readingDifficultyAction", "📖 読みで詰まった", "📖 Reading difficulty");
        hint.textContent = text("readingDifficultyHint", "本文で詰まった箇所を選択して記録", "Select a passage that interrupted your reading and record it");
      }, 0);
    });
  }

  function installWhenReady(attempt = 0) {
    let ready = false;
    try { ready = typeof renderResult === "function" && typeof openPopup === "function"; } catch {}
    if (!ready) {
      if (attempt < 80) root.setTimeout(() => installWhenReady(attempt + 1), 50);
      return;
    }
    installText();
    installStyles();
    patchTypeNormalization();
    patchWordList();
    patchPopup();
    installControls();
  }

  installWhenReady();
}(typeof globalThis !== "undefined" ? globalThis : this));

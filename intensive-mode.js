(function installTeachingTools(root) {
  if (!root?.document) return;
  const core = root.INTENSIVE_MODE_CORE;
  if (!core) return;

  root.UI_TEXT = root.UI_TEXT || {};
  root.UI_TEXT.ja = {
    ...(root.UI_TEXT.ja || {}),
    densityCoverage: "網羅",
    coverageTooLong: `「網羅」は${core.INTENSIVE_MAX_SOURCE_LENGTH.toLocaleString("ja-JP")}文字以内の短い文章向けです。文章を短くするか、「多め」以下を選んでください。`,
    showExplanations: "解説を表示",
    additionalExplanationType: "追加解説",
    addAsAnnotation: "＋ アノテーションに追加",
    annotationAdded: "追加解説として本文に加えました。",
    questionLabel: "質問",
    answerLabel: "回答",
    multipleAnnotations: "この箇所の解説",
  };
  root.UI_TEXT.en = {
    ...(root.UI_TEXT.en || {}),
    densityCoverage: "Exhaustive",
    coverageTooLong: `Exhaustive density is for short passages up to ${core.INTENSIVE_MAX_SOURCE_LENGTH.toLocaleString("en-US")} characters. Shorten the passage or choose High or below.`,
    showExplanations: "Show explanations",
    additionalExplanationType: "Added explanation",
    addAsAnnotation: "+ Add as annotation",
    annotationAdded: "Added to the text as an explanation annotation.",
    questionLabel: "Question",
    answerLabel: "Answer",
    multipleAnnotations: "Explanations at this position",
  };

  let explanationsVisible = root.localStorage.getItem("annotation.showExplanations") !== "false";
  let lastQuestion = null;
  let originalOpenPopup = null;
  let originalNormalizeType = null;
  let fetchInstalled = false;

  function language() {
    return root.document.getElementById("uiLangSelect")?.value || "ja";
  }

  function text(key, ja, en) {
    const lang = String(language()).toLowerCase();
    if (lang.startsWith("ja")) return root.UI_TEXT.ja?.[key] || ja;
    if (lang.startsWith("en")) return root.UI_TEXT.en?.[key] || en;
    try {
      if (typeof t === "function") {
        const translated = t(key);
        if (translated && translated !== key) return translated;
      }
    } catch {}
    return en;
  }

  function isCoverage() {
    return root.document.getElementById("densityRange")?.value === "4";
  }

  function setMode(nextMode, options = {}) {
    const range = root.document.getElementById("densityRange");
    if (!range) return;
    if (core.isIntensive(nextMode)) {
      range.value = "4";
    } else if (range.value === "4") {
      range.value = "2";
    }
    if (options.persist !== false) {
      root.localStorage.setItem("annotation.extractionMode", core.isIntensive(nextMode) ? "intensive" : "standard");
      root.localStorage.setItem("annotation.density", range.value);
    }
    refreshDensityLabel();
  }

  function setExplanationsVisible(visible, options = {}) {
    explanationsVisible = visible !== false;
    if (options.persist !== false) root.localStorage.setItem("annotation.showExplanations", String(explanationsVisible));
    root.document.documentElement.classList.toggle("hide-annotation-explanations", !explanationsVisible);
    const checkbox = root.document.getElementById("showExplanations");
    if (checkbox) checkbox.checked = explanationsVisible;
  }

  root.INTENSIVE_MODE = {
    getMode: () => (isCoverage() ? core.INTENSIVE_MODE : core.STANDARD_MODE),
    getExplanationsVisible: () => explanationsVisible,
    setMode,
    setExplanationsVisible,
  };

  function installStyles() {
    if (root.document.getElementById("teachingToolsStyles")) return;
    const style = root.document.createElement("style");
    style.id = "teachingToolsStyles";
    style.textContent = `
      #extractionModeControl{display:none!important}
      .teaching-display-toggle{display:flex;align-items:center;gap:7px}
      .note:empty,.popup-note:empty,.popup-ex:empty{display:none!important}
      html.hide-annotation-explanations #panel-words .meaning,
      html.hide-annotation-explanations #panel-words .annotation-pattern,
      html.hide-annotation-explanations #panel-words .note,
      html.hide-annotation-explanations #panel-words .example,
      html.hide-annotation-explanations #panel-words .nuance-block,
      html.hide-annotation-explanations .popup .popup-def,
      html.hide-annotation-explanations .popup .popup-pattern,
      html.hide-annotation-explanations .popup .popup-note,
      html.hide-annotation-explanations .popup .popup-ex,
      html.hide-annotation-explanations .popup .popup-nuances,
      html.hide-annotation-explanations .annotation-stack-body{display:none!important}
      .hl{transition:filter .12s ease,box-shadow .12s ease;background-color .12s ease}
      .hl:not(.hl-stack){filter:saturate(.82) brightness(1.05)}
      .hl-stack-2{box-shadow:inset 0 0 0 999px rgba(0,0,0,.055)}
      .hl-stack-3{box-shadow:inset 0 0 0 999px rgba(0,0,0,.10)}
      .hl-stack-4{box-shadow:inset 0 0 0 999px rgba(0,0,0,.15)}
      .hl-additional{background:#e6e0f2;color:#5d4778}
      .badge.additional{background:#e6e0f2;color:#5d4778}
      .ac-add-annotation{margin:12px 0 0;padding:8px 12px;border:1px solid rgba(0,0,0,.2);border-radius:9px;background:transparent;color:inherit;font:inherit;font-weight:700;cursor:pointer}
      .ac-add-annotation:disabled{opacity:.55;cursor:default}
      .annotation-stack-backdrop{position:fixed;inset:0;z-index:10040;display:grid;place-items:center;padding:20px;background:rgba(0,0,0,.28)}
      .annotation-stack-backdrop[hidden]{display:none!important}
      .annotation-stack-dialog{width:min(760px,100%);max-height:82vh;overflow:auto;border:1px solid var(--line);border-radius:16px;background:#fffdf7;color:var(--text);box-shadow:0 24px 70px rgba(0,0,0,.28);padding:20px}
      .annotation-stack-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
      .annotation-stack-head h2{margin:0;font-size:18px}
      .annotation-stack-close{border:0;background:transparent;font-size:28px;cursor:pointer;color:inherit}
      .annotation-stack-card{padding:14px 0;border-top:1px solid var(--line)}
      .annotation-stack-card:first-of-type{border-top:0}
      .annotation-stack-title{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:8px}
      .annotation-stack-title strong{font-size:17px}
      .annotation-stack-body p{margin:7px 0;line-height:1.65}
      .annotation-stack-question{color:var(--muted)}
    `;
    root.document.head.appendChild(style);
  }

  function installControls() {
    root.document.getElementById("extractionModeControl")?.remove();
    const range = root.document.getElementById("densityRange");
    if (range) {
      range.max = "4";
      const saved = root.localStorage.getItem("annotation.density");
      const legacyMode = root.localStorage.getItem("annotation.extractionMode");
      if (saved === "4" || legacyMode === "intensive") range.value = "4";
      range.addEventListener("input", () => root.setTimeout(refreshDensityLabel, 0));
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
        span.dataset.teachingI18n = "showExplanations";
        checkbox.addEventListener("change", () => setExplanationsVisible(checkbox.checked));
        label.append(checkbox, span);
        toggleGrid.appendChild(label);
      }
    }
    setExplanationsVisible(explanationsVisible, { persist: false });
    relabel();
    refreshDensityLabel();
  }

  function refreshDensityLabel() {
    const range = root.document.getElementById("densityRange");
    const label = root.document.getElementById("densityLabel");
    if (!range || !label) return;
    if (range.value === "4") {
      label.textContent = text("densityCoverage", "網羅", "Exhaustive");
      root.localStorage.setItem("annotation.extractionMode", "intensive");
    } else {
      root.localStorage.setItem("annotation.extractionMode", "standard");
    }
  }

  function relabel() {
    const show = root.document.querySelector('[data-teaching-i18n="showExplanations"]');
    if (show) show.textContent = text("showExplanations", "解説を表示", "Show explanations");
    refreshDensityLabel();
  }

  function coverageTooLongMessage() {
    return text(
      "coverageTooLong",
      `「網羅」は${core.INTENSIVE_MAX_SOURCE_LENGTH.toLocaleString("ja-JP")}文字以内の短い文章向けです。文章を短くするか、「多め」以下を選んでください。`,
      `Exhaustive density is for short passages up to ${core.INTENSIVE_MAX_SOURCE_LENGTH.toLocaleString("en-US")} characters. Shorten the passage or choose High or below.`,
    );
  }

  function installFetchWrapper() {
    if (fetchInstalled) return;
    fetchInstalled = true;
    const previousFetch = root.fetch.bind(root);
    root.fetch = async function teachingAwareFetch(input, init) {
      let url;
      try {
        url = new URL(typeof input === "string" ? input : input.url, root.location.href);
      } catch {
        return previousFetch(input, init);
      }
      const method = String(init?.method || (typeof input !== "string" ? input.method : "GET") || "GET").toUpperCase();

      if (method === "POST" && url.pathname === "/api/annotate" && typeof init?.body === "string") {
        try {
          const payload = JSON.parse(init.body);
          const coverage = Number(payload.density) === 4 || isCoverage();
          payload.extractionMode = coverage ? core.INTENSIVE_MODE : core.STANDARD_MODE;
          if (coverage) {
            if (core.isTooLong(payload.text)) {
              return new Response(JSON.stringify({ error: "coverage_too_long", message: coverageTooLongMessage() }), {
                status: 400,
                headers: { "content-type": "application/json; charset=utf-8" },
              });
            }
            payload.density = 3;
          }
          return previousFetch(input, { ...init, body: JSON.stringify(payload) });
        } catch {
          return previousFetch(input, init);
        }
      }

      if (method === "POST" && url.pathname === "/api/question" && typeof init?.body === "string") {
        let requestPayload = null;
        try { requestPayload = JSON.parse(init.body); } catch {}
        const response = await previousFetch(input, init);
        if (requestPayload && response.ok) {
          try {
            const data = await response.clone().json();
            lastQuestion = {
              selectedText: String(requestPayload.selectedText || ""),
              start: Number.isInteger(requestPayload.selectedStart) ? requestPayload.selectedStart : null,
              end: Number.isInteger(requestPayload.selectedEnd) ? requestPayload.selectedEnd : null,
              question: String(requestPayload.question || "").trim(),
              answer: String(data.answer || "").trim(),
            };
            root.setTimeout(installQuestionAddButton, 0);
          } catch {}
        }
        return response;
      }

      return previousFetch(input, init);
    };
  }

  function patchAnnotationType() {
    try {
      if (typeof typeTextKeys === "object") typeTextKeys.additional = "additionalExplanationType";
      if (typeof baseUiText === "object") {
        baseUiText.ja = { ...(baseUiText.ja || {}), additionalExplanationType: "追加解説", densityCoverage: "網羅" };
        baseUiText.en = { ...(baseUiText.en || {}), additionalExplanationType: "Added explanation", densityCoverage: "Exhaustive" };
      }
      if (typeof normalizeType === "function" && !originalNormalizeType) {
        originalNormalizeType = normalizeType;
        normalizeType = function patchedNormalizeType(value) {
          return value === "additional" ? "additional" : originalNormalizeType(value);
        };
      }
    } catch {}
  }

  function validSpan(item, source) {
    if (Number.isInteger(item.start) && Number.isInteger(item.end)
      && item.start >= 0 && item.end > item.start && item.end <= source.length
      && source.slice(item.start, item.end).toLowerCase() === String(item.text || "").toLowerCase()) {
      return { start: item.start, end: item.end, item };
    }
    const found = source.toLowerCase().indexOf(String(item.text || "").toLowerCase());
    return found >= 0 ? { start: found, end: found + String(item.text || "").length, item } : null;
  }

  function installRenderPatch() {
    if (typeof renderAnnotatedText !== "function" || renderAnnotatedText.__overlapAware) return;
    renderAnnotatedText = function overlapAwareRenderAnnotatedText() {
      if (!state?.result) return;
      const source = state.result.sourceText;
      const spans = state.result.annotations.map((item) => validSpan(item, source)).filter(Boolean);
      const nuances = state.result.connotations.filter((item) => (
        Number.isInteger(item.start) && Number.isInteger(item.end)
        && item.start >= 0 && item.end > item.start && item.end <= source.length
      ));
      els.annotatedText.classList.remove("empty");
      els.annotatedText.innerHTML = "";
      const boundaries = new Set([0, source.length]);
      [...spans, ...nuances].forEach((span) => { boundaries.add(span.start); boundaries.add(span.end); });
      const points = [...boundaries].sort((a, b) => a - b);

      for (let i = 0; i < points.length - 1; i += 1) {
        const start = points[i];
        const end = points[i + 1];
        if (end <= start) continue;
        const covering = spans.filter((span) => span.start <= start && span.end >= end).map((span) => span.item);
        const coveringNuances = nuances.filter((span) => span.start <= start && span.end >= end);
        const segment = source.slice(start, end);
        if (!covering.length && !coveringNuances.length) {
          appendText(els.annotatedText, segment);
          continue;
        }
        const classes = [];
        if (covering.length) {
          const primary = covering.slice().sort((a, b) => ((a.end - a.start) - (b.end - b.start)))[0];
          classes.push("hl", `hl-${primary.type}`);
          if (covering.length > 1) classes.push("hl-stack", `hl-stack-${Math.min(4, covering.length)}`);
        }
        if (coveringNuances.length) classes.push("nuance-inline", covering.length ? "nuance-overlap" : "nuance-only");
        const title = covering.length > 1
          ? text("multipleAnnotations", "この箇所の解説", "Explanations at this position")
          : covering.length === 1
            ? (covering[0].type === "additional" ? text("additionalExplanationType", "追加解説", "Added explanation") : t(typeTextKeys[covering[0].type]))
            : `${t("nuance")}: ${coveringNuances.map((item) => t(item.category)).join(" / ")}`;
        appendInteractiveText(
          els.annotatedText,
          segment,
          classes.join(" "),
          () => {
            if (covering.length > 1) openAnnotationStack(covering);
            else if (covering.length === 1) openPopup(covering[0].id);
            else openConnotationPopup(coveringNuances[0].id);
          },
          title,
        );
      }
    };
    renderAnnotatedText.__overlapAware = true;
  }

  function ensureStackDialog() {
    let backdrop = root.document.getElementById("annotationStackOverlay");
    if (backdrop) return backdrop;
    backdrop = root.document.createElement("div");
    backdrop.id = "annotationStackOverlay";
    backdrop.className = "annotation-stack-backdrop";
    backdrop.hidden = true;
    backdrop.innerHTML = `
      <section class="annotation-stack-dialog" role="dialog" aria-modal="true">
        <div class="annotation-stack-head"><h2></h2><button type="button" class="annotation-stack-close">×</button></div>
        <div class="annotation-stack-list"></div>
      </section>`;
    root.document.body.appendChild(backdrop);
    const close = () => { backdrop.hidden = true; };
    backdrop.querySelector(".annotation-stack-close").addEventListener("click", close);
    backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });
    return backdrop;
  }

  function openAnnotationStack(items) {
    const backdrop = ensureStackDialog();
    backdrop.querySelector("h2").textContent = text("multipleAnnotations", "この箇所の解説", "Explanations at this position");
    const list = backdrop.querySelector(".annotation-stack-list");
    list.innerHTML = "";
    for (const item of items.slice().sort((a, b) => (a.end - a.start) - (b.end - b.start))) {
      const card = root.document.createElement("article");
      card.className = "annotation-stack-card";
      const title = root.document.createElement("div");
      title.className = "annotation-stack-title";
      const strong = root.document.createElement("strong");
      strong.textContent = item.text;
      const badge = root.document.createElement("span");
      badge.className = `badge ${item.type}`;
      badge.textContent = item.type === "additional"
        ? text("additionalExplanationType", "追加解説", "Added explanation")
        : t(typeTextKeys[item.type]);
      title.append(strong, badge);
      const body = root.document.createElement("div");
      body.className = "annotation-stack-body";
      if (item.type === "additional") {
        const q = root.document.createElement("p");
        q.className = "annotation-stack-question";
        q.textContent = `${text("questionLabel", "質問", "Question")}：${item.question || item.noteJa || ""}`;
        const a = root.document.createElement("p");
        a.textContent = `${text("answerLabel", "回答", "Answer")}：${item.answer || item.meaningJa || ""}`;
        body.append(q, a);
      } else {
        const meaning = root.document.createElement("p");
        meaning.textContent = cardPresentation.quoteGloss(item.meaningJa, state.uiLanguage);
        body.appendChild(meaning);
        if (item.pattern) {
          const pattern = root.document.createElement("p");
          pattern.textContent = `${t("patternLabel")} ${item.pattern}`;
          body.appendChild(pattern);
        }
        if (item.noteJa) {
          const note = root.document.createElement("p");
          note.textContent = item.noteJa;
          body.appendChild(note);
        }
        if (item.example) {
          const example = root.document.createElement("p");
          example.textContent = `${t("examplePrefix")}${item.example}`;
          body.appendChild(example);
        }
      }
      card.append(title, body);
      list.appendChild(card);
    }
    backdrop.hidden = false;
  }

  function installPopupPatch() {
    if (typeof openPopup !== "function" || originalOpenPopup) return;
    originalOpenPopup = openPopup;
    openPopup = function teachingOpenPopup(id) {
      const item = state?.annotationsById?.get(id);
      if (!item || item.type !== "additional") return originalOpenPopup(id);
      els.popupWord.textContent = item.text;
      els.popupType.textContent = text("additionalExplanationType", "追加解説", "Added explanation");
      els.popupType.className = "popup-type badge additional";
      els.popupType.hidden = false;
      els.popupDef.textContent = `${text("questionLabel", "質問", "Question")}：${item.question || item.noteJa || ""}`;
      els.popupPattern.hidden = true;
      els.popupNote.textContent = `${text("answerLabel", "回答", "Answer")}：${item.answer || item.meaningJa || ""}`;
      els.popupExample.textContent = "";
      els.popupNuances.innerHTML = "";
      els.overlay.classList.add("show");
    };
  }

  function installQuestionAddButton() {
    const dialog = root.document.querySelector(".ac-question-dialog");
    const answer = dialog?.querySelector(".ac-question-answer");
    if (!dialog || !answer || !lastQuestion?.answer) return;
    let button = dialog.querySelector(".ac-add-annotation");
    if (!button) {
      button = root.document.createElement("button");
      button.type = "button";
      button.className = "ac-add-annotation";
      answer.insertAdjacentElement("afterend", button);
      button.addEventListener("click", () => addQuestionAnnotation(button));
    }
    const label = text("addAsAnnotation", "＋ アノテーションに追加", "+ Add as annotation");
    if (button.textContent !== label) button.textContent = label;
    if (button.disabled) button.disabled = false;
  }

  function addQuestionAnnotation(button) {
    if (!lastQuestion?.answer || !state?.result) return;
    let start = lastQuestion.start;
    let end = lastQuestion.end;
    if (!Number.isInteger(start) || !Number.isInteger(end) || state.result.sourceText.slice(start, end) !== lastQuestion.selectedText) {
      start = state.result.sourceText.indexOf(lastQuestion.selectedText);
      end = start >= 0 ? start + lastQuestion.selectedText.length : -1;
    }
    if (start < 0 || end <= start) return;
    const id = `qa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    state.result.annotations.push({
      id,
      text: lastQuestion.selectedText,
      type: "additional",
      meaningJa: lastQuestion.answer,
      noteJa: lastQuestion.question,
      example: "",
      pattern: "",
      coreRanges: [],
      start,
      end,
      question: lastQuestion.question,
      answer: lastQuestion.answer,
      userAdded: true,
    });
    renderResult();
    if (typeof persistSettings === "function") persistSettings();
    button.disabled = true;
    button.textContent = text("annotationAdded", "追加解説として本文に加えました。", "Added to the text as an explanation annotation.");
  }

  function observeQuestionDialog() {
    const answer = root.document.querySelector(".ac-question-answer");
    if (!answer) return;
    const observer = new MutationObserver(() => {
      if (answer.textContent?.trim() && lastQuestion?.answer) installQuestionAddButton();
    });
    observer.observe(answer, { childList: true, subtree: true, characterData: true });
  }

  function installRuntime() {
    installStyles();
    patchAnnotationType();
    installControls();
    installFetchWrapper();
    installRenderPatch();
    installPopupPatch();
    observeQuestionDialog();
    root.document.getElementById("uiLangSelect")?.addEventListener("change", () => root.setTimeout(relabel, 0));
    if (typeof state !== "undefined" && state.result && typeof renderResult === "function") renderResult();
  }

  if (root.document.readyState === "complete") root.setTimeout(installRuntime, 0);
  else root.addEventListener("load", installRuntime, { once: true });
}(typeof globalThis !== "undefined" ? globalThis : this));
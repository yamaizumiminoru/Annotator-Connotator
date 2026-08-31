(function installAnnotationWorkflow(root) {
  if (!root?.document) return;

  const UI = {
    ja: {
      addedExplanationType: "追加解説",
      questionAddAnnotation: "＋ アノテーションに追加",
      questionAnnotationAdded: "追加解説として本文に加えました。",
      questionAnnotationDuplicate: "同じ追加解説はすでにあります。",
      addedQuestionLabel: "質問",
      addedAnswerLabel: "回答",
      overlappingExplanations: "この箇所には複数の解説があります",
    },
    en: {
      addedExplanationType: "Added note",
      questionAddAnnotation: "+ Add as annotation",
      questionAnnotationAdded: "Added to the text as an annotation.",
      questionAnnotationDuplicate: "The same added annotation already exists.",
      addedQuestionLabel: "Question",
      addedAnswerLabel: "Answer",
      overlappingExplanations: "Multiple explanations apply here",
    },
  };

  let lastQuestionAnswer = null;

  function extendUiText() {
    root.UI_TEXT = root.UI_TEXT || {};
    for (const language of ["ja", "en"]) {
      root.UI_TEXT[language] = { ...(root.UI_TEXT[language] || {}), ...UI[language] };
    }
    try {
      if (typeof typeTextKeys === "object") typeTextKeys.added = "addedExplanationType";
    } catch {
      // Main script may not have created its map yet. install() retries.
    }
  }

  function currentLanguage() {
    try {
      if (typeof state === "object" && state?.uiLanguage) return state.uiLanguage;
    } catch {
      // Fall through to selector.
    }
    return root.document.getElementById("uiLangSelect")?.value || "ja";
  }

  function tr(key) {
    const language = String(currentLanguage()).toLowerCase();
    if (language.startsWith("ja")) return UI.ja[key] || key;
    if (language.startsWith("en")) return UI.en[key] || key;
    try {
      if (typeof t === "function") {
        const translated = t(key);
        if (translated && translated !== key) return translated;
      }
    } catch {
      // Dynamic strings in other UI languages use English fallback.
    }
    return UI.en[key] || key;
  }

  function installStyles() {
    if (root.document.getElementById("annotationWorkflowStyles")) return;
    const style = root.document.createElement("style");
    style.id = "annotationWorkflowStyles";
    style.textContent = `
      /* A single annotation is intentionally lighter; overlap adds a neutral translucent layer. */
      .hl-word,.hl-term{background-color:color-mix(in srgb,var(--vocab-bg) 70%,transparent)}
      .hl-collocation,.hl-formula,.hl-idiom{background-color:color-mix(in srgb,var(--phrase-bg) 70%,transparent)}
      .hl-construction{background-color:color-mix(in srgb,var(--grammar-bg) 70%,transparent)}
      .hl-added{background-color:color-mix(in srgb,#dce7ee 72%,transparent);color:#35515f}
      .badge.added{background:#dce7ee;color:#35515f}
      .annotation-depth-2{background-image:linear-gradient(rgb(31 36 40 / 7%),rgb(31 36 40 / 7%))}
      .annotation-depth-3{background-image:linear-gradient(rgb(31 36 40 / 12%),rgb(31 36 40 / 12%))}
      .annotation-depth-4{background-image:linear-gradient(rgb(31 36 40 / 17%),rgb(31 36 40 / 17%))}
      .word-card .note:empty,.popup-note:empty{display:none!important}
      .added-question{margin:7px 0 0;color:var(--muted);line-height:1.6;font-size:13px}
      .added-question strong{color:var(--text)}
      .popup-added-question{margin:14px 0 8px;color:var(--muted);line-height:1.6}
      .popup-added-question strong{color:var(--text)}
      .overlap-extra{margin-top:16px;padding-top:14px;border-top:1px solid var(--line)}
      .overlap-extra-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
      .overlap-extra-head strong{font-size:15px}
      .overlap-extra p{margin:7px 0 0;line-height:1.6;color:var(--muted)}
      .overlap-extra .meaning{color:var(--text);font-weight:650}
      .overlap-heading{margin:15px 0 2px;color:var(--muted);font-size:11px;font-weight:700}
      .ac-question-add-annotation{border:1px solid rgba(0,0,0,.18);border-radius:9px;padding:9px 13px;font:inherit;font-weight:700;background:transparent;color:inherit;cursor:pointer}
      .ac-question-add-annotation[hidden]{display:none!important}
    `;
    root.document.head.appendChild(style);
  }

  function normalizeAnnotationType(type) {
    const value = String(type || "word").toLowerCase();
    return new Set(["word", "collocation", "formula", "construction", "idiom", "term", "added"]).has(value)
      ? value
      : "word";
  }

  function typeLabel(type) {
    if (type === "added") return tr("addedExplanationType");
    try {
      if (typeof t === "function" && typeof typeTextKeys === "object" && typeTextKeys[type]) {
        return t(typeTextKeys[type]);
      }
    } catch {
      // Fall through.
    }
    return String(type || "");
  }

  function locateSpan(sourceText, item) {
    const source = String(sourceText || "");
    const needle = String(item?.text || "");
    if (!needle) return null;
    if (
      Number.isInteger(item.start)
      && Number.isInteger(item.end)
      && item.start >= 0
      && item.end > item.start
      && item.end <= source.length
      && source.slice(item.start, item.end).toLocaleLowerCase() === needle.toLocaleLowerCase()
    ) return { start: item.start, end: item.end, item };

    const candidates = [];
    const lowerSource = source.toLocaleLowerCase();
    const lowerNeedle = needle.toLocaleLowerCase();
    let cursor = lowerSource.indexOf(lowerNeedle);
    while (cursor >= 0) {
      candidates.push(cursor);
      cursor = lowerSource.indexOf(lowerNeedle, cursor + 1);
    }
    if (!candidates.length) return null;
    const approximate = Number.isInteger(item.start) ? item.start : candidates[0];
    const start = candidates.sort((a, b) => Math.abs(a - approximate) - Math.abs(b - approximate))[0];
    return { start, end: start + needle.length, item };
  }

  function appendText(parent, value) {
    const parts = String(value || "").split(/(\n+)/);
    for (const part of parts) {
      if (!part) continue;
      if (/^\n+$/.test(part)) {
        for (let index = 0; index < part.length; index += 1) parent.appendChild(root.document.createElement("br"));
      } else {
        parent.appendChild(root.document.createTextNode(part));
      }
    }
  }

  function appendInteractiveText(parent, value, className, click, title) {
    const parts = String(value || "").split(/(\n+)/);
    for (const part of parts) {
      if (!part) continue;
      if (/^\n+$/.test(part)) {
        for (let index = 0; index < part.length; index += 1) parent.appendChild(root.document.createElement("br"));
        continue;
      }
      const mark = root.document.createElement("span");
      mark.className = className;
      mark.textContent = part;
      mark.title = title;
      mark.addEventListener("click", click);
      parent.appendChild(mark);
    }
  }

  function depthClass(count) {
    if (count >= 4) return "annotation-depth-4";
    if (count === 3) return "annotation-depth-3";
    if (count === 2) return "annotation-depth-2";
    return "annotation-depth-1";
  }

  function sortByFocus(items) {
    return [...items].sort((a, b) => (
      (a.end - a.start) - (b.end - b.start)
      || (a.item.type === "added" ? -1 : 0) - (b.item.type === "added" ? -1 : 0)
      || a.start - b.start
    ));
  }

  function renderAnnotatedTextWithOverlap() {
    let current;
    let elements;
    try {
      current = state;
      elements = els;
    } catch {
      return;
    }
    if (!current?.result || !elements?.annotatedText) return;
    const text = String(current.result.sourceText || "");
    const annotationSpans = (current.result.annotations || [])
      .map((item) => locateSpan(text, item))
      .filter(Boolean);
    const nuanceSpans = (current.result.connotations || []).filter((item) => (
      Number.isInteger(item.start)
      && Number.isInteger(item.end)
      && item.start >= 0
      && item.end > item.start
      && item.end <= text.length
    ));

    elements.annotatedText.classList.remove("empty");
    elements.annotatedText.replaceChildren();
    const boundaries = new Set([0, text.length]);
    for (const span of [...annotationSpans, ...nuanceSpans]) {
      boundaries.add(span.start);
      boundaries.add(span.end);
    }
    const points = [...boundaries].sort((a, b) => a - b);

    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      if (end <= start) continue;
      const annotations = sortByFocus(annotationSpans.filter((span) => span.start <= start && span.end >= end));
      const nuances = nuanceSpans.filter((span) => span.start <= start && span.end >= end);
      const segmentText = text.slice(start, end);
      if (!annotations.length && !nuances.length) {
        appendText(elements.annotatedText, segmentText);
        continue;
      }

      const classes = [];
      if (annotations.length) {
        classes.push("hl", `hl-${normalizeAnnotationType(annotations[0].item.type)}`, depthClass(annotations.length));
      }
      if (nuances.length) classes.push("nuance-inline", annotations.length ? "nuance-overlap" : "nuance-only");
      const titleParts = [
        ...annotations.map((span) => typeLabel(span.item.type)),
        ...nuances.map((item) => {
          try { return typeof t === "function" ? t(item.category) : item.category; } catch { return item.category; }
        }),
      ];
      const click = () => {
        if (annotations.length === 1 && nuances.length === 0 && typeof root.openPopup === "function") {
          root.openPopup(annotations[0].item.id);
          return;
        }
        if (annotations.length === 0 && nuances.length === 1 && typeof root.openConnotationPopup === "function") {
          root.openConnotationPopup(nuances[0].id);
          return;
        }
        openExplanationGroup(annotations.map((span) => span.item), nuances);
      };
      appendInteractiveText(
        elements.annotatedText,
        segmentText,
        classes.join(" "),
        click,
        titleParts.join(" / "),
      );
    }
  }

  function extraAnnotationSection(item) {
    const section = root.document.createElement("section");
    section.className = "overlap-extra";
    const head = root.document.createElement("div");
    head.className = "overlap-extra-head";
    const title = root.document.createElement("strong");
    title.textContent = item.text;
    const badge = root.document.createElement("span");
    badge.className = `badge ${normalizeAnnotationType(item.type)}`;
    badge.textContent = typeLabel(item.type);
    head.append(title, badge);
    section.appendChild(head);

    if (item.type === "added") {
      const question = root.document.createElement("p");
      const strong = root.document.createElement("strong");
      strong.textContent = `${tr("addedQuestionLabel")}: `;
      question.append(strong, root.document.createTextNode(String(item.question || "")));
      section.appendChild(question);
      const answer = root.document.createElement("p");
      answer.className = "meaning";
      answer.textContent = String(item.answer || item.meaningJa || "");
      section.appendChild(answer);
      return section;
    }

    if (item.meaningJa) {
      const meaning = root.document.createElement("p");
      meaning.className = "meaning";
      try {
        meaning.textContent = cardPresentation.quoteGloss(item.meaningJa, state.uiLanguage);
      } catch {
        meaning.textContent = item.meaningJa;
      }
      section.appendChild(meaning);
    }
    if (item.pattern) {
      const pattern = root.document.createElement("p");
      try {
        pattern.textContent = `${t("patternLabel")} ${item.pattern}`;
      } catch {
        pattern.textContent = item.pattern;
      }
      section.appendChild(pattern);
    }
    if (item.noteJa) {
      const note = root.document.createElement("p");
      note.textContent = item.noteJa;
      section.appendChild(note);
    }
    if (item.example) {
      const example = root.document.createElement("p");
      try { example.textContent = `${t("examplePrefix")}${item.example}`; } catch { example.textContent = item.example; }
      section.appendChild(example);
    }
    return section;
  }

  function openExplanationGroup(annotations, nuances) {
    let elements;
    try { elements = els; } catch { return; }
    const sorted = [...annotations].sort((a, b) => (
      (Number(a.end) - Number(a.start)) - (Number(b.end) - Number(b.start))
      || (a.type === "added" ? -1 : 0) - (b.type === "added" ? -1 : 0)
    ));

    if (sorted.length && typeof root.openPopup === "function") {
      root.openPopup(sorted[0].id);
      const extras = elements.popupNuances;
      if (!extras) return;
      extras.replaceChildren();
      if (sorted.length > 1 || nuances.length) {
        const heading = root.document.createElement("p");
        heading.className = "overlap-heading";
        heading.textContent = tr("overlappingExplanations");
        extras.appendChild(heading);
      }
      for (const item of sorted.slice(1)) extras.appendChild(extraAnnotationSection(item));
      if (nuances.length && typeof renderNuanceBlock === "function") {
        extras.appendChild(renderNuanceBlock(nuances));
      }
      return;
    }

    if (nuances.length && typeof root.openConnotationPopup === "function") {
      root.openConnotationPopup(nuances[0].id);
      if (nuances.length > 1 && elements.popupNuances && typeof renderNuanceBlock === "function") {
        elements.popupNuances.replaceChildren(renderNuanceBlock(nuances));
      }
    }
  }

  function decorateAddedPopupFunctions() {
    if (typeof root.openPopup !== "function" || root.openPopup.__addedExplanationPatched) return;
    const original = root.openPopup;
    const patched = function addedExplanationAwarePopup(id) {
      const previousQuestion = root.document.getElementById("popupAddedQuestion");
      previousQuestion?.remove();
      const value = original.apply(this, arguments);
      let item;
      try { item = state.annotationsById?.get?.(id); } catch { item = null; }
      if (item?.type === "added") {
        const question = root.document.createElement("p");
        question.id = "popupAddedQuestion";
        question.className = "popup-added-question";
        const strong = root.document.createElement("strong");
        strong.textContent = `${tr("addedQuestionLabel")}: `;
        question.append(strong, root.document.createTextNode(String(item.question || "")));
        const definition = root.document.getElementById("popupDef");
        definition?.insertAdjacentElement("beforebegin", question);
        if (definition) definition.textContent = String(item.answer || item.meaningJa || "");
        const note = root.document.getElementById("popupNote");
        if (note) note.textContent = "";
        const pattern = root.document.getElementById("popupPattern");
        if (pattern) pattern.hidden = true;
        const example = root.document.getElementById("popupExample");
        if (example) example.textContent = "";
      }
      return value;
    };
    patched.__addedExplanationPatched = true;
    root.openPopup = patched;
  }

  function decorateAddedWordCards() {
    let current;
    try { current = state; } catch { return; }
    const list = root.document.getElementById("wordList");
    if (!current?.result || !list) return;
    const cards = [...list.querySelectorAll(":scope > .word-card:not(.nuance-card)")];
    (current.result.annotations || []).forEach((item, index) => {
      if (item.type !== "added") return;
      const card = cards[index];
      if (!card) return;
      card.querySelector(".added-question")?.remove();
      const question = root.document.createElement("p");
      question.className = "added-question";
      const strong = root.document.createElement("strong");
      strong.textContent = `${tr("addedQuestionLabel")}: `;
      question.append(strong, root.document.createTextNode(String(item.question || "")));
      const head = card.querySelector(".word-card-head");
      head?.insertAdjacentElement("afterend", question);
      const meaning = card.querySelector(".meaning");
      if (meaning) meaning.textContent = String(item.answer || item.meaningJa || "");
      const note = card.querySelector(".note");
      if (note) note.textContent = "";
    });
  }

  function patchRenderFunctions() {
    if (typeof root.renderAnnotatedText === "function" && !root.renderAnnotatedText.__overlapPatched) {
      renderAnnotatedTextWithOverlap.__overlapPatched = true;
      root.renderAnnotatedText = renderAnnotatedTextWithOverlap;
    }
    if (typeof root.renderWordList === "function" && !root.renderWordList.__addedPatched) {
      const original = root.renderWordList;
      const patched = function addedAwareWordList() {
        const result = original.apply(this, arguments);
        decorateAddedWordCards();
        return result;
      };
      patched.__addedPatched = true;
      root.renderWordList = patched;
    }
  }

  function resolveAddedOffsets(source, selectedText, start, end) {
    const text = String(source || "");
    const needle = String(selectedText || "");
    if (!needle) return null;
    if (
      Number.isInteger(start)
      && Number.isInteger(end)
      && start >= 0
      && end > start
      && end <= text.length
      && text.slice(start, end) === needle
    ) return { start, end };
    const positions = [];
    let cursor = text.indexOf(needle);
    while (cursor >= 0) {
      positions.push(cursor);
      cursor = text.indexOf(needle, cursor + 1);
    }
    if (!positions.length) return null;
    const approximate = Number.isInteger(start) ? start : positions[0];
    const resolvedStart = positions.sort((a, b) => Math.abs(a - approximate) - Math.abs(b - approximate))[0];
    return { start: resolvedStart, end: resolvedStart + needle.length };
  }

  function addQuestionAnnotation(detail) {
    let current;
    try { current = state; } catch { return false; }
    if (!current?.result || !detail?.answer || !detail?.selectedText) return false;
    const located = resolveAddedOffsets(
      current.result.sourceText,
      detail.selectedText,
      detail.selectedStart,
      detail.selectedEnd,
    );
    if (!located) return false;
    const duplicate = (current.result.annotations || []).some((item) => (
      item.type === "added"
      && item.start === located.start
      && item.end === located.end
      && String(item.question || "") === String(detail.question || "")
      && String(item.answer || item.meaningJa || "") === String(detail.answer || "")
    ));
    if (duplicate) {
      try { setStatus(tr("questionAnnotationDuplicate"), ""); } catch {}
      return false;
    }

    const annotation = {
      id: `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      text: String(detail.selectedText),
      type: "added",
      meaningJa: String(detail.answer),
      noteJa: "",
      example: "",
      pattern: "",
      coreRanges: [],
      start: located.start,
      end: located.end,
      origin: "question",
      question: String(detail.question || ""),
      answer: String(detail.answer),
    };
    current.result.annotations.push(annotation);
    try {
      if (typeof renderResult === "function") renderResult();
      else root.renderResult?.();
      setStatus(tr("questionAnnotationAdded"), "ok");
    } catch {
      return false;
    }
    return true;
  }

  function installQuestionCapture() {
    if (root.__questionAnnotationFetchPatched) return;
    root.__questionAnnotationFetchPatched = true;
    const previousFetch = root.fetch.bind(root);
    root.fetch = async function annotationQuestionFetch(input, init) {
      let url;
      try { url = new URL(typeof input === "string" ? input : input.url, root.location.href); } catch { return previousFetch(input, init); }
      const method = String(init?.method || (typeof input !== "string" ? input.method : "GET") || "GET").toUpperCase();
      if (method !== "POST" || url.pathname !== "/api/question" || typeof init?.body !== "string") {
        return previousFetch(input, init);
      }
      const addButton = root.document.querySelector(".ac-question-add-annotation");
      if (addButton) addButton.hidden = true;
      lastQuestionAnswer = null;
      let payload = null;
      try { payload = JSON.parse(init.body); } catch { payload = null; }
      const response = await previousFetch(input, init);
      if (response.ok && payload) {
        try {
          const data = await response.clone().json();
          if (data.answer) {
            lastQuestionAnswer = {
              selectedText: String(payload.selectedText || ""),
              selectedStart: Number.isInteger(payload.selectedStart) ? payload.selectedStart : null,
              selectedEnd: Number.isInteger(payload.selectedEnd) ? payload.selectedEnd : null,
              question: String(payload.question || ""),
              answer: String(data.answer),
            };
            if (addButton) addButton.hidden = false;
          }
        } catch {
          // The normal question UI still owns error handling.
        }
      }
      return response;
    };
  }

  function installQuestionAddButton() {
    const actions = root.document.querySelector(".ac-question-actions");
    if (!actions || root.document.querySelector(".ac-question-add-annotation")) return;
    const button = root.document.createElement("button");
    button.type = "button";
    button.className = "ac-question-add-annotation";
    button.hidden = true;
    button.textContent = tr("questionAddAnnotation");
    button.addEventListener("click", () => {
      if (lastQuestionAnswer && addQuestionAnnotation(lastQuestionAnswer)) button.hidden = true;
    });
    actions.insertBefore(button, actions.querySelector(".ac-question-status"));
  }

  function localizeDynamicUi() {
    const button = root.document.querySelector(".ac-question-add-annotation");
    if (button) button.textContent = tr("questionAddAnnotation");
    decorateAddedWordCards();
  }

  function install() {
    extendUiText();
    try { if (typeof typeTextKeys === "object") typeTextKeys.added = "addedExplanationType"; } catch {}
    installStyles();
    patchRenderFunctions();
    decorateAddedPopupFunctions();
    installQuestionCapture();
    installQuestionAddButton();
    decorateAddedWordCards();
    root.addQuestionAnnotation = addQuestionAnnotation;
    root.openExplanationGroup = openExplanationGroup;
    root.document.getElementById("uiLangSelect")?.addEventListener("change", () => root.setTimeout(localizeDynamicUi, 0));

    const wordList = root.document.getElementById("wordList");
    if (wordList) new MutationObserver(decorateAddedWordCards).observe(wordList, { childList: true, subtree: true });
  }

  extendUiText();
  if (root.document.readyState === "loading") {
    root.document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    root.setTimeout(install, 0);
  }
}(typeof globalThis !== "undefined" ? globalThis : this));
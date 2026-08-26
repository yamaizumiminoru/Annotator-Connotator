(function initQuestionClient(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root?.document) api.install(root);
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const ENDPOINT = "/api/question";
  const EXTENSION_MESSAGE_SOURCE = "annotator-connotator-extension";
  const UI_TEXT = {
    ja: {
      questionHint: "テキストを選択して右クリック → 質問",
      questionSelected: "選択した箇所",
      questionPlaceholder: "この箇所について質問を書く…",
      questionAsk: "質問する",
      questionClose: "閉じる",
      questionMic: "音声入力",
      questionListening: "聞いています…",
      questionThinking: "考えています…",
      questionUsedContext: "前後の文脈を確認して回答しました。",
      questionRequired: "質問を入力してください。",
      questionFailed: "回答を取得できませんでした。",
      questionApiKey: "OpenAI APIキーが設定されていません。",
      questionVoiceUnavailable: "このブラウザでは音声入力を利用できません。",
    },
    en: {
      questionHint: "Select text and right-click → Ask",
      questionSelected: "Selected passage",
      questionPlaceholder: "Ask about this passage…",
      questionAsk: "Ask",
      questionClose: "Close",
      questionMic: "Voice input",
      questionListening: "Listening…",
      questionThinking: "Thinking…",
      questionUsedContext: "Answered after checking the surrounding context.",
      questionRequired: "Enter a question first.",
      questionFailed: "Could not get an answer.",
      questionApiKey: "No OpenAI API key is configured.",
      questionVoiceUnavailable: "Voice input is not available in this browser.",
    },
  };

  function installUiText(root) {
    if (!root.UI_TEXT) root.UI_TEXT = {};
    for (const [language, strings] of Object.entries(UI_TEXT)) {
      root.UI_TEXT[language] = {
        ...(root.UI_TEXT[language] || {}),
        ...strings,
      };
    }
  }

  function tr(root, key) {
    if (typeof root.t === "function") return root.t(key);
    const language = root.document?.getElementById("uiLangSelect")?.value || "ja";
    return root.UI_TEXT?.[language]?.[key] || root.UI_TEXT?.en?.[key] || root.UI_TEXT?.ja?.[key] || key;
  }

  function injectStyles(root) {
    if (root.document.getElementById("question-client-styles")) return;
    const style = root.document.createElement("style");
    style.id = "question-client-styles";
    style.textContent = `
      .ac-question-hint {
        margin-left: auto;
        color: var(--muted, #6f6f6f);
        font-size: 11px;
        font-weight: 500;
        white-space: nowrap;
      }
      @media (max-width: 760px) {
        .ac-question-hint { flex-basis: 100%; margin-left: 0; margin-top: 4px; }
      }
      .ac-question-backdrop {
        position: fixed;
        inset: 0;
        z-index: 10030;
        display: grid;
        place-items: center;
        padding: 20px;
        background: rgba(0,0,0,.28);
      }
      .ac-question-backdrop[hidden] { display: none !important; }
      .ac-question-dialog {
        width: min(640px, 100%);
        max-height: min(80vh, 720px);
        overflow: auto;
        border: 1px solid rgba(0,0,0,.14);
        border-radius: 16px;
        background: Canvas;
        color: CanvasText;
        box-shadow: 0 24px 70px rgba(0,0,0,.28);
        padding: 18px;
      }
      .ac-question-heading {
        display: flex;
        justify-content: flex-end;
        margin: -5px -6px 8px 0;
      }
      .ac-question-close {
        border: 0;
        background: transparent;
        color: inherit;
        font-size: 1.35rem;
        cursor: pointer;
        padding: 3px 7px;
      }
      .ac-question-label { margin: 0 0 6px; font-size: .82rem; font-weight: 700; opacity: .72; }
      .ac-question-selected {
        margin: 0 0 14px;
        padding: 10px 12px;
        max-height: 150px;
        overflow: auto;
        border-radius: 9px;
        background: color-mix(in srgb, CanvasText 6%, Canvas);
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .ac-question-input-row { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: stretch; }
      .ac-question-input {
        width: 100%;
        min-height: 82px;
        resize: vertical;
        box-sizing: border-box;
        border: 1px solid rgba(0,0,0,.2);
        border-radius: 9px;
        padding: 10px 11px;
        font: inherit;
        background: Canvas;
        color: CanvasText;
      }
      .ac-question-mic {
        align-self: start;
        min-width: 42px;
        height: 42px;
        border: 1px solid rgba(0,0,0,.18);
        border-radius: 9px;
        background: transparent;
        color: inherit;
        cursor: pointer;
      }
      .ac-question-actions { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
      .ac-question-submit {
        border: 0;
        border-radius: 9px;
        padding: 9px 15px;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
        background: #242424;
        color: #fff;
      }
      .ac-question-submit:disabled { opacity: .55; cursor: wait; }
      .ac-question-status { min-height: 1.25em; margin: 0; font-size: .84rem; opacity: .72; }
      .ac-question-answer {
        margin-top: 14px;
        padding-top: 14px;
        border-top: 1px solid rgba(0,0,0,.12);
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        line-height: 1.65;
      }
      .ac-question-answer:empty { display: none; }
      @media (prefers-color-scheme: dark) {
        .ac-question-submit { background: #f0f0f0; color: #161616; }
      }
    `;
    root.document.head.appendChild(style);
  }

  function nearestOccurrence(sourceText, selectedText, approximateStart = 0) {
    const source = String(sourceText || "");
    const selected = String(selectedText || "");
    if (!selected) return null;
    const approx = Number.isFinite(Number(approximateStart)) ? Number(approximateStart) : 0;
    let best = -1;
    let bestDistance = Infinity;
    let cursor = 0;
    while (cursor <= source.length) {
      const index = source.indexOf(selected, cursor);
      if (index < 0) break;
      const distance = Math.abs(index - approx);
      if (distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
      cursor = index + Math.max(1, selected.length);
    }
    return best < 0 ? null : { start: best, end: best + selected.length };
  }

  function resolveOffsets(sourceText, selectedText, approximateStart = 0) {
    const source = String(sourceText || "");
    const selected = String(selectedText || "");
    const approx = Math.max(0, Math.min(source.length, Number(approximateStart) || 0));
    if (source.slice(approx, approx + selected.length) === selected) {
      return { start: approx, end: approx + selected.length };
    }
    return nearestOccurrence(source, selected, approx);
  }

  function selectionFromTextarea(input) {
    if (!input || typeof input.selectionStart !== "number" || typeof input.selectionEnd !== "number") return null;
    if (input.selectionStart === input.selectionEnd) return null;
    const selectedText = input.value.slice(input.selectionStart, input.selectionEnd);
    if (!selectedText.trim()) return null;
    return {
      selectedText,
      start: input.selectionStart,
      end: input.selectionEnd,
    };
  }

  function selectionFromAnnotated(root, container, sourceText) {
    const selection = root.getSelection?.();
    if (!selection || selection.rangeCount < 1 || selection.isCollapsed) return null;
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
    } catch {
      approximateStart = 0;
    }
    const offsets = resolveOffsets(sourceText, selectedText, approximateStart);
    return {
      selectedText,
      start: offsets?.start ?? null,
      end: offsets?.end ?? null,
    };
  }

  function chooseContextSelection(liveSelection, pointerSelection, rememberedSelection, pointerObserved = false) {
    if (liveSelection) return liveSelection;
    if (pointerObserved) return pointerSelection || null;
    return rememberedSelection || null;
  }

  function install(root) {
    if (root.__questionClientInstalled) return;
    root.__questionClientInstalled = true;
    installUiText(root);
    injectStyles(root);

    const document = root.document;
    const sourceInput = document.getElementById("sourceText");
    const annotated = document.getElementById("annotatedText");
    if (!sourceInput || !annotated) return;

    let activeSelection = null;
    let recognition = null;
    let rememberedSourceSelection = null;
    let rememberedAnnotatedSelection = null;
    let lastRememberedSelection = null;

    const legend = document.querySelector(".legend");
    if (legend && !legend.querySelector(".ac-question-hint")) {
      const hint = document.createElement("span");
      hint.className = "ac-question-hint";
      hint.dataset.questionI18n = "questionHint";
      legend.appendChild(hint);
    }

    const backdrop = document.createElement("div");
    backdrop.className = "ac-question-backdrop";
    backdrop.hidden = true;
    backdrop.innerHTML = `
      <section class="ac-question-dialog" role="dialog" aria-modal="true" aria-label="Question">
        <div class="ac-question-heading">
          <button class="ac-question-close" type="button" aria-label="Close">×</button>
        </div>
        <p class="ac-question-label" data-question-i18n="questionSelected"></p>
        <div class="ac-question-selected"></div>
        <div class="ac-question-input-row">
          <textarea class="ac-question-input"></textarea>
          <button class="ac-question-mic" type="button" aria-label="Voice input" title="Voice input">🎤</button>
        </div>
        <div class="ac-question-actions">
          <button class="ac-question-submit" type="button" data-question-i18n="questionAsk"></button>
          <p class="ac-question-status" role="status"></p>
        </div>
        <div class="ac-question-answer"></div>
      </section>
    `;
    document.body.appendChild(backdrop);

    const closeButton = backdrop.querySelector(".ac-question-close");
    const selectedBox = backdrop.querySelector(".ac-question-selected");
    const questionInput = backdrop.querySelector(".ac-question-input");
    const micButton = backdrop.querySelector(".ac-question-mic");
    const submitButton = backdrop.querySelector(".ac-question-submit");
    const status = backdrop.querySelector(".ac-question-status");
    const answerBox = backdrop.querySelector(".ac-question-answer");

    function localize() {
      for (const element of document.querySelectorAll("[data-question-i18n]")) {
        element.textContent = tr(root, element.dataset.questionI18n);
      }
      questionInput.placeholder = tr(root, "questionPlaceholder");
      closeButton.setAttribute("aria-label", tr(root, "questionClose"));
      micButton.title = tr(root, "questionMic");
      micButton.setAttribute("aria-label", tr(root, "questionMic"));
    }

    function closeDialog() {
      recognition?.abort?.();
      backdrop.hidden = true;
      status.textContent = "";
    }

    function openDialog() {
      if (!activeSelection) return;
      selectedBox.textContent = activeSelection.selectedText;
      questionInput.value = "";
      answerBox.textContent = "";
      status.textContent = "";
      backdrop.hidden = false;
      localize();
      root.setTimeout(() => questionInput.focus(), 0);
    }

    function selectionRegion(target) {
      if (target === sourceInput) return "source";
      if (annotated.contains(target)) return "annotated";
      return null;
    }

    function rememberSelection(region, snapshot) {
      if (!region || !snapshot) return;
      const remembered = { snapshot, sourceText: sourceInput.value, region };
      if (region === "source") rememberedSourceSelection = remembered;
      if (region === "annotated") rememberedAnnotatedSelection = remembered;
      lastRememberedSelection = remembered;
    }

    function validRememberedSelection(remembered) {
      if (!remembered || remembered.sourceText !== sourceInput.value) return null;
      const { snapshot } = remembered;
      if (!Number.isInteger(snapshot.start) || !Number.isInteger(snapshot.end)) return null;
      return sourceInput.value.slice(snapshot.start, snapshot.end) === snapshot.selectedText ? snapshot : null;
    }

    function currentSelectionForTarget(target) {
      const sourceText = sourceInput.value;
      if (target === sourceInput) return selectionFromTextarea(sourceInput);
      if (annotated.contains(target)) return selectionFromAnnotated(root, annotated, sourceText);
      return null;
    }

    function resolveExtensionSelection(selectedText) {
      const selected = String(selectedText || "");
      if (!selected.trim()) return null;

      const liveSource = selectionFromTextarea(sourceInput);
      if (liveSource?.selectedText === selected) return liveSource;
      const liveAnnotated = selectionFromAnnotated(root, annotated, sourceInput.value);
      if (liveAnnotated?.selectedText === selected) return liveAnnotated;

      const rememberedCandidates = [
        lastRememberedSelection,
        rememberedSourceSelection,
        rememberedAnnotatedSelection,
      ];
      for (const remembered of rememberedCandidates) {
        const snapshot = validRememberedSelection(remembered);
        if (snapshot?.selectedText === selected) return snapshot;
      }

      const approximateStart = validRememberedSelection(lastRememberedSelection)?.start || 0;
      const offsets = resolveOffsets(sourceInput.value, selected, approximateStart);
      return offsets ? { selectedText: selected, start: offsets.start, end: offsets.end } : null;
    }

    sourceInput.addEventListener("select", () => {
      rememberSelection("source", selectionFromTextarea(sourceInput));
    });

    document.addEventListener("selectionchange", () => {
      if (document.activeElement === sourceInput) {
        rememberSelection("source", selectionFromTextarea(sourceInput));
        return;
      }
      rememberSelection("annotated", selectionFromAnnotated(root, annotated, sourceInput.value));
    });

    // Preserve the exact selection before Chrome opens its native context menu.
    // We deliberately do not call preventDefault(), so Copy/Search/Translate keep working.
    document.addEventListener("pointerdown", (event) => {
      if (event.button !== 2) return;
      const region = selectionRegion(event.target);
      rememberSelection(region, currentSelectionForTarget(event.target));
    }, { capture: true });

    root.addEventListener("message", (event) => {
      if (event.source !== root || event.origin !== root.location.origin) return;
      const message = event.data;
      if (message?.source !== EXTENSION_MESSAGE_SOURCE || message?.type !== "question") return;
      const snapshot = resolveExtensionSelection(message.selectedText);
      if (!snapshot) return;
      activeSelection = snapshot;
      openDialog();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !backdrop.hidden) closeDialog();
    });

    closeButton.addEventListener("click", closeDialog);
    backdrop.addEventListener("pointerdown", (event) => {
      if (event.target === backdrop) closeDialog();
    });

    async function submitQuestion() {
      const question = questionInput.value.trim();
      if (!question) {
        status.textContent = tr(root, "questionRequired");
        questionInput.focus();
        return;
      }
      if (!activeSelection) return;

      submitButton.disabled = true;
      micButton.disabled = true;
      answerBox.textContent = "";
      status.textContent = tr(root, "questionThinking");

      const explanationSelect = document.getElementById("explanationLangSelect");
      const analysisMode = root.localStorage?.getItem("annotation.analysisMode") || "standard";
      try {
        const response = await root.fetch(ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sourceText: sourceInput.value,
            selectedText: activeSelection.selectedText,
            selectedStart: activeSelection.start,
            selectedEnd: activeSelection.end,
            question,
            explanationLanguage: explanationSelect?.value || "en",
            analysisMode,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (data.error === "api_key_required") throw Object.assign(new Error("api_key_required"), { code: "api_key_required" });
          throw new Error(data.detail || data.error || "question_failed");
        }
        answerBox.textContent = data.answer || "";
        status.textContent = tr(root, "questionUsedContext");
      } catch (error) {
        status.textContent = error?.code === "api_key_required"
          ? tr(root, "questionApiKey")
          : tr(root, "questionFailed");
      } finally {
        submitButton.disabled = false;
        micButton.disabled = false;
      }
    }

    submitButton.addEventListener("click", submitQuestion);
    questionInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void submitQuestion();
      }
    });

    const SpeechRecognition = root.SpeechRecognition || root.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      micButton.hidden = true;
      micButton.title = tr(root, "questionVoiceUnavailable");
    } else {
      micButton.addEventListener("click", () => {
        recognition?.abort?.();
        recognition = new SpeechRecognition();
        const explanationLanguage = document.getElementById("explanationLangSelect")?.value || "en";
        recognition.lang = explanationLanguage;
        recognition.interimResults = false;
        recognition.continuous = false;
        recognition.onstart = () => {
          status.textContent = tr(root, "questionListening");
          micButton.textContent = "●";
        };
        recognition.onresult = (event) => {
          const transcript = Array.from(event.results || [])
            .map((result) => result?.[0]?.transcript || "")
            .join(" ")
            .trim();
          if (transcript) {
            const separator = questionInput.value.trim() ? " " : "";
            questionInput.value += `${separator}${transcript}`;
          }
        };
        recognition.onerror = () => {
          status.textContent = tr(root, "questionVoiceUnavailable");
        };
        recognition.onend = () => {
          micButton.textContent = "🎤";
          if (status.textContent === tr(root, "questionListening")) status.textContent = "";
          questionInput.focus();
        };
        recognition.start();
      });
    }

    document.getElementById("uiLangSelect")?.addEventListener("change", () => root.setTimeout(localize, 0));
    localize();
  }

  return {
    ENDPOINT,
    EXTENSION_MESSAGE_SOURCE,
    UI_TEXT,
    install,
    nearestOccurrence,
    resolveOffsets,
    chooseContextSelection,
    selectionFromTextarea,
  };
}));

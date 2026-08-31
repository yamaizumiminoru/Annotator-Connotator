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

  function installPopupVisibilityOverride() {
    if (root.document.getElementById("popupExplanationVisibilityOverride")) return;
    const style = root.document.createElement("style");
    style.id = "popupExplanationVisibilityOverride";
    style.textContent = `
      html.hide-annotation-explanations .popup .popup-def,
      html.hide-annotation-explanations .popup .popup-pattern,
      html.hide-annotation-explanations .popup .popup-note,
      html.hide-annotation-explanations .popup .popup-ex,
      html.hide-annotation-explanations .popup .popup-nuances,
      html.hide-annotation-explanations .annotation-stack-body{display:block!important}
      .ac-question-answer.ac-rich-text{white-space:normal}
      .ac-question-answer.ac-rich-text p{margin:.7em 0}
      .ac-question-answer.ac-rich-text p:first-child{margin-top:0}
      .ac-question-answer.ac-rich-text p:last-child{margin-bottom:0}
      .ac-question-answer.ac-rich-text ul,
      .ac-question-answer.ac-rich-text ol{margin:.65em 0;padding-left:1.6em}
      .ac-question-answer.ac-rich-text li{margin:.28em 0}
      .ac-question-answer.ac-rich-text blockquote{margin:.7em 0;padding-left:.9em;border-left:3px solid rgba(0,0,0,.18);opacity:.9}
      .ac-question-answer.ac-rich-text code{padding:.08em .28em;border-radius:4px;background:color-mix(in srgb, CanvasText 7%, Canvas);font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
    `;
    root.document.head.appendChild(style);
  }

  function appendInlineMarkdown(parent, source) {
    const text = String(source || "");
    const tokenPattern = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*)/g;
    let cursor = 0;
    for (const match of text.matchAll(tokenPattern)) {
      if (match.index > cursor) parent.appendChild(root.document.createTextNode(text.slice(cursor, match.index)));
      const token = match[0];
      let element;
      if (token.startsWith("**")) {
        element = root.document.createElement("strong");
        element.textContent = token.slice(2, -2);
      } else if (token.startsWith("`")) {
        element = root.document.createElement("code");
        element.textContent = token.slice(1, -1);
      } else {
        element = root.document.createElement("em");
        element.textContent = token.slice(1, -1);
      }
      parent.appendChild(element);
      cursor = match.index + token.length;
    }
    if (cursor < text.length) parent.appendChild(root.document.createTextNode(text.slice(cursor)));
  }

  function renderRichText(container, source) {
    if (!container) return;
    const text = String(source || "").replace(/\r\n?/g, "\n");
    container.replaceChildren();
    container.classList.add("ac-rich-text");
    if (!text.trim()) return;

    const lines = text.split("\n");
    let list = null;
    let paragraph = null;

    function closeList() {
      list = null;
    }

    function closeParagraph() {
      paragraph = null;
    }

    function ensureParagraph() {
      closeList();
      if (!paragraph) {
        paragraph = root.document.createElement("p");
        container.appendChild(paragraph);
      } else {
        paragraph.appendChild(root.document.createElement("br"));
      }
      return paragraph;
    }

    for (const line of lines) {
      if (!line.trim()) {
        closeList();
        closeParagraph();
        continue;
      }

      const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
      if (headingMatch) {
        closeList();
        closeParagraph();
        const heading = root.document.createElement(`h${Math.min(4, headingMatch[1].length + 2)}`);
        appendInlineMarkdown(heading, headingMatch[2]);
        container.appendChild(heading);
        continue;
      }

      const unorderedMatch = line.match(/^\s*[-*]\s+(.+)$/);
      const orderedMatch = line.match(/^\s*\d+[.)]\s+(.+)$/);
      if (unorderedMatch || orderedMatch) {
        closeParagraph();
        const tag = unorderedMatch ? "UL" : "OL";
        if (!list || list.tagName !== tag) {
          list = root.document.createElement(tag.toLowerCase());
          container.appendChild(list);
        }
        const item = root.document.createElement("li");
        appendInlineMarkdown(item, (unorderedMatch || orderedMatch)[1]);
        list.appendChild(item);
        continue;
      }

      const quoteMatch = line.match(/^>\s?(.*)$/);
      if (quoteMatch) {
        closeList();
        closeParagraph();
        const quote = root.document.createElement("blockquote");
        appendInlineMarkdown(quote, quoteMatch[1]);
        container.appendChild(quote);
        continue;
      }

      appendInlineMarkdown(ensureParagraph(), line);
    }
  }

  function installQuestionAnswerRichText() {
    const answer = root.document.querySelector(".ac-question-answer");
    if (!answer || answer.dataset.richTextObserverInstalled === "true") return;
    answer.dataset.richTextObserverInstalled = "true";
    root.AC_RICH_TEXT = { render: renderRichText };

    const observer = new MutationObserver(() => {
      const raw = answer.textContent || "";
      if (!raw.trim()) {
        answer.dataset.richTextSource = "";
        return;
      }
      observer.disconnect();
      renderRichText(answer, raw);
      answer.dataset.richTextSource = raw;
      observer.observe(answer, { childList: true, subtree: true, characterData: true });
    });
    observer.observe(answer, { childList: true, subtree: true, characterData: true });
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
    installQuestionAnswerRichText();
  }

  function install() {
    patchLabelCatalog();
    installPopupVisibilityOverride();
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

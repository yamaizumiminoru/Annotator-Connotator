(function installAdditionalRichTextPolish(root) {
  if (!root?.document || root.__additionalRichTextPolishInstalled) return;
  root.__additionalRichTextPolishInstalled = true;

  function labelText(key, fallbackJa, fallbackEn) {
    try {
      if (typeof t === "function") {
        const translated = t(key);
        if (translated && translated !== key) return translated;
      }
    } catch {}
    const language = String(root.document.getElementById("uiLangSelect")?.value || "ja").toLowerCase();
    return language.startsWith("ja") ? fallbackJa : fallbackEn;
  }

  function renderInto(container, source) {
    if (!container) return false;
    const renderer = root.AC_RICH_TEXT?.render;
    if (typeof renderer !== "function") return false;
    renderer(container, String(source || ""));
    container.classList.add("ac-added-rich-content");
    return true;
  }

  function installStyles() {
    if (root.document.getElementById("additionalRichTextStyles")) return;
    const style = root.document.createElement("style");
    style.id = "additionalRichTextStyles";
    style.textContent = `
      .ac-added-rich-answer{margin:12px 0 0;line-height:1.65}
      .ac-added-rich-label{display:block;margin:0 0 6px;font-weight:700;color:inherit}
      .ac-added-rich-content{white-space:normal;overflow-wrap:anywhere}
      .ac-added-rich-content p{margin:.7em 0}
      .ac-added-rich-content p:first-child{margin-top:0}
      .ac-added-rich-content p:last-child{margin-bottom:0}
      .ac-added-rich-content ul,.ac-added-rich-content ol{margin:.65em 0;padding-left:1.6em}
      .ac-added-rich-content li{margin:.28em 0}
      .ac-added-rich-content blockquote{margin:.7em 0;padding-left:.9em;border-left:3px solid rgba(0,0,0,.18);opacity:.9}
      .ac-added-rich-content code{padding:.08em .28em;border-radius:4px;background:color-mix(in srgb, CanvasText 7%, Canvas);font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
      .annotation-stack-rich-answer{margin:7px 0;line-height:1.65}
    `;
    root.document.head.appendChild(style);
  }

  function ensurePopupAnswerBox() {
    let box = root.document.getElementById("additionalRichPopupAnswer");
    if (box) return box;
    const note = root.document.getElementById("popupNote");
    if (!note) return null;
    box = root.document.createElement("div");
    box.id = "additionalRichPopupAnswer";
    box.className = "ac-added-rich-answer";
    box.hidden = true;
    note.insertAdjacentElement("afterend", box);
    return box;
  }

  function fillRichAnswer(box, answer) {
    box.replaceChildren();
    const label = root.document.createElement("span");
    label.className = "ac-added-rich-label";
    label.textContent = `${labelText("answerLabel", "回答", "Answer")}：`;
    const content = root.document.createElement("div");
    box.append(label, content);
    renderInto(content, answer);
  }

  function patchSinglePopup() {
    if (typeof openPopup !== "function" || openPopup.__additionalRichTextPatched) return false;
    const previousOpenPopup = openPopup;
    openPopup = function richAddedExplanationPopup(id) {
      const item = state?.annotationsById?.get(id);
      const result = previousOpenPopup(id);
      const note = root.document.getElementById("popupNote");
      const richBox = ensurePopupAnswerBox();
      if (!note || !richBox) return result;

      if (item?.type === "additional" && typeof root.AC_RICH_TEXT?.render === "function") {
        note.hidden = true;
        richBox.hidden = false;
        fillRichAnswer(richBox, item.answer || item.meaningJa || "");
      } else {
        note.hidden = false;
        richBox.hidden = true;
        richBox.replaceChildren();
      }
      return result;
    };
    openPopup.__additionalRichTextPatched = true;
    return true;
  }

  function stripAnswerPrefix(value) {
    return String(value || "").replace(/^[^：:\n]{1,30}[：:]\s*/, "");
  }

  function polishStackCard(card) {
    if (!card || card.dataset.additionalRichTextDone === "true") return;
    if (!card.querySelector(".badge.additional")) return;
    const body = card.querySelector(".annotation-stack-body");
    if (!body) return;
    const question = body.querySelector(".annotation-stack-question");
    const answer = [...body.children].find((node) => node !== question && node.tagName === "P");
    if (!answer || typeof root.AC_RICH_TEXT?.render !== "function") return;

    card.dataset.additionalRichTextDone = "true";
    const replacement = root.document.createElement("div");
    replacement.className = "annotation-stack-rich-answer";
    const label = root.document.createElement("span");
    label.className = "ac-added-rich-label";
    label.textContent = `${labelText("answerLabel", "回答", "Answer")}：`;
    const content = root.document.createElement("div");
    replacement.append(label, content);
    renderInto(content, stripAnswerPrefix(answer.textContent));
    answer.replaceWith(replacement);
  }

  function polishStackDialogs() {
    root.document.querySelectorAll(".annotation-stack-card").forEach(polishStackCard);
  }

  function installWhenReady(attempt = 0) {
    if (typeof root.AC_RICH_TEXT?.render !== "function") {
      if (attempt < 80) root.setTimeout(() => installWhenReady(attempt + 1), 50);
      return;
    }
    installStyles();
    patchSinglePopup();
    polishStackDialogs();

    const observer = new MutationObserver(polishStackDialogs);
    observer.observe(root.document.body, { childList: true, subtree: true });
  }

  installWhenReady();
}(typeof globalThis !== "undefined" ? globalThis : this));

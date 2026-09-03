(function initMathRichText(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root?.document) api.install(root);
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const KATEX_VERSION = "0.16.22";
  const KATEX_CSS_URL = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.min.css`;
  const KATEX_JS_URL = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.min.js`;
  const TOKEN_PREFIX = "\uE000ACMATH";
  const TOKEN_SUFFIX = "\uE001";

  function extractMath(source) {
    const items = [];
    const input = String(source || "");
    const pattern = /(`[^`\n]*`|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g;
    const text = input.replace(pattern, (raw) => {
      if (raw.startsWith("`")) return raw;
      const display = raw.startsWith("\\[");
      const tex = raw.slice(2, -2).trim();
      if (!tex) return raw;
      const token = `${TOKEN_PREFIX}${items.length}${TOKEN_SUFFIX}`;
      items.push({ token, raw, tex, display });
      return display ? `\n\n${token}\n\n` : token;
    });
    return { text, items };
  }

  function installStyles(root) {
    if (!root.document.getElementById("acMathRichTextStyles")) {
      const style = root.document.createElement("style");
      style.id = "acMathRichTextStyles";
      style.textContent = `
        .ac-math-inline{display:inline-block;max-width:100%;vertical-align:middle}
        .ac-math-display{display:block;max-width:100%;margin:.85em 0;overflow-x:auto;overflow-y:hidden;text-align:center}
        .ac-math-display .katex-display{margin:0}
      `;
      root.document.head.appendChild(style);
    }
    if (!root.document.getElementById("acKatexStyles")) {
      const link = root.document.createElement("link");
      link.id = "acKatexStyles";
      link.rel = "stylesheet";
      link.href = KATEX_CSS_URL;
      root.document.head.appendChild(link);
    }
  }

  function ensureKatex(root) {
    if (root.katex?.render) return Promise.resolve(root.katex);
    if (root.__acKatexPromise) return root.__acKatexPromise;
    installStyles(root);
    root.__acKatexPromise = new Promise((resolve, reject) => {
      const existing = root.document.getElementById("acKatexScript");
      const finish = () => {
        if (root.katex?.render) resolve(root.katex);
        else reject(new Error("katex_unavailable"));
      };
      if (existing) {
        existing.addEventListener("load", finish, { once: true });
        existing.addEventListener("error", () => reject(new Error("katex_load_failed")), { once: true });
        root.setTimeout(finish, 0);
        return;
      }
      const script = root.document.createElement("script");
      script.id = "acKatexScript";
      script.src = KATEX_JS_URL;
      script.async = true;
      script.addEventListener("load", finish, { once: true });
      script.addEventListener("error", () => reject(new Error("katex_load_failed")), { once: true });
      root.document.head.appendChild(script);
    });
    return root.__acKatexPromise;
  }

  function replaceTokens(root, container, items) {
    if (!container || !items.length) return [];
    const byToken = new Map(items.map((item) => [item.token, item]));
    const walker = root.document.createTreeWalker(container, root.NodeFilter?.SHOW_TEXT || 4);
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) textNodes.push(node);
    const created = [];

    for (const textNode of textNodes) {
      const text = String(textNode.nodeValue || "");
      if (!text.includes(TOKEN_PREFIX)) continue;
      const fragment = root.document.createDocumentFragment();
      let cursor = 0;
      while (cursor < text.length) {
        let nextIndex = -1;
        let nextItem = null;
        for (const item of byToken.values()) {
          const index = text.indexOf(item.token, cursor);
          if (index >= 0 && (nextIndex < 0 || index < nextIndex)) {
            nextIndex = index;
            nextItem = item;
          }
        }
        if (!nextItem) break;
        if (nextIndex > cursor) fragment.appendChild(root.document.createTextNode(text.slice(cursor, nextIndex)));
        const math = root.document.createElement("span");
        math.className = nextItem.display ? "ac-math-display" : "ac-math-inline";
        math.textContent = nextItem.raw;
        math.__acMathItem = nextItem;
        fragment.appendChild(math);
        created.push(math);
        cursor = nextIndex + nextItem.token.length;
      }
      if (cursor < text.length) fragment.appendChild(root.document.createTextNode(text.slice(cursor)));
      textNode.replaceWith(fragment);
    }
    return created;
  }

  function renderMathNodes(root, nodes) {
    if (!nodes.length) return;
    ensureKatex(root).then((katex) => {
      for (const node of nodes) {
        const item = node.__acMathItem;
        if (!item || !node.isConnected) continue;
        try {
          katex.render(item.tex, node, {
            displayMode: item.display,
            throwOnError: true,
            trust: false,
            strict: "warn",
          });
        } catch {
          node.textContent = item.raw;
        }
      }
    }).catch(() => {
      // Keep the original TeX delimiters visible when the optional renderer cannot load.
    });
  }

  function installQuestionSync(root, render) {
    const answer = root.document.querySelector(".ac-question-answer");
    if (!answer || answer.dataset.mathRichTextObserverInstalled === "true") return;
    answer.dataset.mathRichTextObserverInstalled = "true";
    const refresh = () => {
      const raw = String(answer.dataset.richTextSource || "");
      if (raw.trim()) render(answer, raw);
    };
    const observer = new MutationObserver((records) => {
      if (records.some((record) => record.type === "attributes" && record.attributeName === "data-rich-text-source")) refresh();
    });
    observer.observe(answer, { attributes: true, attributeFilter: ["data-rich-text-source"] });
    refresh();
  }

  function install(root) {
    if (root.__mathRichTextInstalled) return;
    root.__mathRichTextInstalled = true;
    installStyles(root);

    let attempts = 0;
    const patch = () => {
      const shared = root.AC_RICH_TEXT;
      if (!shared || typeof shared.render !== "function") {
        attempts += 1;
        if (attempts < 80) root.setTimeout(patch, 50);
        return;
      }
      if (shared.render.__mathAware) {
        installQuestionSync(root, shared.render);
        return;
      }
      const previous = shared.render;
      const render = function mathAwareRichText(container, source) {
        const extracted = extractMath(source);
        previous(container, extracted.text);
        const nodes = replaceTokens(root, container, extracted.items);
        renderMathNodes(root, nodes);
      };
      render.__mathAware = true;
      shared.render = render;
      installQuestionSync(root, render);
    };
    patch();
  }

  return {
    KATEX_CSS_URL,
    KATEX_JS_URL,
    extractMath,
    install,
  };
}));

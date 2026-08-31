(function installSourceFormattingClient(root) {
  if (!root?.document) return;

  function normalizeSpans(result) {
    const source = String(result?.sourceText || "");
    const raw = Array.isArray(result?.formattingSpans) ? result.formattingSpans : [];
    const spans = [];
    const seen = new Set();
    for (const item of raw) {
      const start = Number(item?.start);
      const end = Number(item?.end);
      if (!Number.isInteger(start) || !Number.isInteger(end)) continue;
      if (start < 0 || end <= start || end > source.length) continue;
      if (String(item?.style || "").toLowerCase() !== "italic") continue;
      if (String(item?.text || "") !== source.slice(start, end)) continue;
      const key = `${start}:${end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      spans.push({ start, end });
    }
    return spans.sort((a, b) => a.start - b.start || a.end - b.end);
  }

  function unwrapExisting(container) {
    for (const em of [...container.querySelectorAll("em.source-format-italic")]) {
      em.replaceWith(root.document.createTextNode(em.textContent || ""));
    }
    container.normalize();
  }

  function applyFormatting() {
    let result;
    let container;
    try {
      result = state?.result;
      container = els?.annotatedText || root.document.getElementById("annotatedText");
    } catch {
      return;
    }
    if (!result || !container) return;

    unwrapExisting(container);
    const spans = normalizeSpans(result);
    if (!spans.length) return;

    const walker = root.document.createTreeWalker(
      container,
      root.NodeFilter?.SHOW_TEXT || 4,
    );
    const nodes = [];
    let offset = 0;
    let node;
    while ((node = walker.nextNode())) {
      const length = String(node.nodeValue || "").length;
      nodes.push({ node, start: offset, end: offset + length });
      offset += length;
    }

    for (const entry of nodes) {
      if (!entry.node.parentNode || entry.end <= entry.start) continue;
      const overlaps = spans
        .filter((span) => span.start < entry.end && span.end > entry.start)
        .map((span) => ({
          start: Math.max(0, span.start - entry.start),
          end: Math.min(entry.end - entry.start, span.end - entry.start),
        }))
        .filter((span) => span.end > span.start)
        .sort((a, b) => a.start - b.start || a.end - b.end);
      if (!overlaps.length) continue;

      const merged = [];
      for (const current of overlaps) {
        const previous = merged[merged.length - 1];
        if (previous && current.start <= previous.end) previous.end = Math.max(previous.end, current.end);
        else merged.push({ ...current });
      }

      const text = String(entry.node.nodeValue || "");
      const fragment = root.document.createDocumentFragment();
      let cursor = 0;
      for (const span of merged) {
        if (span.start > cursor) fragment.appendChild(root.document.createTextNode(text.slice(cursor, span.start)));
        const em = root.document.createElement("em");
        em.className = "source-format-italic";
        em.textContent = text.slice(span.start, span.end);
        fragment.appendChild(em);
        cursor = span.end;
      }
      if (cursor < text.length) fragment.appendChild(root.document.createTextNode(text.slice(cursor)));
      entry.node.replaceWith(fragment);
    }
  }

  function patchRenderer() {
    let current;
    try { current = renderAnnotatedText; } catch { return false; }
    if (typeof current !== "function") return false;
    if (current.__sourceFormattingAware) return true;
    if (!current.__overlapAware) return false;

    const previous = current;
    renderAnnotatedText = function sourceFormattingAwareRenderAnnotatedText(...args) {
      const value = previous.apply(this, args);
      applyFormatting();
      return value;
    };
    renderAnnotatedText.__overlapAware = true;
    renderAnnotatedText.__sourceFormattingAware = true;
    try {
      if (state?.result) renderAnnotatedText();
    } catch {}
    return true;
  }

  function install() {
    let attempts = 0;
    const tryPatch = () => {
      if (patchRenderer()) return;
      attempts += 1;
      if (attempts < 40) root.setTimeout(tryPatch, 50);
    };
    tryPatch();
  }

  root.SOURCE_FORMATTING = { applyFormatting, normalizeSpans };
  if (root.document.readyState === "complete") install();
  else root.addEventListener("load", install, { once: true });
}(typeof globalThis !== "undefined" ? globalThis : this));

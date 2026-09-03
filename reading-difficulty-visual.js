(function installReadingDifficultyVisual(root) {
  if (!root?.document || root.__readingDifficultyVisualInstalled) return;
  root.__readingDifficultyVisualInstalled = true;

  function readingSpans() {
    try {
      const source = String(state?.result?.sourceText || "");
      return (state?.result?.annotations || [])
        .filter((item) => item?.type === "reading")
        .map((item) => ({ start: Number(item.start), end: Number(item.end) }))
        .filter((span) => Number.isInteger(span.start) && Number.isInteger(span.end)
          && span.start >= 0 && span.end > span.start && span.end <= source.length);
    } catch {
      return [];
    }
  }

  function applyReadingRanges() {
    let container;
    try { container = els?.annotatedText || root.document.getElementById("annotatedText"); } catch { return; }
    if (!container) return;

    const spans = readingSpans();
    if (!spans.length) return;

    const walker = root.document.createTreeWalker(container, root.NodeFilter?.SHOW_TEXT || 4);
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

      const value = String(entry.node.nodeValue || "");
      const fragment = root.document.createDocumentFragment();
      let cursor = 0;
      for (const span of merged) {
        if (span.start > cursor) fragment.appendChild(root.document.createTextNode(value.slice(cursor, span.start)));
        const mark = root.document.createElement("span");
        mark.className = "reading-difficulty-range";
        mark.textContent = value.slice(span.start, span.end);
        fragment.appendChild(mark);
        cursor = span.end;
      }
      if (cursor < value.length) fragment.appendChild(root.document.createTextNode(value.slice(cursor)));
      entry.node.replaceWith(fragment);
    }
  }

  function installStyles() {
    if (root.document.getElementById("readingDifficultyVisualStyles")) return;
    const style = root.document.createElement("style");
    style.id = "readingDifficultyVisualStyles";
    style.textContent = `
      .reading-difficulty-range{
        box-shadow:inset 0 -.34em 0 rgba(78,169,219,.32);
        border-bottom:2px solid rgba(42,112,150,.7);
      }
    `;
    root.document.head.appendChild(style);
  }

  function patchRenderer() {
    let current;
    try { current = renderAnnotatedText; } catch { return false; }
    if (typeof current !== "function") return false;
    if (current.__readingDifficultyVisualAware) return true;
    const previous = current;
    renderAnnotatedText = function readingDifficultyVisualRender(...args) {
      const result = previous.apply(this, args);
      applyReadingRanges();
      return result;
    };
    renderAnnotatedText.__overlapAware = current.__overlapAware;
    renderAnnotatedText.__sourceFormattingAware = current.__sourceFormattingAware;
    renderAnnotatedText.__readingDifficultyVisualAware = true;
    try { if (state?.result) renderAnnotatedText(); } catch {}
    return true;
  }

  function install(attempt = 0) {
    installStyles();
    if (patchRenderer()) return;
    if (attempt < 80) root.setTimeout(() => install(attempt + 1), 50);
  }

  install();
}(typeof globalThis !== "undefined" ? globalThis : this));

(function initOverlapPopupPolish(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root?.document) api.install(root);
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const HIGHLIGHT_TYPES = new Set(["word", "term", "collocation", "formula", "idiom", "construction"]);

  function renderedLength(node) {
    if (!node) return 0;
    if (node.nodeType === 3) return String(node.nodeValue || "").length;
    if (String(node.nodeName || "").toUpperCase() === "BR") return 1;
    return [...(node.childNodes || [])].reduce((sum, child) => sum + renderedLength(child), 0);
  }

  function offsetWithin(rootNode, target) {
    if (!rootNode || !target) return null;
    if (rootNode === target) return 0;
    let offset = 0;
    for (const child of rootNode.childNodes || []) {
      if (child === target) return offset;
      if (child.nodeType === 1 && child.contains?.(target)) {
        const nested = offsetWithin(child, target);
        return nested == null ? null : offset + nested;
      }
      offset += renderedLength(child);
    }
    return null;
  }

  function rangeWithin(rootNode, target) {
    const start = offsetWithin(rootNode, target);
    if (start == null) return null;
    return { start, end: start + renderedLength(target) };
  }

  function isValidRange(item, sourceLength) {
    return Number.isInteger(item?.start)
      && Number.isInteger(item?.end)
      && item.start >= 0
      && item.end > item.start
      && item.end <= sourceLength;
  }

  function findCoveringNuances(connotations, start, end, sourceLength) {
    return (Array.isArray(connotations) ? connotations : []).filter((item) => (
      isValidRange(item, sourceLength)
      && item.start <= start
      && item.end >= end
    ));
  }

  function matchingAnnotationRanges(sourceText, item) {
    const source = String(sourceText || "");
    const needle = String(item?.text || "");
    if (!needle || !HIGHLIGHT_TYPES.has(String(item?.type || ""))) return [];

    const ranges = [];
    const seen = new Set();
    const add = (start, end) => {
      if (!Number.isInteger(start) || !Number.isInteger(end)) return;
      if (start < 0 || end <= start || end > source.length) return;
      const actual = source.slice(start, end);
      if (actual !== needle && actual.toLowerCase() !== needle.toLowerCase()) return;
      const key = `${start}:${end}`;
      if (seen.has(key)) return;
      seen.add(key);
      ranges.push({ start, end, item });
    };

    add(item?.start, item?.end);

    const lowerSource = source.toLowerCase();
    const lowerNeedle = needle.toLowerCase();
    let cursor = 0;
    while (cursor <= lowerSource.length - lowerNeedle.length) {
      const found = lowerSource.indexOf(lowerNeedle, cursor);
      if (found < 0) break;
      add(found, found + needle.length);
      cursor = found + Math.max(1, needle.length);
    }
    return ranges;
  }

  function findCoveringAnnotation(annotations, start, end, sourceText) {
    const candidates = [];
    for (const item of Array.isArray(annotations) ? annotations : []) {
      for (const range of matchingAnnotationRanges(sourceText, item)) {
        if (range.start <= start && range.end >= end) candidates.push(range);
      }
    }
    candidates.sort((left, right) => (
      (left.end - left.start) - (right.end - right.start)
      || Math.abs(left.start - start) - Math.abs(right.start - start)
    ));
    return candidates[0] || null;
  }

  function repairNuanceOverlapVisuals(root, container) {
    let result;
    try { result = state?.result; } catch { return; }
    if (!result || !container) return;
    const source = String(result.sourceText || "");

    for (const target of container.querySelectorAll(".nuance-only")) {
      const range = rangeWithin(container, target);
      if (!range) continue;
      const annotationSpan = findCoveringAnnotation(result.annotations, range.start, range.end, source);
      if (!annotationSpan) continue;

      target.classList.remove("nuance-only");
      target.classList.add("hl", `hl-${annotationSpan.item.type}`, "nuance-overlap");
      if (annotationSpan.item.id) target.dataset.overlapAnnotationId = String(annotationSpan.item.id);
    }
  }

  function patchRenderer(root, container) {
    let current;
    try { current = renderAnnotatedText; } catch { return false; }
    if (typeof current !== "function") return false;
    if (current.__overlapPopupPolishAware) return true;

    const previous = current;
    renderAnnotatedText = function overlapPopupVisualRender(...args) {
      const value = previous.apply(this, args);
      repairNuanceOverlapVisuals(root, container);
      return value;
    };
    renderAnnotatedText.__overlapAware = previous.__overlapAware;
    renderAnnotatedText.__sourceFormattingAware = previous.__sourceFormattingAware;
    renderAnnotatedText.__readingDifficultyVisualAware = previous.__readingDifficultyVisualAware;
    renderAnnotatedText.__overlapPopupPolishAware = true;
    try { if (state?.result) renderAnnotatedText(); } catch {}
    return true;
  }

  function install(root) {
    const container = root.document.getElementById("annotatedText");
    if (!container || container.dataset.overlapPopupPolish === "true") return;
    container.dataset.overlapPopupPolish = "true";

    patchRenderer(root, container);
    repairNuanceOverlapVisuals(root, container);

    container.addEventListener("click", (event) => {
      const target = event.target?.closest?.(".nuance-overlap");
      if (!target || !container.contains(target)) return;

      let result;
      try {
        result = state?.result;
        if (!result) return;
      } catch {
        return;
      }

      const range = rangeWithin(container, target);
      if (!range) return;
      const source = String(result.sourceText || "");
      let annotationSpan = null;
      const preferredId = target.dataset.overlapAnnotationId;
      if (preferredId) {
        const preferred = (result.annotations || []).find((item) => String(item?.id || "") === preferredId);
        if (preferred) {
          annotationSpan = matchingAnnotationRanges(source, preferred).find((span) => (
            span.start <= range.start && span.end >= range.end
          )) || null;
        }
      }
      if (!annotationSpan) {
        annotationSpan = findCoveringAnnotation(result.annotations, range.start, range.end, source);
      }
      const nuances = findCoveringNuances(
        result.connotations,
        range.start,
        range.end,
        source.length,
      );
      if (!annotationSpan || !nuances.length) return;

      // The visible span represents both an ordinary annotation and one or more nuances.
      // Always open the ordinary annotation popup, then inject the exact overlapping nuance(s),
      // so the category background and the nuance underline lead to the same combined explanation.
      event.preventDefault();
      event.stopImmediatePropagation();
      try {
        openPopup(annotationSpan.item.id);
        els.popupNuances.replaceChildren(renderNuanceBlock(nuances));
      } catch {
        // If the legacy popup internals are unavailable, leave the original behavior untouched.
      }
    }, true);
  }

  return {
    findCoveringAnnotation,
    findCoveringNuances,
    install,
    isValidRange,
    matchingAnnotationRanges,
    rangeWithin,
    renderedLength,
  };
}));

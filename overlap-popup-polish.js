(function initOverlapPopupPolish(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root?.document) api.install(root);
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
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

  function rangeWithin(container, target) {
    const start = offsetWithin(container, target);
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

  function install(root) {
    const container = root.document.getElementById("annotatedText");
    if (!container || container.dataset.overlapPopupPolish === "true") return;
    container.dataset.overlapPopupPolish = "true";

    container.addEventListener("click", (event) => {
      const target = event.target?.closest?.(".nuance-overlap");
      if (!target || !container.contains(target)) return;

      let result;
      let annotationSpans;
      try {
        result = state?.result;
        if (!result) return;
        annotationSpans = buildHighlightSpans(result.sourceText, result.annotations || []);
      } catch {
        return;
      }

      const range = rangeWithin(container, target);
      if (!range) return;
      const annotationSpan = annotationSpans.find((span) => (
        span.start <= range.start && span.end >= range.end
      ));
      const nuances = findCoveringNuances(
        result.connotations,
        range.start,
        range.end,
        String(result.sourceText || "").length,
      );
      if (!annotationSpan || !nuances.length) return;

      // The core renderer knows there is a nuance here (it drew the underline), but its
      // annotation-to-nuance assignment can miss when the annotation was located by text
      // fallback rather than exact offsets. Open the annotation popup and inject the exact
      // visually overlapping nuance(s), so the underline always has visible content.
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
    findCoveringNuances,
    install,
    isValidRange,
    rangeWithin,
    renderedLength,
  };
}));

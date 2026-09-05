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

  function overlapLength(leftStart, leftEnd, rightStart, rightEnd) {
    return Math.max(0, Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart));
  }

  function findOverlappingAnnotations(annotations, start, end, sourceText) {
    const candidates = [];
    for (const item of Array.isArray(annotations) ? annotations : []) {
      for (const range of matchingAnnotationRanges(sourceText, item)) {
        const overlap = overlapLength(range.start, range.end, start, end);
        if (overlap > 0) candidates.push({ ...range, overlap });
      }
    }
    return candidates.sort((left, right) => (
      right.overlap - left.overlap
      || (left.end - left.start) - (right.end - right.start)
      || Math.abs(left.start - start) - Math.abs(right.start - start)
    ));
  }

  function findCoveringAnnotation(annotations, start, end, sourceText) {
    return findOverlappingAnnotations(annotations, start, end, sourceText)
      .filter((range) => range.start <= start && range.end >= end)
      .sort((left, right) => (
        (left.end - left.start) - (right.end - right.start)
        || right.overlap - left.overlap
      ))[0] || null;
  }

  function planNuanceVisualSegments(annotations, start, end, sourceText) {
    if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) return [];
    const overlaps = findOverlappingAnnotations(annotations, start, end, sourceText);
    if (!overlaps.length) return [{ start, end, annotation: null }];

    const boundaries = new Set([start, end]);
    for (const range of overlaps) {
      boundaries.add(Math.max(start, range.start));
      boundaries.add(Math.min(end, range.end));
    }
    const ordered = [...boundaries].sort((a, b) => a - b);
    const segments = [];
    for (let index = 0; index < ordered.length - 1; index += 1) {
      const segmentStart = ordered[index];
      const segmentEnd = ordered[index + 1];
      if (segmentEnd <= segmentStart) continue;
      const covering = overlaps
        .filter((range) => range.start <= segmentStart && range.end >= segmentEnd)
        .sort((left, right) => (
          (left.end - left.start) - (right.end - right.start)
          || right.overlap - left.overlap
        ))[0] || null;
      segments.push({ start: segmentStart, end: segmentEnd, annotation: covering?.item || null });
    }
    return segments;
  }

  function resetHighlightClasses(node) {
    for (const className of [...node.classList]) {
      if (className === "hl" || className.startsWith("hl-")) node.classList.remove(className);
    }
    node.classList.remove("nuance-overlap", "nuance-only");
    delete node.dataset.overlapAnnotationId;
  }

  function installKeyboardActivation(root, node) {
    node.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      node.click();
    });
  }

  function repairNuanceOverlapVisuals(root, container) {
    let result;
    try { result = state?.result; } catch { return; }
    if (!result || !container) return;
    const source = String(result.sourceText || "");

    for (const target of [...container.querySelectorAll(".nuance-only")]) {
      const range = rangeWithin(container, target);
      if (!range) continue;
      const plan = planNuanceVisualSegments(result.annotations, range.start, range.end, source);
      if (!plan.some((segment) => segment.annotation)) continue;

      if (plan.length === 1 && plan[0].annotation) {
        const annotation = plan[0].annotation;
        target.classList.remove("nuance-only");
        target.classList.add("hl", `hl-${annotation.type}`, "nuance-overlap");
        if (annotation.id) target.dataset.overlapAnnotationId = String(annotation.id);
        continue;
      }

      const fragment = root.document.createDocumentFragment();
      for (const segment of plan) {
        const piece = target.cloneNode(false);
        piece.textContent = source.slice(segment.start, segment.end);
        resetHighlightClasses(piece);

        if (segment.annotation) {
          piece.classList.add("hl", `hl-${segment.annotation.type}`, "nuance-overlap");
          if (segment.annotation.id) piece.dataset.overlapAnnotationId = String(segment.annotation.id);
        } else {
          piece.classList.add("nuance-only");
          const nuances = findCoveringNuances(
            result.connotations,
            segment.start,
            segment.end,
            source.length,
          );
          const nuanceId = nuances[0]?.id;
          if (nuanceId) {
            piece.addEventListener("click", (event) => {
              event.preventDefault();
              event.stopPropagation();
              try { openConnotationPopup(nuanceId); } catch {}
            });
          }
        }
        installKeyboardActivation(root, piece);
        fragment.appendChild(piece);
      }
      target.replaceWith(fragment);
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

  function combinedPopupForTarget(root, container, target, event) {
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

    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      openPopup(annotationSpan.item.id);
      els.popupNuances.replaceChildren(renderNuanceBlock(nuances));
    } catch {
      // If the legacy popup internals are unavailable, leave the original behavior untouched.
    }
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
      combinedPopupForTarget(root, container, target, event);
    }, true);

    container.addEventListener("keydown", (event) => {
      const target = event.target?.closest?.(".nuance-overlap");
      if (!target || !container.contains(target)) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      target.click();
    }, true);
  }

  return {
    findCoveringAnnotation,
    findCoveringNuances,
    findOverlappingAnnotations,
    install,
    isValidRange,
    matchingAnnotationRanges,
    planNuanceVisualSegments,
    rangeWithin,
    renderedLength,
  };
}));

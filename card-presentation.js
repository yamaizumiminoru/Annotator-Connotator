(function attachCardPresentation(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.CARD_PRESENTATION = api;
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const annotationTypes = new Set([
    "word",
    "collocation",
    "formula",
    "construction",
    "idiom",
    "term",
    "added",
  ]);
  const legacyTypeMap = {
    vocab: "word",
    phrase: "collocation",
    grammar: "construction",
  };

  function normalizeAnnotationType(value) {
    const type = String(value || "").toLowerCase();
    if (annotationTypes.has(type)) return type;
    return legacyTypeMap[type] || "word";
  }

  function normalizeCoreRanges(text, ranges) {
    const source = String(text || "");
    const accepted = [];
    for (const range of Array.isArray(ranges) ? ranges : []) {
      const start = Number(range?.start);
      const end = Number(range?.end);
      if (!Number.isInteger(start) || !Number.isInteger(end)) continue;
      if (start < 0 || end <= start || end > source.length) continue;
      if (accepted.some((item) => start < item.end && end > item.start)) continue;
      accepted.push({ start, end });
    }
    return accepted.sort((a, b) => a.start - b.start || a.end - b.end);
  }

  function resolveCoreRanges(text, pattern, ranges) {
    const source = String(text || "");
    const fragments = String(pattern || "")
      .split(/\b[A-Z]\b/g)
      .map((fragment) => fragment
        .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
        .trim())
      .filter((fragment) => fragment.length >= 3);
    const derived = [];
    let cursor = 0;
    for (const fragment of fragments) {
      const start = source.toLocaleLowerCase().indexOf(fragment.toLocaleLowerCase(), cursor);
      if (start < 0) continue;
      derived.push({ start, end: start + fragment.length });
      cursor = start + fragment.length;
    }
    return derived.length ? normalizeCoreRanges(source, derived) : normalizeCoreRanges(source, ranges);
  }

  function quoteGloss(value, uiLanguage) {
    const gloss = String(value || "").trim();
    if (!gloss) return "";
    if (uiLanguage === "ja") {
      return gloss.startsWith("「") && gloss.endsWith("」") ? gloss : `「${gloss}」`;
    }
    return gloss.startsWith("“") && gloss.endsWith("”") ? gloss : `“${gloss}”`;
  }

  function shouldShowQualification(value, comparisonValues = []) {
    const normalized = comparable(value);
    if (!normalized) return false;
    return !comparisonValues.some((item) => comparable(item) === normalized);
  }

  function meaningfulAlternatives(alternatives, comparisonValues = []) {
    const seen = new Set(comparisonValues.map(comparable).filter(Boolean));
    return (Array.isArray(alternatives) ? alternatives : []).filter((alternative) => {
      const normalized = comparable(alternative);
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
  }

  function comparable(value) {
    return String(value || "")
      .toLocaleLowerCase()
      .replace(/[\s\p{P}\p{S}]+/gu, "");
  }

  return {
    meaningfulAlternatives,
    normalizeAnnotationType,
    normalizeCoreRanges,
    quoteGloss,
    resolveCoreRanges,
    shouldShowQualification,
  };
}));
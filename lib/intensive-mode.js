(function initIntensiveModeCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.INTENSIVE_MODE_CORE = api;
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const STANDARD_MODE = "standard";
  const INTENSIVE_MODE = "intensive";
  const COMPREHENSIVE_DENSITY = 4;
  const INTENSIVE_MAX_SOURCE_LENGTH = 1200;
  const INTENSIVE_MIN_CANDIDATES = 16;
  const INTENSIVE_MAX_CANDIDATES = 48;

  function normalizeMode(value) {
    return value === INTENSIVE_MODE ? INTENSIVE_MODE : STANDARD_MODE;
  }

  function isIntensive(value) {
    return normalizeMode(value) === INTENSIVE_MODE;
  }

  function isComprehensiveDensity(value) {
    return Number(value) >= COMPREHENSIVE_DENSITY;
  }

  function modeForDensity(value) {
    return isComprehensiveDensity(value) ? INTENSIVE_MODE : STANDARD_MODE;
  }

  function estimatedUnits(sourceText) {
    const text = String(sourceText || "");
    const compactCharacters = text.replace(/\s/gu, "").length;
    const whitespaceTokens = (text.trim().match(/\S+/gu) || []).length;
    return Math.max(whitespaceTokens, Math.ceil(compactCharacters / 4));
  }

  function intensiveCandidateMaximum(sourceText) {
    const units = estimatedUnits(sourceText);
    return clamp(
      Math.ceil(units / 7) + 10,
      INTENSIVE_MIN_CANDIDATES,
      INTENSIVE_MAX_CANDIDATES,
    );
  }

  function isTooLong(sourceText) {
    return String(sourceText || "").length > INTENSIVE_MAX_SOURCE_LENGTH;
  }

  function augmentAnnotationPrompt(prompt, options = {}) {
    const hardMaximum = Math.max(
      INTENSIVE_MIN_CANDIDATES,
      Number(options.hardMaximum) || INTENSIVE_MAX_CANDIDATES,
    );
    return [
      String(prompt || ""),
      "",
      "Comprehensive annotation mode (short passages only):",
      "- Treat this as teacher-facing material preparation, not a sparse reading aid.",
      "- Scan the entire passage closely and return every ordinary annotation that has at least moderate teaching value for the selected learner band(s), up to the hard safety cap.",
      "- Be deliberately denser than normal mode. Include useful vocabulary, technical terms, collocations, formulaic expressions, idioms, discourse markers, reusable constructions, and grammar-bearing multiword spans when they can support an actual explanation.",
      "- Include common-looking wording when its combination, construction, lexical choice, register, or contextual use gives a teacher something concrete to explain. Do not require an item to be unusually difficult or rare.",
      "- Keep each annotation focused and explanations compact so that broad coverage does not create bloated cards.",
      "- Ordinary annotations MAY overlap in this mode when the overlapping spans represent genuinely different teachable units. This explicitly overrides any earlier no-overlap instruction.",
      "- If a smaller expression and a larger phrase or construction each support a distinct explanation, return both. Avoid redundant near-duplicates that would produce essentially the same card.",
      "- Do not pad with punctuation, exact repetitions, or items whose explanation would only restate an obvious gloss.",
      "- Keep connotation discovery precision-first; comprehensive mode increases ordinary annotation coverage, not speculative pragmatic interpretations.",
      `- Comprehensive-mode hard safety cap: ${hardMaximum} ordinary candidates. This is a cap, not a quota.`,
    ].join("\n");
  }

  function rewriteOptionalNotePrompt(prompt) {
    let text = String(prompt || "");
    text = text
      .replace(
        /\"noteJa\": \"why it matters or how to use it\"/g,
        '\"noteJa\": \"optional supplementary explanation or an empty string\"',
      )
      .replace(
        /\"noteJa\":\"learning benefit\"/g,
        '\"noteJa\":\"optional supplementary explanation or empty string\"',
      )
      .replace(
        /Keep meaningJa to a short independent gloss\. Keep noteJa compact and reference-like\.[^\n]*/g,
        "Keep meaningJa to a short independent gloss. noteJa is optional and may be an empty string. When present, keep it compact and reference-like; in Japanese, use concise plain style rather than desu/masu style.",
      )
      .replace(
        /Each annotation must offer a concrete learning benefit at the selected target level\. If noteJa cannot explain that benefit without stating an elementary dictionary fact, omit the annotation\./g,
        "Each annotation must offer a concrete learning benefit, but that benefit may already be clear from meaningJa, pattern, or a domain definition; noteJa does not have to be filled.",
      );

    if (!text.includes("Optional noteJa policy:")) {
      text += [
        "",
        "Optional noteJa policy:",
        "- noteJa is optional. Use an empty string when an extra sentence would merely paraphrase meaningJa or add a vacuous label such as 'an expression meaning ...' or 'a compound expression referring to ...'.",
        "- Keep noteJa when it performs a different job from the gloss: for example, defining a technical term, identifying a typical domain or register, explaining the contextual role or sense, describing a reusable construction or collocation, warning about a likely misunderstanding, or adding a pragmatic implication.",
        "- Do not require noteJa to contain surprising or exceptional information. A concise dictionary-style definition or usage note is useful when it complements rather than repeats meaningJa.",
      ].join("\n");
    }
    return text;
  }

  function repairAnnotationOffsetsAllowOverlap(sourceText, annotations) {
    const source = String(sourceText || "");
    if (!Array.isArray(annotations)) return [];
    return annotations.map((item) => {
      const annotationText = String(item?.text || "");
      if (!annotationText) return null;
      const candidates = [];
      if (Number.isInteger(item.start) && Number.isInteger(item.end)) {
        candidates.push([item.start, item.end]);
      }
      let index = source.indexOf(annotationText);
      while (index >= 0) {
        candidates.push([index, index + annotationText.length]);
        index = source.indexOf(annotationText, index + 1);
      }
      const valid = candidates.filter(([start, end]) => (
        start >= 0
        && end > start
        && end <= source.length
        && source.slice(start, end) === annotationText
      ));
      if (!valid.length) return null;
      const preferred = Number.isInteger(item.start)
        ? valid.sort((a, b) => Math.abs(a[0] - item.start) - Math.abs(b[0] - item.start))[0]
        : valid[0];
      return { ...item, start: preferred[0], end: preferred[1] };
    }).filter(Boolean);
  }

  function mergeUniqueOverlappingAnnotations(existing, additions) {
    const combined = [...(existing || []), ...(additions || [])]
      .filter((item) => (
        item
        && String(item.text || "").trim()
        && Number.isInteger(item.start)
        && Number.isInteger(item.end)
        && item.start >= 0
        && item.end > item.start
      ))
      .map((item, index) => ({ ...item, _order: index }));

    combined.sort((a, b) => (
      normalizePriority(b.priority) - normalizePriority(a.priority)
      || reliabilityScore(b.reliability) - reliabilityScore(a.reliability)
      || a._order - b._order
    ));

    const seen = new Set();
    const accepted = [];
    for (const item of combined) {
      const key = `${item.start}:${item.end}:${String(item.text).trim().toLocaleLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const { _order, ...clean } = item;
      accepted.push(clean);
    }
    return accepted.sort((a, b) => a.start - b.start || a.end - b.end);
  }

  function flattenRegionalAnnotationsAllowOverlap(sourceText, scanRegions, modelRegions) {
    const source = String(sourceText || "");
    const supplied = Array.isArray(modelRegions) ? modelRegions : [];
    const byIndex = new Map();
    for (const item of supplied) {
      const index = Number(item?.regionIndex);
      if (Number.isInteger(index) && index >= 1 && !byIndex.has(index)) byIndex.set(index, item);
    }

    const shifted = [];
    const regionTelemetry = [];
    let rawCandidateCount = 0;
    for (const region of scanRegions || []) {
      const returned = byIndex.get(region.index + 1);
      const raw = Array.isArray(returned?.annotations) ? returned.annotations : [];
      rawCandidateCount += raw.length;
      const repaired = repairAnnotationOffsetsAllowOverlap(region.text, raw);
      shifted.push(...repaired.map((item) => ({
        ...item,
        start: item.start + region.start,
        end: item.end + region.start,
      })));
      regionTelemetry.push({
        regionIndex: region.index + 1,
        start: region.start,
        end: region.end,
        rawCandidateCount: raw.length,
        repairedCandidateCount: repaired.length,
        returned: Boolean(returned),
      });
    }

    const annotations = mergeUniqueOverlappingAnnotations([], shifted)
      .filter((item) => item.end <= source.length);
    for (const region of regionTelemetry) {
      region.candidateCount = annotations.filter((item) => (
        item.start >= region.start && item.start < region.end
      )).length;
    }

    return {
      annotations,
      telemetry: {
        mode: "regional-comprehensive-overlap",
        rawCandidateCount,
        candidateCount: annotations.length,
        droppedCandidateCount: rawCandidateCount - annotations.length,
        regions: regionTelemetry,
      },
    };
  }

  function normalizePriority(value) {
    const priority = Math.round(Number(value));
    return Number.isFinite(priority) ? clamp(priority, 1, 5) : 3;
  }

  function reliabilityScore(value) {
    return { high: 3, medium: 2, low: 1 }[String(value || "medium").toLowerCase()] || 2;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  return {
    COMPREHENSIVE_DENSITY,
    INTENSIVE_MAX_CANDIDATES,
    INTENSIVE_MAX_SOURCE_LENGTH,
    INTENSIVE_MIN_CANDIDATES,
    INTENSIVE_MODE,
    STANDARD_MODE,
    augmentAnnotationPrompt,
    estimatedUnits,
    flattenRegionalAnnotationsAllowOverlap,
    intensiveCandidateMaximum,
    isComprehensiveDensity,
    isIntensive,
    isTooLong,
    mergeUniqueOverlappingAnnotations,
    modeForDensity,
    normalizeMode,
    repairAnnotationOffsetsAllowOverlap,
    rewriteOptionalNotePrompt,
  };
}));
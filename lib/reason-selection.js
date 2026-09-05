(function initReasonSelection(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.REASON_SELECTION = api;
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const LEVELS = ["beginner", "intermediate", "advanced"];
  const LEVEL_RANK = { beginner: 1, intermediate: 2, advanced: 3 };
  const VALUE_RANK = { low: 1, medium: 2, high: 3 };
  const REASON_LABELS = {
    hardWord: "難語",
    idiomatic: "慣用表現",
    term: "術語",
    construction: "構文",
  };

  const VALID_MEANING_TYPES = new Set([
    "literal_lexical",
    "idiom",
    "phrasal_verb",
    "metaphorical_or_extended_sense",
    "reusable_construction",
    "discourse_marker",
    "domain_term",
    "compositional_phrase",
    "other",
  ]);
  const IDIOMATIC_TYPES = new Set([
    "idiom",
    "phrasal_verb",
    "metaphorical_or_extended_sense",
  ]);

  function normalizeSelectedLevels(value, fallback = ["intermediate"]) {
    const source = Array.isArray(value) ? value : [value];
    const levels = LEVELS.filter((level) => source.includes(level));
    return levels.length ? levels : normalizeSelectedLevels(fallback, ["intermediate"]);
  }

  function normalizeBand(value, fallback = "intermediate") {
    return LEVELS.includes(value) ? value : fallback;
  }

  function normalizeValue(value, fallback = "low") {
    const normalized = String(value || "").toLowerCase();
    return Object.hasOwn(VALUE_RANK, normalized) ? normalized : fallback;
  }

  function normalizeConfidence(value, fallback = "medium") {
    const normalized = String(value || "").toLowerCase();
    return new Set(["high", "medium", "low"]).has(normalized) ? normalized : fallback;
  }

  function inferPrimaryLearnerBand(meta, normalizedValues = null) {
    if (LEVELS.includes(meta?.primaryLearnerBand)) return meta.primaryLearnerBand;
    const values = normalizedValues || {
      beginner: normalizeValue(meta?.annotationValueByBand?.beginner),
      intermediate: normalizeValue(meta?.annotationValueByBand?.intermediate),
      advanced: normalizeValue(meta?.annotationValueByBand?.advanced),
    };
    const bestRank = Math.max(...LEVELS.map((level) => VALUE_RANK[values[level]]));
    const tied = LEVELS.filter((level) => VALUE_RANK[values[level]] === bestRank);
    const contextual = LEVELS.includes(meta?.contextualMeaningBand) ? meta.contextualMeaningBand : null;
    if (contextual && tied.includes(contextual)) return contextual;
    const lexical = LEVELS.includes(meta?.componentLexicalBand) ? meta.componentLexicalBand : null;
    if (lexical && tied.includes(lexical)) return lexical;
    if (tied.includes("intermediate")) return "intermediate";
    return tied[0] || "intermediate";
  }

  function normalizeJudgeMeta(meta) {
    if (!meta || typeof meta !== "object") return null;
    const values = meta.annotationValueByBand && typeof meta.annotationValueByBand === "object"
      ? meta.annotationValueByBand
      : {};
    const annotationValueByBand = {
      beginner: normalizeValue(values.beginner),
      intermediate: normalizeValue(values.intermediate),
      advanced: normalizeValue(values.advanced),
    };
    return {
      primaryLearnerBand: inferPrimaryLearnerBand(meta, annotationValueByBand),
      componentLexicalBand: normalizeBand(meta.componentLexicalBand),
      lexicalTriggerWords: Array.isArray(meta.lexicalTriggerWords)
        ? meta.lexicalTriggerWords.map((item) => String(item || "").trim()).filter(Boolean)
        : [],
      contextualMeaningBand: normalizeBand(meta.contextualMeaningBand),
      domainTerm: meta.domainTerm === true,
      domainTermConfidence: normalizeConfidence(meta.domainTermConfidence),
      annotationValueByBand,
      meaningType: VALID_MEANING_TYPES.has(meta.meaningType) ? meta.meaningType : "other",
      confidence: normalizeConfidence(meta.confidence),
      reason: String(meta.reason || "").trim(),
    };
  }

  function bestAnnotationValue(meta, levels) {
    const normalized = normalizeJudgeMeta(meta);
    if (!normalized) return "low";
    const selected = normalizeSelectedLevels(levels);
    return selected.reduce((best, level) => (
      VALUE_RANK[normalized.annotationValueByBand[level]] > VALUE_RANK[best]
        ? normalized.annotationValueByBand[level]
        : best
    ), "low");
  }

  function primaryAnnotationValue(meta) {
    const normalized = normalizeJudgeMeta(meta);
    if (!normalized) return "low";
    return normalized.annotationValueByBand[normalized.primaryLearnerBand] || "low";
  }

  function reasonProfile(candidate, levels) {
    const meta = normalizeJudgeMeta(candidate?.judgeMeta);
    if (!meta) return { tags: [], codes: [], strong: false, bestValue: "low", primaryLearnerBand: "intermediate" };

    const tags = [];
    const codes = [];
    const learnerFloor = LEVEL_RANK[meta.primaryLearnerBand];
    const lexicalRank = LEVEL_RANK[meta.componentLexicalBand];
    const contextualRank = LEVEL_RANK[meta.contextualMeaningBand];
    const type = String(candidate?.type || "");
    const meaningType = meta.meaningType;
    const bestValue = primaryAnnotationValue(meta);
    const valueRank = VALUE_RANK[bestValue];

    const lexicalCandidate = new Set(["word", "term", "collocation", "formula"]).has(type)
      && meaningType !== "discourse_marker"
      && !IDIOMATIC_TYPES.has(meaningType)
      && meaningType !== "reusable_construction";
    if (lexicalCandidate && lexicalRank >= learnerFloor) {
      tags.push(REASON_LABELS.hardWord);
      codes.push("hard-word");
    }

    const idiomatic = IDIOMATIC_TYPES.has(meaningType)
      || type === "idiom"
      || (
        new Set(["collocation", "formula"]).has(type)
        && meaningType !== "discourse_marker"
        && meaningType !== "compositional_phrase"
        && contextualRank >= learnerFloor
      );
    if (idiomatic) {
      tags.push(REASON_LABELS.idiomatic);
      codes.push("idiomatic-sense");
    }

    if (meta.domainTerm && meta.domainTermConfidence !== "low") {
      tags.push(REASON_LABELS.term);
      codes.push("technical-term");
    }

    if (meaningType === "reusable_construction" || type === "construction") {
      tags.push(REASON_LABELS.construction);
      codes.push("reusable-construction");
    }

    const uniqueTags = [...new Set(tags)];
    const uniqueCodes = [...new Set(codes)];
    const strong = uniqueCodes.length > 0 && valueRank >= VALUE_RANK.medium;
    return {
      tags: uniqueTags,
      codes: uniqueCodes,
      strong,
      bestValue,
      primaryLearnerBand: meta.primaryLearnerBand,
    };
  }

  function visibleReasonTags(candidate, tags) {
    const type = String(candidate?.type || "");
    const redundant = new Set({
      construction: [REASON_LABELS.construction],
      term: [REASON_LABELS.term],
      idiom: [REASON_LABELS.idiomatic],
    }[type] || []);
    return [...new Set(Array.isArray(tags) ? tags : [])].filter((tag) => !redundant.has(tag));
  }

  function fallbackEligible(candidate, density) {
    const priority = Math.max(1, Math.min(5, Math.round(Number(candidate?.priority) || 3)));
    if (Number(density) <= 1) return priority >= 5;
    if (Number(density) >= 3) return priority >= 1;
    return priority >= 3;
  }

  function judgedEligible(candidate, density, levels) {
    const selectedLevels = normalizeSelectedLevels(levels);
    const meta = normalizeJudgeMeta(candidate?.judgeMeta);
    if (!meta || !selectedLevels.includes(meta.primaryLearnerBand)) return false;
    const profile = reasonProfile(candidate, selectedLevels);
    const valueRank = VALUE_RANK[profile.bestValue];
    if (Number(density) <= 1) {
      return valueRank >= VALUE_RANK.high;
    }
    if (isAdvancedRecallCandidate(candidate, density, selectedLevels)) return true;
    if (Number(density) >= 3) {
      return valueRank >= VALUE_RANK.medium || profile.strong;
    }
    return valueRank >= VALUE_RANK.high || (valueRank >= VALUE_RANK.medium && profile.strong);
  }

  function isAdvancedRecallCandidate(candidate, density, levels) {
    if (Number(density) < 2 || !normalizeSelectedLevels(levels).includes("advanced")) return false;
    const meta = normalizeJudgeMeta(candidate?.judgeMeta);
    if (!meta || meta.confidence === "low" || meta.primaryLearnerBand !== "advanced") return false;

    // Keep this eligibility rule in the shared engine: browser redisplay must
    // retain the same lexical/term candidates as the server's first response.
    if (candidate.type === "word") return meta.componentLexicalBand === "advanced";
    if (candidate.type === "term") {
      return (meta.domainTerm && meta.domainTermConfidence !== "low")
        || meta.componentLexicalBand === "advanced"
        || meta.contextualMeaningBand === "advanced";
    }
    // Difficult slot vocabulary does not change a multiword teaching target.
    return false;
  }

  function prepareCandidate(candidate, levels) {
    const profile = reasonProfile(candidate, levels);
    return {
      ...candidate,
      judgeMeta: normalizeJudgeMeta(candidate?.judgeMeta),
      reasonTags: visibleReasonTags(candidate, profile.tags),
      selectionReasonCodes: profile.codes,
    };
  }

  function selectAnnotationsByDensity(candidates, density, levels) {
    const selectedLevels = normalizeSelectedLevels(levels);
    const prepared = (Array.isArray(candidates) ? candidates : []).map((item) => prepareCandidate(item, selectedLevels));
    const selected = prepared.filter((item) => (
      item.judgeMeta
        ? judgedEligible(item, density, selectedLevels)
        : fallbackEligible(item, density)
    ));
    return selected.sort((a, b) => (
      Number(a.start || 0) - Number(b.start || 0)
      || Number(a.end || 0) - Number(b.end || 0)
    ));
  }

  function stripInternalSelectionFields(annotation) {
    const {
      priority,
      reliability,
      _modelOrder,
      ...publicAnnotation
    } = annotation || {};
    return publicAnnotation;
  }

  function priorityFromJudge(meta, fallback = 3) {
    const normalized = normalizeJudgeMeta(meta);
    if (!normalized) return Math.max(1, Math.min(5, Math.round(Number(fallback) || 3)));
    const maxValue = LEVELS.reduce((best, level) => (
      Math.max(best, VALUE_RANK[normalized.annotationValueByBand[level]])
    ), 1);
    if (
      normalized.domainTerm
      || IDIOMATIC_TYPES.has(normalized.meaningType)
      || normalized.meaningType === "reusable_construction"
    ) {
      return maxValue >= VALUE_RANK.medium ? 5 : 4;
    }
    return { 1: 2, 2: 4, 3: 5 }[maxValue] || 3;
  }

  return {
    IDIOMATIC_TYPES,
    LEVELS,
    LEVEL_RANK,
    REASON_LABELS,
    VALUE_RANK,
    bestAnnotationValue,
    inferPrimaryLearnerBand,
    normalizeJudgeMeta,
    normalizeSelectedLevels,
    prepareCandidate,
    primaryAnnotationValue,
    priorityFromJudge,
    reasonProfile,
    selectAnnotationsByDensity,
    stripInternalSelectionFields,
    visibleReasonTags,
  };
}));

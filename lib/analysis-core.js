(function initAnalysisCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ANALYSIS_CORE = api;
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const CACHE_SCHEMA_VERSION = "analysis-v2";
  const LONG_FORM_THRESHOLD = 3_200;
  const MAX_SOURCE_LENGTH = 250_000;

  function mergeUsage(usages) {
    const valid = (Array.isArray(usages) ? usages : []).filter(Boolean);
    if (!valid.length) return null;
    return valid.reduce((totals, usage) => ({
      input_tokens: totals.input_tokens + Number(usage.input_tokens || 0),
      output_tokens: totals.output_tokens + Number(usage.output_tokens || 0),
      total_tokens: totals.total_tokens + Number(usage.total_tokens || 0),
      input_tokens_details: {
        cached_tokens: totals.input_tokens_details.cached_tokens
          + Number(usage.input_tokens_details?.cached_tokens || 0),
      },
      output_tokens_details: {
        reasoning_tokens: totals.output_tokens_details.reasoning_tokens
          + Number(usage.output_tokens_details?.reasoning_tokens || 0),
      },
    }), emptyUsage());
  }

  function emptyUsage() {
    return {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
    };
  }

  function cacheMaterial(input = {}) {
    return {
      version: input.version || CACHE_SCHEMA_VERSION,
      text: String(input.text || ""),
      sourceLanguage: input.sourceLanguage || "auto",
      explanationLanguage: input.explanationLanguage || "ja",
      level: input.level || "intermediate",
      focus: input.focus || "all",
      includeGrammar: input.includeGrammar !== false,
      includeSlash: input.includeSlash !== false,
      analysisMode: input.analysisMode === "precise" ? "precise" : "standard",
      model: String(input.model || ""),
      connotationTargets: Array.isArray(input.connotationTargets) ? input.connotationTargets : [],
    };
  }

  function stableSerialize(value) {
    if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.keys(value).sort().map((key) => (
        `${JSON.stringify(key)}:${stableSerialize(value[key])}`
      )).join(",")}}`;
    }
    return JSON.stringify(value);
  }

  return {
    CACHE_SCHEMA_VERSION,
    LONG_FORM_THRESHOLD,
    MAX_SOURCE_LENGTH,
    cacheMaterial,
    emptyUsage,
    mergeUsage,
    stableSerialize,
  };
}));

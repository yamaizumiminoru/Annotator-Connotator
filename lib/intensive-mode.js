(function initIntensiveModeCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.INTENSIVE_MODE_CORE = api;
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const STANDARD_MODE = "standard";
  const INTENSIVE_MODE = "intensive";
  const INTENSIVE_MAX_SOURCE_LENGTH = 1200;
  const INTENSIVE_MIN_CANDIDATES = 16;
  const INTENSIVE_MAX_CANDIDATES = 48;

  function normalizeMode(value) {
    return value === INTENSIVE_MODE ? INTENSIVE_MODE : STANDARD_MODE;
  }

  function isIntensive(value) {
    return normalizeMode(value) === INTENSIVE_MODE;
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
      "Exhaustive teaching-material coverage mode (short passages only):",
      "- Treat this as teacher-facing preparation: scan closely and surface substantially more teachable material than normal density modes.",
      "- Return every ordinary annotation that has at least moderate teaching value for the selected learner band(s), up to the hard safety cap.",
      "- Include useful vocabulary, technical terms, collocations, formulaic expressions, idioms, discourse markers, reusable constructions, and grammar-bearing multiword spans when they support a concrete explanation.",
      "- Common-looking wording is eligible when its combination, construction, lexical choice, register, contextual interpretation, or discourse function gives a teacher something concrete to explain.",
      "- Overlapping annotation spans are allowed when they represent genuinely different teachable units, for example a phrasal verb inside a larger construction. Do not duplicate the exact same span and analysis.",
      "- Keep meaningJa concise. noteJa is optional and should do a different job from the gloss: explain usage, contextual interpretation, register, collocation, constructional behavior, contrast, or a technical definition. If noteJa would only paraphrase meaningJa or say that the target is an expression/phrase, return an empty string.",
      "- Keep examples and explanations compact so broad coverage does not create bloated cards.",
      "- Do not pad with punctuation, exact repetitions, or material for which neither a useful gloss nor a teachable explanation can be given.",
      "- Keep connotation discovery precision-first; coverage mode increases ordinary annotation coverage, not speculative pragmatic interpretations.",
      `- Coverage-mode hard safety cap: ${hardMaximum} ordinary candidates. This is a cap, not a quota.`,
    ].join("\n");
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  return {
    INTENSIVE_MAX_CANDIDATES,
    INTENSIVE_MAX_SOURCE_LENGTH,
    INTENSIVE_MIN_CANDIDATES,
    INTENSIVE_MODE,
    STANDARD_MODE,
    augmentAnnotationPrompt,
    estimatedUnits,
    intensiveCandidateMaximum,
    isIntensive,
    isTooLong,
    normalizeMode,
  };
}));
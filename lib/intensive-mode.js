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
      "Intensive close-reading mode (short passages only):",
      "- Treat this as teacher-facing close-reading preparation, not a sparse reading aid.",
      "- Scan the entire passage closely and return every ordinary annotation that has at least moderate teaching value for the selected learner band(s), up to the hard safety cap.",
      "- Be deliberately denser than normal mode. Include useful vocabulary, technical terms, collocations, formulaic expressions, idioms, discourse markers, reusable constructions, and grammar-bearing multiword spans when they can support an actual explanation.",
      "- Include common-looking wording when its combination, construction, lexical choice, register, or contextual use gives a teacher something concrete to explain. Do not require an item to be unusually difficult or rare.",
      "- Keep each annotation focused and explanations compact so that broad coverage does not create bloated cards.",
      "- Preserve the no-overlap rule for ordinary annotations so every highlight remains independently clickable in the current UI. Prefer the smallest span that carries the teachable point when two candidates would overlap.",
      "- Do not pad with punctuation, exact repetitions, or items for which the note would merely restate an obvious dictionary gloss.",
      "- Keep connotation discovery precision-first; intensive mode increases ordinary annotation coverage, not speculative pragmatic interpretations.",
      `- Intensive-mode hard safety cap: ${hardMaximum} ordinary candidates. This is a cap, not a quota.`,
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

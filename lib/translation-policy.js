function isTranslationEnabled(input = {}) {
  return input.includeTranslation === true;
}

function normalizeTranslation(value, input = {}) {
  return isTranslationEnabled(input) ? String(value || "") : "";
}

function shouldRepairTranslation(input = {}, needsRepair = () => false) {
  return isTranslationEnabled(input) && Boolean(needsRepair());
}

function translationPromptDirectives(input = {}) {
  const enabled = isTranslationEnabled(input);
  return {
    enabled,
    outputFields: enabled
      ? "summaryJa, translation, meaningJa, and noteJa"
      : "summaryJa, meaningJa, and noteJa",
    chunkAction: enabled ? "Analyze and translate only sourceText." : "Analyze only sourceText.",
    rules: enabled
      ? [
          "- Include a faithful full-passage translation in translation.",
          "- Do not let the full translation replace the individual annotations.",
        ]
      : [
          "Do not generate a translation.",
          'Set "translation" to an empty string.',
        ],
    checkedFields: enabled
      ? "translation, summaryJa, meaningJa, noteJa, and all connotation explanations"
      : "summaryJa, meaningJa, noteJa, and all connotation explanations",
  };
}

module.exports = {
  isTranslationEnabled,
  normalizeTranslation,
  shouldRepairTranslation,
  translationPromptDirectives,
};

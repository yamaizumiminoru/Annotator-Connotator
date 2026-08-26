const VALIDATED_LANGUAGE_NAMES = Object.freeze({
  mn: "Mongolian",
  mi: "Māori",
  ur: "Urdu",
});

function languageNameForCode(value) {
  const code = String(value || "").trim().toLowerCase().split(/[-_]/, 1)[0];
  return VALIDATED_LANGUAGE_NAMES[code] || "";
}

function rewriteExplanationLanguagePrompt(prompt, code) {
  const language = languageNameForCode(code);
  if (!language) return String(prompt || "");

  return String(prompt || "")
    .replace(/Explanation language: Japanese\./g, `Explanation language: ${language}.`)
    .replace(/in natural Japanese\b/g, `in natural ${language}`)
    .replace(/Use only Japanese in explanatory prose\./g, `Use only ${language} in explanatory prose.`)
    .replace(/language other than Japanese\b/g, `language other than ${language}`);
}

function rewriteUiTargetLanguagePrompt(prompt) {
  return String(prompt || "").replace(/Target language: (mn|mi|ur)\./g, (_match, code) => (
    `Target language: ${languageNameForCode(code)}.`
  ));
}

module.exports = {
  VALIDATED_LANGUAGE_NAMES,
  languageNameForCode,
  rewriteExplanationLanguagePrompt,
  rewriteUiTargetLanguagePrompt,
};

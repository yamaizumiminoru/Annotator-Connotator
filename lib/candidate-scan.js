const SELECTION_REASONS = new Set([
  "level_appropriate",
  "domain_term",
  "phraseological",
  "reusable_construction",
]);

function buildCandidateScanPrompt({
  sourceLanguage,
  explanationLanguage,
  level,
  focus,
  includeGrammar = true,
  discoveryTarget,
}) {
  const levelRule = levelSelectionRule(level);
  const target = Math.max(1, Number(discoveryTarget) || 1);
  return [
    "You are the dedicated ordinary-annotation candidate scanner for a language-learning app.",
    "Your only job is to inspect sourceText from beginning to end and identify learner-worthy ordinary annotations.",
    "Return only one valid JSON object. Do not use markdown fences.",
    `Source language: ${sourceLanguage}.`,
    `Explanation language: ${explanationLanguage}.`,
    `Target learner band: ${level}.`,
    `Focus: ${focus}.`,
    `Candidate discovery target: aim for about ${target} candidates only when the text genuinely supports them. Never pad to reach this number.`,
    levelRule,
    includeGrammar
      ? "Reusable grammar and constructions may qualify when they provide concrete learning value."
      : "Do not select grammar-only material unless it is essential to understanding a larger phrase or construction.",
    "",
    "A candidate must qualify through at least one of these four routes:",
    "1. level_appropriate: general-language vocabulary or phrasing that is genuinely difficult enough for the selected learner band.",
    "2. domain_term: a conventional term or named concept in the subject area, even when its component words are individually easy.",
    "3. phraseological: an idiom, phrasal verb, conventional collocation, lexicalized phrase, or context-specific sense whose useful meaning or use is not transparently predictable from the component words alone.",
    "4. reusable_construction: a reusable grammatical, rhetorical, or academic frame with concrete value beyond the current sentence.",
    "",
    "Selection discipline:",
    "- Scan sentence by sentence through the entire sourceText. Do not stop after finding enough early candidates.",
    "- Prefer the smallest span that still exposes the useful expression. For an inflected expression, include enough wording to make the phrase recognizable and put the canonical reusable form in pattern.",
    "- Do not select a phrase merely because it is long, vivid, topical, academic-sounding, or contains abstract nouns.",
    "- Do not rescue an easy compositional phrase by inventing a generic pattern that would fit countless ordinary noun or verb phrases.",
    "- A domain term must be a reasonably established concept or label in the subject, not just any topic-related noun phrase.",
    "- A collocation must show a characteristic lexical preference or conventionalized use, not merely words that happen to co-occur in this sentence.",
    "- Return fewer candidates when the passage has fewer worthwhile targets.",
    "- priority is pedagogical value for the selected learner band, not surface difficulty alone.",
    "",
    "Calibration examples for advanced learners:",
    "- KEEP 'stay with you' when stay with means that a mistake, memory, effect, etc. remains or continues to affect someone; selectionReason=phraseological; pattern may generalize to 'stay with someone'.",
    "- KEEP 'They're at it' when it instantiates the idiomatic expression 'be at it' meaning to be engaged in or keep doing an activity; selectionReason=phraseological; pattern='be at it'.",
    "- KEEP 'brain plasticity' as a domain-specific term even though brain and plasticity may be individually familiar; selectionReason=domain_term.",
    "- KEEP 'rule of thumb' as a conventional idiom; selectionReason=phraseological.",
    "- KEEP 'window of opportunity' as a conventional figurative phrase; selectionReason=phraseological.",
    "- KEEP a frame such as 'It is misleading to think of A as B' when it is reusable for careful academic qualification; selectionReason=reusable_construction.",
    "- OMIT 'on the other hand' for advanced learners when it is only the ordinary contrast marker and no unusually advanced use is present.",
    "- OMIT 'one key factor' when it is just an ordinary compositional noun phrase.",
    "- OMIT 'understanding sarcasm or irony' when it is simply understanding + an object in the current sentence, not an established term or construction.",
    "- OMIT 'during practically every waking moment' when its value is merely the literal composition of familiar words rather than a conventional expression worth learning as a unit.",
    "",
    "Every text value must be an exact contiguous substring of sourceText, and start/end must be JavaScript string offsets for that exact substring.",
    `Write meaningJa and noteJa in natural ${explanationLanguage}. Keep meaningJa short and noteJa compact and reference-like.`,
    "Use type word|collocation|formula|construction|idiom|term.",
    "Use selectionReason level_appropriate|domain_term|phraseological|reusable_construction.",
    "Use reliability high|medium|low.",
    "For a reusable construction, set pattern to a generalized frame and coreRanges to non-overlapping offsets within annotation text. Otherwise use an empty pattern and empty coreRanges.",
    "Schema:",
    '{"annotations":[{"text":"exact sourceText substring","type":"word|collocation|formula|construction|idiom|term","selectionReason":"level_appropriate|domain_term|phraseological|reusable_construction","meaningJa":"short gloss","noteJa":"specific learning benefit","example":"short source-language example","pattern":"generalized pattern or empty","coreRanges":[{"start":0,"end":8}],"start":0,"end":10,"priority":5,"reliability":"high"}]}',
  ].join("\n");
}

function levelSelectionRule(level) {
  if (level === "beginner") {
    return "For beginner learners, prioritize A1-A2 material that blocks basic understanding, plus unusually useful domain terms or fixed expressions that the passage itself makes important.";
  }
  if (level === "advanced") {
    return "For advanced learners, treat C1-C2 as the general-language knowledge floor. Omit ordinary general-language items comfortably below C1. However, lower-CEFR wording may still qualify through domain_term, phraseological, or reusable_construction when the expression as a unit gives a genuine advanced learner benefit.";
  }
  return "For intermediate learners, prioritize B1-B2 general-language material, while also allowing useful domain terms, phraseological units, and reusable constructions whose component words may be easier.";
}

function stripCandidateScanMetadata(annotations) {
  return (Array.isArray(annotations) ? annotations : []).map((item) => {
    const { selectionReason, ...annotation } = item || {};
    return annotation;
  });
}

function validSelectionReason(value) {
  return SELECTION_REASONS.has(String(value || ""));
}

module.exports = {
  buildCandidateScanPrompt,
  levelSelectionRule,
  stripCandidateScanMetadata,
  validSelectionReason,
};

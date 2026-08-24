const connotationCategories = new Set([
  "evaluative",
  "stance",
  "politeness",
  "implicature",
  "presupposition",
  "register",
  "irony",
  "euphemism",
]);

const connotationScopes = new Set(["span", "sentence", "utterance", "passage"]);
const connotationConfidence = new Set(["high", "medium", "low"]);
const connotationConventionality = new Set(["conventional", "contextual", "mixed"]);
const elementaryEnglishSingleWords = new Set([
  "a", "an", "the",
  "i", "you", "he", "she", "it", "we", "they",
  "am", "is", "are", "was", "were", "be", "been", "being",
]);

function normalizeConnotations(sourceText, connotations) {
  if (!Array.isArray(connotations)) return [];

  return connotations
    .map((item, index) => {
      const text = String(item?.text || "");
      if (!text) return null;
      const located = locateExactSpan(sourceText, text, item.start, item.end);
      if (!located) return null;

      const category = connotationCategories.has(item.category) ? item.category : "stance";
      return {
        id: String(item.id || `c${index + 1}`),
        text: sourceText.slice(located.start, located.end),
        start: located.start,
        end: located.end,
        scope: connotationScopes.has(item.scope) ? item.scope : "span",
        category,
        secondaryCategories: [...new Set(
          (Array.isArray(item.secondaryCategories) ? item.secondaryCategories : [])
            .filter((secondary) => connotationCategories.has(secondary) && secondary !== category),
        )],
        subtype: String(item.subtype || "unspecified").trim() || "unspecified",
        literalMeaning: String(item.literalMeaning || "").trim(),
        suggestedMeaning: String(item.suggestedMeaning || "").trim(),
        pragmaticEffect: String(item.pragmaticEffect || "").trim(),
        contextNote: String(item.contextNote || "").trim(),
        confidence: connotationConfidence.has(item.confidence) ? item.confidence : "medium",
        alternatives: normalizeStrings(item.alternatives),
        evidence: normalizeStrings(item.evidence),
        conventionality: connotationConventionality.has(item.conventionality)
          ? item.conventionality
          : "contextual",
      };
    })
    .filter((item) => item && item.suggestedMeaning);
}

function locateExactSpan(sourceText, text, start, end) {
  if (
    Number.isInteger(start)
    && Number.isInteger(end)
    && start >= 0
    && end > start
    && end <= sourceText.length
    && sourceText.slice(start, end) === text
  ) {
    return { start, end };
  }

  const occurrences = [];
  let index = sourceText.indexOf(text);
  while (index >= 0) {
    occurrences.push({ start: index, end: index + text.length });
    index = sourceText.indexOf(text, index + 1);
  }
  if (!occurrences.length) return null;
  if (!Number.isInteger(start)) return occurrences[0];
  return occurrences.sort((a, b) => Math.abs(a.start - start) - Math.abs(b.start - start))[0];
}

function filterLowValueAnnotations(annotations, level, sourceLanguage) {
  if (level === "beginner") return annotations;
  const language = String(sourceLanguage || "").toLowerCase();
  if (language !== "en" && language !== "english") return annotations;
  return annotations.filter((item) => (
    !elementaryEnglishSingleWords.has(String(item?.text || "").trim().toLowerCase())
  ));
}

function repairAnnotationOffsets(sourceText, annotations) {
  if (!Array.isArray(annotations)) return [];
  const occupied = [];

  return annotations.map((item) => {
    const annotationText = String(item?.text || "");
    if (!annotationText) return null;
    const candidates = [];
    if (Number.isInteger(item.start) && Number.isInteger(item.end)) {
      candidates.push([item.start, item.end]);
    }
    let index = sourceText.indexOf(annotationText);
    while (index >= 0) {
      candidates.push([index, index + annotationText.length]);
      index = sourceText.indexOf(annotationText, index + 1);
    }

    for (const [start, end] of candidates) {
      if (start < 0 || end <= start || end > sourceText.length) continue;
      if (sourceText.slice(start, end) !== annotationText) continue;
      if (occupied.some((range) => start < range.end && end > range.start)) continue;
      occupied.push({ start, end });
      return { ...item, start, end };
    }
    return null;
  }).filter(Boolean);
}

function mergeUniqueConnotations(connotations) {
  const seen = new Set();
  return (Array.isArray(connotations) ? connotations : [])
    .filter((item) => {
      const key = `${item.start}:${item.end}:${item.category}:${item.text}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

function normalizeStrings(values) {
  return Array.isArray(values)
    ? values.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
}

module.exports = {
  filterLowValueAnnotations,
  locateExactSpan,
  mergeUniqueConnotations,
  normalizeConnotations,
  repairAnnotationOffsets,
};

const MIN_SOURCE_LENGTH = 1200;
const MIN_ANNOTATIONS = 3;
const LATEST_ANNOTATION_LIMIT = 0.62;
const MIN_TRAILING_CHARACTERS = 480;
const MIN_TRAILING_RATIO = 0.32;
const MIN_LOCAL_GAP_CHARACTERS = 850;
const MIN_LOCAL_GAP_RATIO = 0.24;
const MAX_DISCOVERY_CANDIDATES = 48;

function candidateDiscoveryTarget(sourceText) {
  const text = String(sourceText || "");
  const compactCharacters = text.replace(/\s/gu, "").length;
  const whitespaceTokens = (text.trim().match(/\S+/gu) || []).length;
  const estimatedUnits = Math.max(whitespaceTokens, Math.ceil(compactCharacters / 4));
  return clamp(Math.ceil(estimatedUnits / 24) + 4, 6, MAX_DISCOVERY_CANDIDATES);
}

function wholePassageSelectionRules(target) {
  return [
    `Candidate discovery target: aim for about ${target} eligible ordinary annotations when the passage supports them. This target scales with source length and is not the displayed density count.`,
    "Before choosing ordinary annotation candidates, inspect the entire source text from beginning to end and build a global candidate set.",
    "Discover candidates before applying any density preference. Do not stop after finding enough items near the beginning.",
    "Rank every eligible ordinary annotation by pedagogical priority across the whole passage, not first-come-first-served reading order.",
    "When suitable targets occur in the beginning, middle, and end, include strong candidates from those regions in the globally ranked set.",
    "Return fewer candidates when there are genuinely fewer suitable targets. Never pad the set to reach the target, and never lower the learner-level threshold.",
  ];
}

function findLaterCoverageReview(sourceText, annotations) {
  const text = String(sourceText || "");
  if (text.length < MIN_SOURCE_LENGTH || !Array.isArray(annotations)) return null;

  const valid = annotations.filter((item) => (
    Number.isInteger(item?.start)
    && Number.isInteger(item?.end)
    && item.start >= 0
    && item.end > item.start
    && item.end <= text.length
  )).sort((a, b) => a.start - b.start || a.end - b.end);
  if (valid.length < MIN_ANNOTATIONS) return null;

  const trailingReview = findTrailingCoverageReview(text, valid);
  if (trailingReview) return trailingReview;

  return findLocalGapReview(text, valid);
}

function findTrailingCoverageReview(text, valid) {
  const latestEnd = Math.max(...valid.map((item) => item.end));
  const trailingCharacters = text.length - latestEnd;
  const minimumTrailingCharacters = Math.max(
    MIN_TRAILING_CHARACTERS,
    Math.floor(text.length * MIN_TRAILING_RATIO),
  );
  if (latestEnd / text.length > LATEST_ANNOTATION_LIMIT) return null;
  if (trailingCharacters < minimumTrailingCharacters) return null;

  const anchor = Math.max(latestEnd, Math.floor(text.length * 0.33));
  const start = findBoundaryBefore(text, anchor);
  return {
    kind: "trailing",
    start,
    end: text.length,
    latestAnnotationEnd: latestEnd,
    latestAnnotationPosition: latestEnd / text.length,
    trailingCharacters,
  };
}

function findLocalGapReview(text, valid) {
  const minimumGapCharacters = Math.max(
    MIN_LOCAL_GAP_CHARACTERS,
    Math.floor(text.length * MIN_LOCAL_GAP_RATIO),
  );
  let largest = null;

  for (let index = 0; index < valid.length - 1; index += 1) {
    const before = valid[index];
    const after = valid[index + 1];
    const gapCharacters = after.start - before.end;
    if (gapCharacters < minimumGapCharacters) continue;
    if (!largest || gapCharacters > largest.gapCharacters) {
      largest = { before, after, gapCharacters };
    }
  }

  if (!largest) return null;

  const start = findBoundaryBefore(text, largest.before.end);
  const end = findBoundaryAfter(text, largest.after.start);
  if (end <= start) return null;

  return {
    kind: "local-gap",
    start,
    end,
    gapStart: largest.before.end,
    gapEnd: largest.after.start,
    gapCharacters: largest.gapCharacters,
    latestAnnotationEnd: largest.before.end,
    latestAnnotationPosition: largest.before.end / text.length,
    trailingCharacters: text.length - largest.before.end,
  };
}

function findBoundaryBefore(text, anchor) {
  const searchStart = Math.max(0, anchor - 240);
  const prefix = text.slice(searchStart, anchor);
  const boundaryPattern = /(?:\r?\n\s*\r?\n|[.!?]\s+)/g;
  let match;
  let lastBoundary = -1;
  while ((match = boundaryPattern.exec(prefix)) !== null) {
    lastBoundary = match.index + match[0].length;
  }
  if (lastBoundary < 0) return anchor;

  let start = searchStart + lastBoundary;
  while (/\s/.test(text[start] || "")) start += 1;
  return start;
}

function findBoundaryAfter(text, anchor) {
  const searchEnd = Math.min(text.length, anchor + 240);
  const suffix = text.slice(anchor, searchEnd);
  const boundaryPattern = /(?:\r?\n\s*\r?\n|[.!?]\s+)/g;
  const match = boundaryPattern.exec(suffix);
  if (!match) return anchor;

  let end = anchor + match.index + match[0].length;
  while (/\s/.test(text[end] || "")) end += 1;
  return end;
}

function completionLimit(discoveryTarget) {
  return Math.max(3, Math.min(8, Math.ceil(Number(discoveryTarget || 0) / 4)));
}

function buildCoverageCompletionPrompt({
  sourceLanguage,
  explanationLanguage,
  targetLevel,
  focus,
  limit,
}) {
  return [
    "You are completing candidate discovery for a source region that may have been under-reviewed by an earlier annotation pass.",
    "Return only one valid JSON object. Do not use markdown fences.",
    `Source language: ${sourceLanguage}.`,
    `Explanation language: ${explanationLanguage}.`,
    `Target level: ${targetLevel}`,
    `Focus: ${focus}`,
    "Apply exactly the same learner-level knowledge floor as the first pass. Never lower the threshold to improve spatial coverage or quantity.",
    `Return at most ${limit} additional eligible ordinary annotation candidates, but return an empty annotations array when reviewText has no suitable missed targets.`,
    "The review region may be a trailing region or an interior gap between already annotated spans. Its existence is not evidence that an annotation must be added.",
    "Inspect the complete reviewText before selecting and rank candidates by pedagogical usefulness first, with reliability only as a secondary consideration.",
    "Do not fill a quota, annotate elementary material, repeat an existing target, or create overlapping targets.",
    "Do not return connotations, a translation, a summary, or slash-reading chunks. Connotation coverage is intentionally not being completed.",
    "Every text must be an exact contiguous substring of reviewText. start and end must be JavaScript string offsets local to reviewText.",
    "For a reusable construction inside a longer span, set pattern to the generalized frame and coreRanges to non-overlapping offsets within annotation text. Otherwise use an empty pattern and empty coreRanges.",
    "priority is an integer from 5 (essential/highest learner benefit) to 1 (supplementary but still level-appropriate). reliability is high, medium, or low and reflects confidence in the analysis, not importance.",
    `Write meaningJa and noteJa in natural ${explanationLanguage}. Keep meaningJa to a short gloss and noteJa compact and reference-like; in Japanese, use plain style rather than desu/masu style.`,
    "Schema:",
    '{"annotations":[{"text":"exact reviewText substring","type":"word|collocation|formula|construction|idiom|term","meaningJa":"short gloss","noteJa":"learning benefit","example":"short source-language example","pattern":"generalized construction or empty","coreRanges":[{"start":0,"end":8}],"start":0,"end":10,"priority":5,"reliability":"high"}]}',
  ].join("\n");
}

function rankEligibleAnnotations(annotations) {
  return (annotations || []).map((item, index) => ({
    ...item,
    priority: normalizePriority(item?.priority),
    reliability: normalizeReliability(item?.reliability),
    _modelOrder: index,
  })).sort((a, b) => (
    b.priority - a.priority
    || reliabilityScore(b.reliability) - reliabilityScore(a.reliability)
    || a._modelOrder - b._modelOrder
  )).map(({ _modelOrder, ...item }) => item);
}

function mergeUniqueNonOverlappingAnnotations(existing, additions) {
  const merged = [];
  const seenText = new Set();
  for (const item of rankEligibleAnnotations([...(existing || []), ...(additions || [])])) {
    const text = String(item?.text || "");
    if (!text || !Number.isInteger(item.start) || !Number.isInteger(item.end)) continue;
    if (item.start < 0 || item.end <= item.start) continue;

    const key = text.trim().toLocaleLowerCase();
    if (!key || seenText.has(key)) continue;
    if (merged.some((other) => item.start < other.end && item.end > other.start)) continue;
    seenText.add(key);
    merged.push(item);
  }
  return rankEligibleAnnotations(merged);
}

function selectAnnotationsByDensity(candidatePool, density) {
  const ranked = rankEligibleAnnotations(candidatePool);
  if (!ranked.length) return [];
  const ratio = Number(density) <= 1 ? 0.4 : Number(density) >= 3 ? 1 : 0.7;
  const count = Math.max(1, Math.ceil(ranked.length * ratio));
  return ranked.slice(0, count).sort((a, b) => a.start - b.start || a.end - b.end);
}

function stripInternalSelectionFields(annotation) {
  const { priority, reliability, ...publicAnnotation } = annotation;
  return publicAnnotation;
}

function normalizePriority(value) {
  const priority = Math.round(Number(value));
  return Number.isFinite(priority) ? clamp(priority, 1, 5) : 3;
}

function normalizeReliability(value) {
  const reliability = String(value || "medium").toLowerCase();
  return new Set(["high", "medium", "low"]).has(reliability) ? reliability : "medium";
}

function reliabilityScore(value) {
  return { high: 3, medium: 2, low: 1 }[value] || 2;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

module.exports = {
  buildCoverageCompletionPrompt,
  candidateDiscoveryTarget,
  completionLimit,
  findLaterCoverageReview,
  mergeUniqueNonOverlappingAnnotations,
  rankEligibleAnnotations,
  selectAnnotationsByDensity,
  stripInternalSelectionFields,
  wholePassageSelectionRules,
};

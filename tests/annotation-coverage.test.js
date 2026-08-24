const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildCoverageCompletionPrompt,
  candidateDiscoveryTarget,
  findLaterCoverageReview,
  mergeUniqueNonOverlappingAnnotations,
  selectAnnotationsByDensity,
  wholePassageSelectionRules,
} = require("../lib/annotation-selection");

const longPassage = [
  "Taking a closer look at first language acquisition reveals why the process seems almost magical. It interests not only linguists, but also basically everyone else who has spent any amount of time listening to young children. Early accounts often focus on memorable first words, yet researchers need systematic evidence before they can explain how vocabulary and grammar develop. A useful introduction therefore distinguishes casual observation from a longitudinal study and asks how repeated recordings can support a developmental claim.",
  "In the middle stage of the investigation, researchers compare spontaneous interaction with controlled tasks. They must account for differences in age, family setting, recording quality, and the amount of speech available from each participant. These methodological choices shape the developmental trajectory that appears in the data. A pattern that looks striking in one session may disappear when the same child is observed across several months, so analysts need to weigh competing explanations rather than rely on a single vivid example.",
  "The later stage depends heavily on child language corpora. Collections of transcribed child language let scholars revisit the same evidence, test alternative analyses, and compare speech communities that were previously underrepresented. Building such resources involves methodological trade-offs: broad coverage may reduce transcription detail, while intensive annotation limits the number of participants. Researchers must document these compromises carefully if they want other teams to draw reliable conclusions, replicate the analysis, and reuse the corpus for questions that were not anticipated when the recordings were made.",
].join("\n\n");

const negativeControlOpening = "Researchers who compare longitudinal recordings must distinguish systematic evidence from memorable anecdotes. They need to account for variation across participants, weigh competing explanations, and document methodological trade-offs before drawing reliable conclusions.";
const negativeControlPassage = negativeControlOpening
  + Array(12).fill(" I see a dog. The dog is big. It is in the park. I see the dog again. The dog can run. I like the dog.").join("");

function annotation(text) {
  return annotationIn(longPassage, text);
}

function annotationIn(passage, text) {
  const start = passage.indexOf(text);
  assert.notEqual(start, -1, `fixture phrase not found: ${text}`);
  return { text, start, end: start + text.length };
}

test("detects a substantial unreviewed tail after annotations cluster near the beginning", () => {
  const earlyAnnotations = [
    annotation("Taking a closer look at"),
    annotation("first language acquisition"),
    annotation("systematic evidence"),
    annotation("longitudinal study"),
  ];

  const review = findLaterCoverageReview(longPassage, earlyAnnotations);

  assert.ok(review);
  assert.ok(review.start > 0);
  assert.match(longPassage.slice(review.start), /child language corpora/);
  assert.match(longPassage.slice(review.start), /methodological trade-offs/);
  assert.ok(review.latestAnnotationPosition < 0.62);
});

test("does not request completion when useful annotations already reach the end", () => {
  const distributedAnnotations = [
    annotation("first language acquisition"),
    annotation("spontaneous interaction"),
    annotation("developmental trajectory"),
    annotation("child language corpora"),
    annotation("methodological trade-offs"),
    annotation("draw reliable conclusions"),
  ];

  assert.equal(findLaterCoverageReview(longPassage, distributedAnnotations), null);
});

test("does not turn sparse or short input into a mechanical coverage requirement", () => {
  assert.equal(findLaterCoverageReview(longPassage, [annotation("systematic evidence")]), null);
  assert.equal(findLaterCoverageReview("A short passage.", []), null);
});

test("candidate discovery scales with passage length instead of fixed whole-passage budgets", () => {
  const shortText = "Researchers compare recordings and explain recurring patterns.";
  const mediumText = longPassage;
  const longText = Array(4).fill(longPassage).join("\n\n");

  assert.ok(candidateDiscoveryTarget(shortText) < candidateDiscoveryTarget(mediumText));
  assert.ok(candidateDiscoveryTarget(mediumText) < candidateDiscoveryTarget(longText));
  assert.notDeepEqual([
    candidateDiscoveryTarget(shortText),
    candidateDiscoveryTarget(mediumText),
    candidateDiscoveryTarget(longText),
  ], [7, 12, 18]);
});

test("density selects deterministic nested prefixes of one pedagogically ranked pool", () => {
  const candidates = [
    { ...annotation("first language acquisition"), priority: 5, reliability: "high" },
    { ...annotation("child language corpora"), priority: 5, reliability: "medium" },
    { ...annotation("methodological trade-offs"), priority: 4, reliability: "high" },
    { ...annotation("developmental trajectory"), priority: 3, reliability: "high" },
    { ...annotation("spontaneous interaction"), priority: 2, reliability: "medium" },
  ];

  const low = selectAnnotationsByDensity(candidates, 1).map((item) => item.text);
  const standard = selectAnnotationsByDensity(candidates, 2).map((item) => item.text);
  const high = selectAnnotationsByDensity(candidates, 3).map((item) => item.text);

  assert.deepEqual(low, ["first language acquisition", "child language corpora"]);
  assert.ok(low.every((text) => standard.includes(text)));
  assert.ok(standard.every((text) => high.includes(text)));
  assert.ok(low.length < standard.length);
  assert.ok(standard.length < high.length);
});

test("pedagogical priority outranks raw reliability", () => {
  const candidates = [
    { ...annotation("systematic evidence"), priority: 5, reliability: "medium" },
    { ...annotation("spontaneous interaction"), priority: 3, reliability: "high" },
    { ...annotation("developmental trajectory"), priority: 2, reliability: "high" },
  ];

  const low = selectAnnotationsByDensity(candidates, 1);
  assert.equal(low[0].text, "systematic evidence");
});

test("merges completion results without duplicate or overlapping ordinary annotations", () => {
  const existing = [annotation("first language acquisition"), annotation("systematic evidence")];
  const additions = [
    annotation("first language acquisition"),
    annotation("language acquisition"),
    annotation("child language corpora"),
    annotation("draw reliable conclusions"),
  ];

  const merged = mergeUniqueNonOverlappingAnnotations(existing, additions);

  assert.deepEqual(merged.map((item) => item.text), [
    "first language acquisition",
    "systematic evidence",
    "child language corpora",
    "draw reliable conclusions",
  ]);
});

test("later completion candidates are globally ranked before density selection", () => {
  const initial = [
    { ...annotation("first language acquisition"), priority: 5, reliability: "high" },
    { ...annotation("systematic evidence"), priority: 4, reliability: "high" },
    { ...annotation("longitudinal study"), priority: 3, reliability: "high" },
    { ...annotation("spontaneous interaction"), priority: 2, reliability: "medium" },
  ];
  const later = [
    { ...annotation("child language corpora"), priority: 5, reliability: "high" },
    { ...annotation("methodological trade-offs"), priority: 4, reliability: "medium" },
  ];

  const pool = mergeUniqueNonOverlappingAnnotations(initial, later);
  const low = selectAnnotationsByDensity(pool, 1).map((item) => item.text);
  const high = selectAnnotationsByDensity(pool, 3).map((item) => item.text);

  assert.ok(low.includes("first language acquisition"));
  assert.ok(low.includes("child language corpora"));
  assert.ok(high.includes("methodological trade-offs"));
  assert.ok(high.every((text) => longPassage.slice(
    pool.find((item) => item.text === text).start,
    pool.find((item) => item.text === text).end,
  ) === text));
});

test("completion guidance preserves the difficulty floor and permits an empty result", () => {
  const globalRules = wholePassageSelectionRules(12).join("\n");
  const completionPrompt = buildCoverageCompletionPrompt({
    sourceLanguage: "English",
    explanationLanguage: "Japanese",
    targetLevel: "B1-B2 learners. Prefer reusable phrases.",
    focus: "Consider every analytical perspective.",
    limit: 3,
  });

  assert.match(globalRules, /entire source text from beginning to end/);
  assert.match(globalRules, /global candidate set/);
  assert.match(globalRules, /never pad/i);
  assert.match(completionPrompt, /exactly the same learner-level knowledge floor/);
  assert.match(completionPrompt, /empty annotations array/);
  assert.match(completionPrompt, /Connotation coverage is intentionally not being completed/);
});

test("a negative-control tail can complete with zero additions without padding", () => {
  const existing = [
    annotationIn(negativeControlPassage, "longitudinal recordings"),
    annotationIn(negativeControlPassage, "systematic evidence"),
    annotationIn(negativeControlPassage, "weigh competing explanations"),
  ];
  const review = findLaterCoverageReview(negativeControlPassage, existing);
  const merged = mergeUniqueNonOverlappingAnnotations(existing, []);

  assert.ok(review);
  assert.match(negativeControlPassage.slice(review.start), /I see a dog/);
  assert.deepEqual(merged.map((item) => item.text), existing.map((item) => item.text));
  assert.equal(merged.length, existing.length);
});

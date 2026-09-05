const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildCoverageCompletionPrompt,
  findLaterCoverageReview,
} = require("../lib/annotation-selection");

function annotationIn(source, text) {
  const start = source.indexOf(text);
  assert.notEqual(start, -1, `fixture phrase not found: ${text}`);
  return { text, start, end: start + text.length };
}

test("detects a large interior annotation gap even when annotations resume later", () => {
  const source = [
    "Opening target alpha introduces the topic. ",
    "Some nearby explanation leads to target beta before the under-reviewed region. ",
    Array(28).fill("This middle discussion remains substantial and should be eligible for a local coverage review when annotations disappear across it. ").join(""),
    "Later target gamma resumes annotation coverage after the gap. ",
    "A short closing discussion ends with final target delta near the end of the passage.",
  ].join("");
  const annotations = [
    annotationIn(source, "target alpha"),
    annotationIn(source, "target beta"),
    annotationIn(source, "target gamma"),
    annotationIn(source, "target delta"),
  ];

  const review = findLaterCoverageReview(source, annotations);

  assert.ok(review);
  assert.equal(review.kind, "local-gap");
  assert.ok(review.gapCharacters >= 850);
  assert.ok(review.start < review.gapStart);
  assert.ok(review.end > review.gapEnd);
  assert.match(source.slice(review.start, review.end), /middle discussion remains substantial/);
  assert.match(source.slice(review.start, review.end), /target gamma/);
});

test("does not review ordinary moderate spacing just to make annotation coverage uniform", () => {
  const source = [
    "target one ", Array(35).fill("ordinary context ").join(""),
    "target two ", Array(35).fill("ordinary context ").join(""),
    "target three ", Array(35).fill("ordinary context ").join(""),
    "target four ", Array(20).fill("ordinary context ").join(""),
  ].join("");
  const annotations = [
    annotationIn(source, "target one"),
    annotationIn(source, "target two"),
    annotationIn(source, "target three"),
    annotationIn(source, "target four"),
  ];

  assert.equal(findLaterCoverageReview(source, annotations), null);
});

test("coverage completion prompt permits an empty result for an interior review region", () => {
  const prompt = buildCoverageCompletionPrompt({
    sourceLanguage: "English",
    explanationLanguage: "Japanese",
    targetLevel: "C1 learners.",
    focus: "Consider every analytical perspective.",
    limit: 4,
  });

  assert.match(prompt, /interior gap/);
  assert.match(prompt, /not evidence that an annotation must be added/);
  assert.match(prompt, /empty annotations array/);
  assert.match(prompt, /exactly the same learner-level knowledge floor/);
});

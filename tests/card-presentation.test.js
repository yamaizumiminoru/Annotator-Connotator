const test = require("node:test");
const assert = require("node:assert/strict");
const {
  meaningfulAlternatives,
  normalizeAnnotationType,
  normalizeCoreRanges,
  quoteGloss,
  resolveCoreRanges,
  shouldShowQualification,
} = require("../card-presentation");

test("maps legacy and learner-facing annotation types", () => {
  assert.equal(normalizeAnnotationType("vocab"), "word");
  assert.equal(normalizeAnnotationType("phrase"), "collocation");
  assert.equal(normalizeAnnotationType("grammar"), "construction");
  assert.equal(normalizeAnnotationType("formula"), "formula");
  assert.equal(normalizeAnnotationType("term"), "term");
});

test("keeps only valid non-overlapping construction core ranges", () => {
  const text = "not only linguists, but also basically everyone else";
  assert.deepEqual(normalizeCoreRanges(text, [
    { start: 20, end: 28 },
    { start: 0, end: 8 },
    { start: 4, end: 12 },
    { start: -1, end: 2 },
    { start: 100, end: 110 },
  ]), [
    { start: 0, end: 8 },
    { start: 20, end: 28 },
  ]);
});

test("repairs an off-by-one model range from the generalized construction pattern", () => {
  const text = "not only linguists, but also basically everyone else";
  assert.deepEqual(resolveCoreRanges(text, "not only A, but also B", [
    { start: 0, end: 8 },
    { start: 21, end: 28 },
  ]), [
    { start: 0, end: 8 },
    { start: 20, end: 28 },
  ]);
});

test("visually distinguishes compact glosses without double quoting", () => {
  assert.equal(quoteGloss("第一言語習得", "ja"), "「第一言語習得」");
  assert.equal(quoteGloss("「第一言語習得」", "ja"), "「第一言語習得」");
  assert.equal(quoteGloss("first language acquisition", "en"), "“first language acquisition”");
});

test("hides empty or redundant qualifications and alternatives", () => {
  assert.equal(shouldShowQualification("", ["main reading"]), false);
  assert.equal(shouldShowQualification("Main reading.", ["main reading"]), false);
  assert.equal(shouldShowQualification("Only ironic in context", ["main reading"]), true);
  assert.deepEqual(meaningfulAlternatives(
    ["Main reading", "A competing interpretation", "A competing interpretation"],
    ["main reading"],
  ), ["A competing interpretation"]);
});

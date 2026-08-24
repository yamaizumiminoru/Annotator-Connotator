const test = require("node:test");
const assert = require("node:assert/strict");
const {
  locateExactSpan,
  mergeUniqueConnotations,
  normalizeConnotations,
  repairAnnotationOffsets,
} = require("../lib/annotation-normalization");

test("repairs repeated annotation offsets while rejecting overlaps and missing text", () => {
  const source = "A useful pattern appears here. The same useful pattern returns.";
  const second = source.lastIndexOf("useful pattern");
  const repaired = repairAnnotationOffsets(source, [
    { text: "useful pattern", start: 999, end: 1000 },
    { text: "useful pattern", start: second, end: second + 14 },
    { text: "pattern appears", start: 9, end: 24 },
    { text: "not present", start: 0, end: 11 },
  ]);

  assert.deepEqual(repaired.map(({ text, start, end }) => ({ text, start, end })), [
    { text: "useful pattern", start: 2, end: 16 },
    { text: "useful pattern", start: second, end: second + 14 },
  ]);
});

test("locates the occurrence nearest a model-provided repeated offset", () => {
  const source = "clear cue, filler, clear cue";
  assert.deepEqual(locateExactSpan(source, "clear cue", 20, 29), { start: 19, end: 28 });
});

test("normalizes a grounded connotation without requiring an optional context note", () => {
  const source = "The process seems almost magical.";
  const start = source.indexOf("almost magical");
  const normalized = normalizeConnotations(source, [{
    text: "almost magical",
    start,
    end: start + 14,
    category: "evaluative",
    suggestedMeaning: "surprisingly mysterious",
    pragmaticEffect: "expresses wonder",
    contextNote: "",
    alternatives: [],
    evidence: ["seems"],
  }]);

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].contextNote, "");
  assert.equal(normalized[0].category, "evaluative");
});

test("drops malformed connotations and deduplicates identical merged spans", () => {
  const source = "That result is impressive.";
  const start = source.indexOf("impressive");
  const valid = normalizeConnotations(source, [{
    text: "impressive",
    start,
    end: start + 10,
    suggestedMeaning: "strong approval",
  }, {
    text: "missing",
    start: 0,
    end: 7,
    suggestedMeaning: "unsupported",
  }]);

  assert.equal(valid.length, 1);
  assert.equal(mergeUniqueConnotations([...valid, { ...valid[0] }]).length, 1);
});

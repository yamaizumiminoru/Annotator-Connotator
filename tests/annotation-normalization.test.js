const test = require("node:test");
const assert = require("node:assert/strict");
const {
  locateExactSpan,
  mergeUniqueConnotations,
  normalizeConnotations,
  repairAnnotationOffsets,
} = require("../lib/annotation-normalization");

test("repairs annotation offsets while preserving overlaps and rejecting missing text", () => {
  const source = "A useful pattern appears here. The same useful pattern returns.";
  const second = source.lastIndexOf("useful pattern");
  const repaired = repairAnnotationOffsets(source, [
    { text: "useful pattern", start: 0, end: 1 },
    { text: "useful pattern", start: second, end: second + 14 },
    { text: "pattern appears", start: 9, end: 24 },
    { text: "not present", start: 0, end: 11 },
  ]);

  assert.deepEqual(repaired.map(({ text, start, end }) => ({ text, start, end })), [
    { text: "useful pattern", start: 2, end: 16 },
    { text: "useful pattern", start: second, end: second + 14 },
    { text: "pattern appears", start: 9, end: 24 },
  ]);
});

test("preserves nested and crossing candidates regardless of model order", () => {
  const source = "A useful pattern appears here.";
  const candidates = ["useful pattern", "pattern", "pattern appears"].map((text) => ({
    text,
    start: source.indexOf(text),
    end: source.indexOf(text) + text.length,
  }));

  for (const order of [candidates, [...candidates].reverse()]) {
    assert.deepEqual(repairAnnotationOffsets(source, order), order);
  }
});

test("does not move a valid overlapping candidate to another occurrence", () => {
  const source = "🙂形態素の構造。別の形態素。";
  const broadText = "形態素の構造";
  const targetText = "形態素";
  const start = source.indexOf(targetText);
  const candidates = [{
    text: broadText, start, end: start + broadText.length,
  }, {
    text: targetText, start, end: start + targetText.length,
  }];

  const repaired = repairAnnotationOffsets(source, candidates);
  assert.deepEqual(repaired, candidates);
  assert.equal(repaired[1].start, 2, "offsets use JavaScript UTF-16 indices");
  assert.deepEqual(repairAnnotationOffsets(source, repaired), repaired);
});

test("repairs repeated text to the nearest occurrence without consuming occurrences", () => {
  const source = "clear cue, filler, clear cue";
  const candidate = { text: "clear cue", start: 20, end: 29 };
  const repaired = repairAnnotationOffsets(source, [candidate, { ...candidate }]);

  assert.deepEqual(repaired.map(({ start, end }) => ({ start, end })), [
    { start: 19, end: 28 },
    { start: 19, end: 28 },
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

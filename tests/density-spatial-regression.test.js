const test = require("node:test");
const assert = require("node:assert/strict");
const { selectAnnotationsByDensity } = require("../lib/annotation-selection");
const fixture = require("./fixtures/luna-advanced-standard-candidate-pool-126.json");

function ids(items) {
  return new Set(items.map((item) => item.id));
}

function countsBySection(items) {
  return fixture.sectionRanges.map(({ start, end }) => (
    items.filter((item) => item.start >= start && item.start < end).length
  ));
}

function countInRange(items, range) {
  return items.filter((item) => item.start >= range.start && item.start < range.end).length;
}

test("saved 126-candidate pool reproduces the original standard-density front loading", () => {
  assert.equal(fixture.candidates.length, 126);
  const baseline = fixture.candidates.filter((item) => item.displayedAtStandardDensity);

  assert.equal(baseline.length, fixture.baselineDisplayedCount);
  assert.deepEqual(countsBySection(baseline), [22, 17, 28, 9, 13]);
  assert.equal(countInRange(baseline, fixture.problemRange), 4);
});

test("spatial tie-breaking preserves score boundaries while reducing position bias", () => {
  const standard = selectAnnotationsByDensity(fixture.candidates, 2);
  const sectionCounts = countsBySection(standard);

  assert.equal(standard.length, 89);
  assert.equal(standard.filter((item) => item.priority === 5).length, 65);
  assert.ok(standard.every((item) => item.priority >= 4));
  assert.equal(standard.filter((item) => item.priority === 4 && item.reliability === "medium").length, 0);

  assert.deepEqual(sectionCounts, [20, 16, 21, 15, 17]);
  assert.ok(Math.max(...sectionCounts) - Math.min(...sectionCounts) <= 6);
  assert.ok(countInRange(standard, fixture.problemRange) >= 8);

  const selectedTexts = new Set(standard.map((item) => item.text));
  assert.ok(selectedTexts.has("integrate new information"));
  assert.ok(selectedTexts.has("different time courses"));
  assert.ok(selectedTexts.has("with the same fluency and ease as"));
});

test("low, standard, and high density remain deterministic nested selections", () => {
  const low = selectAnnotationsByDensity(fixture.candidates, 1);
  const standard = selectAnnotationsByDensity(fixture.candidates, 2);
  const high = selectAnnotationsByDensity(fixture.candidates, 3);
  const lowIds = ids(low);
  const standardIds = ids(standard);
  const highIds = ids(high);

  assert.equal(low.length, 51);
  assert.equal(standard.length, 89);
  assert.equal(high.length, 126);
  assert.ok([...lowIds].every((id) => standardIds.has(id)));
  assert.ok([...standardIds].every((id) => highIds.has(id)));

  const lowSectionCounts = countsBySection(low);
  assert.deepEqual(lowSectionCounts, [12, 11, 12, 8, 8]);
  assert.ok(lowSectionCounts.every((count) => count > 0));
});

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../lib/vocabulary-notebook-core.js");

test("source and card ids are stable and source-sensitive", () => {
  const sourceA = { text: "A useful rule of thumb.", sourceLanguage: "en", inputMode: "text" };
  const sourceB = { text: "Another rule of thumb.", sourceLanguage: "en", inputMode: "text" };
  const sourceIdA = core.makeSourceId(sourceA);
  assert.equal(sourceIdA, core.makeSourceId({ ...sourceA }));
  assert.notEqual(sourceIdA, core.makeSourceId(sourceB));

  const card = { sourceId: sourceIdA, text: "rule of thumb", type: "idiom", start: 9, end: 22 };
  assert.equal(core.makeCardId(card), core.makeCardId({ ...card }));
  assert.notEqual(core.makeCardId(card), core.makeCardId({ ...card, sourceId: core.makeSourceId(sourceB) }));
});

test("contextWindow keeps the encountered expression in context", () => {
  const text = "Before the important rule of thumb comes after this opening sentence.";
  const start = text.indexOf("rule of thumb");
  const context = core.contextWindow(text, { text: "rule of thumb", start, end: start + 13 }, 20);
  assert.equal(context.target, "rule of thumb");
  assert.match(context.before, /important /);
  assert.match(context.after, / comes after/);
});

test("contextWindow falls back to text search when offsets are unavailable", () => {
  const context = core.contextWindow("They are at it again.", { text: "at it" }, 30);
  assert.equal(context.target, "at it");
  assert.equal(context.start, 9);
});

test("CSV export includes source context and escapes commas and quotes", () => {
  const source = { id: "s1", text: 'He called it a "rule of thumb", which helped.', sourceLanguage: "en" };
  const start = source.text.indexOf("rule of thumb");
  const card = {
    id: "c1",
    sourceId: "s1",
    text: "rule of thumb",
    type: "idiom",
    meaningJa: "経験則",
    noteJa: "日常的な表現",
    example: "As a rule of thumb, start small.",
    start,
    end: start + 13,
  };
  const csv = core.buildCsv([card], [source]);
  assert.match(csv, /sourceContext/);
  assert.match(csv, /rule of thumb/);
  assert.match(csv, /"He called it a ""rule of thumb"", which helped\."/);
});

test("Anki export emits import directives and useful fields", () => {
  const source = { id: "s1", text: "A useful rule of thumb.", sourceLanguage: "en" };
  const card = {
    id: "c1",
    sourceId: "s1",
    text: "rule of thumb",
    type: "idiom",
    meaningJa: "経験則",
    example: "As a rule of thumb, start small.",
  };
  const csv = core.buildAnkiCsv([card], [source]);
  assert.match(csv, /^#separator:Comma/m);
  assert.match(csv, /#html:true/);
  assert.match(csv, /経験則/);
  assert.match(csv, /annotator-connotator idiom en/);
});

test("JSON export only carries sources referenced by cards", () => {
  const bundle = core.buildExportBundle(
    [{ id: "c1", sourceId: "s1", text: "x" }],
    [{ id: "s1", text: "used" }, { id: "s2", text: "unused" }],
    "2026-08-29T00:00:00.000Z",
  );
  assert.equal(bundle.version, 1);
  assert.equal(bundle.sources.length, 1);
  assert.equal(bundle.sources[0].id, "s1");
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const overlapPopup = require("../overlap-popup-polish.js");
const root = path.join(__dirname, "..");

test("covering nuances are selected by exact displayed range", () => {
  const connotations = [
    { id: "whole", start: 10, end: 26 },
    { id: "inner", start: 14, end: 20 },
    { id: "other", start: 30, end: 35 },
  ];
  assert.deepEqual(
    overlapPopup.findCoveringNuances(connotations, 12, 22, 40).map((item) => item.id),
    ["whole"],
  );
});

test("invalid nuance ranges are ignored", () => {
  const connotations = [
    { id: "negative", start: -1, end: 5 },
    { id: "past-end", start: 2, end: 50 },
    { id: "reversed", start: 8, end: 4 },
  ];
  assert.deepEqual(overlapPopup.findCoveringNuances(connotations, 2, 4, 20), []);
});

test("overlap popup polish intercepts the underlined overlap and opens annotation plus nuance", () => {
  const source = fs.readFileSync(path.join(root, "overlap-popup-polish.js"), "utf8");
  assert.match(source, /closest\?\.\("\.nuance-overlap"\)/);
  assert.match(source, /buildHighlightSpans\(result\.sourceText, result\.annotations \|\| \[\]\)/);
  assert.match(source, /openPopup\(annotationSpan\.item\.id\)/);
  assert.match(source, /popupNuances\.replaceChildren\(renderNuanceBlock\(nuances\)\)/);
  assert.match(source, /stopImmediatePropagation\(\)/);
});

test("client bootstrap loads overlap popup polish after the rendering layers", () => {
  const source = fs.readFileSync(path.join(root, "client-analysis.js"), "utf8");
  const reading = source.indexOf('loadScript("./reading-difficulty-visual.js")');
  const overlap = source.indexOf('loadScript("./overlap-popup-polish.js")');
  assert.ok(reading >= 0);
  assert.ok(overlap > reading);
});

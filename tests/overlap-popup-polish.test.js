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

test("ordinary annotation can be recovered for a nuance-only rendered span", () => {
  const source = "Needless to say, honestly, this matters.";
  const constructionStart = source.indexOf("Needless to say");
  const formulaStart = source.indexOf("honestly");
  const annotations = [
    {
      id: "construction",
      text: "Needless to say",
      type: "construction",
      start: constructionStart,
      end: constructionStart + "Needless to say".length,
    },
    {
      id: "formula",
      text: "honestly",
      type: "formula",
      start: formulaStart,
      end: formulaStart + "honestly".length,
    },
  ];

  assert.equal(
    overlapPopup.findCoveringAnnotation(
      annotations,
      constructionStart,
      constructionStart + "Needless to say".length,
      source,
    )?.item.id,
    "construction",
  );
  assert.equal(
    overlapPopup.findCoveringAnnotation(
      annotations,
      formulaStart,
      formulaStart + "honestly".length,
      source,
    )?.item.id,
    "formula",
  );
});

test("nuance-only visuals are upgraded to category background plus nuance underline", () => {
  const source = fs.readFileSync(path.join(root, "overlap-popup-polish.js"), "utf8");
  assert.match(source, /querySelectorAll\("\.nuance-only"\)/);
  assert.match(source, /classList\.remove\("nuance-only"\)/);
  assert.match(source, /classList\.add\("hl", `hl-\$\{annotationSpan\.item\.type\}`, "nuance-overlap"\)/);
  assert.match(source, /patchRenderer\(root, container\)/);
});

test("overlap popup polish intercepts the underlined overlap and opens annotation plus nuance", () => {
  const source = fs.readFileSync(path.join(root, "overlap-popup-polish.js"), "utf8");
  assert.match(source, /closest\?\.\("\.nuance-overlap"\)/);
  assert.match(source, /findCoveringAnnotation\(result\.annotations, range\.start, range\.end, source\)/);
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

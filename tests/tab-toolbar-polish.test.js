const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

test("result toolbar groups controls by the tab where they are useful", () => {
  const source = read("tab-toolbar-polish.js");
  assert.match(source, /toolbar\.prepend\(filterBar\)/);
  assert.match(source, /actions\.appendChild\(reading\)/);
  assert.match(source, /querySelector\("\.tts-controls"\) \|\| root\.document\.getElementById\("speakBtn"\)/);
  assert.match(source, /actions\.appendChild\(tts\)/);
  assert.match(source, /const usesAnnotationTools = active === "annotated" \|\| active === "words"/);
  assert.match(source, /actions\.hidden = active !== "annotated"/);
});

test("Custom TTS prompt expands below TTS controls without moving the reading action", () => {
  const source = read("tab-toolbar-polish.js");
  assert.match(source, /\.tab-specific-actions\{display:grid;grid-template-columns:max-content max-content/);
  assert.match(source, /\.tab-specific-toolbar \.tts-controls\{display:grid;grid-template-columns:max-content max-content max-content max-content/);
  assert.match(source, /\.tts-controls \.tts-prompt-panel\{grid-column:1\/-1;width:100%;min-width:0\}/);
});

test("word explanation toggle is hidden on the text tab but remains in the shared filter bar", () => {
  const source = read("tab-toolbar-polish.js");
  assert.match(source, /data-active-tab=\\?"annotated\\?"[^}]*\.result-display-toggle\{display:none!important\}/);
  assert.doesNotMatch(source, /appendChild\([^\n]*showExplanations/);
});

test("redundant vocabulary notebook heading is removed while the notebook itself remains", () => {
  const source = read("tab-toolbar-polish.js");
  assert.match(source, /getElementById\("vocabularyTitle"\)/);
  assert.match(source, /title\.remove\(\)/);
  assert.match(source, /vocabulary-head-no-title/);
});

test("tab toolbar polish loads only after TTS and reading controls exist", () => {
  const client = read("client-analysis.js");
  const tts = client.indexOf('loadScript("./tts-client.js")');
  const reading = client.indexOf('loadScript("./reading-difficulty-visual.js")');
  const toolbar = client.indexOf('loadScript("./tab-toolbar-polish.js")');
  assert.ok(tts >= 0 && reading > tts && toolbar > reading);
});

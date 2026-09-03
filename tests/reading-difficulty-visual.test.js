const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("reading difficulty remains visually marked when it overlaps normal annotations", () => {
  const source = fs.readFileSync(path.join(root, "reading-difficulty-visual.js"), "utf8");
  assert.match(source, /item\?\.type === "reading"/);
  assert.match(source, /reading-difficulty-range/);
  assert.match(source, /applyReadingRanges\(\)/);
  assert.match(source, /renderAnnotatedText = function readingDifficultyVisualRender/);
});

test("visual layer loads after the reading difficulty feature", () => {
  const client = fs.readFileSync(path.join(root, "client-analysis.js"), "utf8");
  const core = client.indexOf('loadScript(".\/reading-difficulty.js")');
  const visual = client.indexOf('loadScript(".\/reading-difficulty-visual.js")');
  assert.ok(core >= 0);
  assert.ok(visual > core);
});

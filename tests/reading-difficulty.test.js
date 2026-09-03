const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "reading-difficulty.js"), "utf8");

test("reading difficulty marks are stored locally without an API request", () => {
  assert.match(source, /const EVENT_KIND = "reading_difficulty"/);
  assert.match(source, /state\.result\.annotations\.push/);
  assert.match(source, /ensureLearningLog\(\)\.push/);
  assert.match(source, /modality: "reading"/);
  assert.doesNotMatch(source, /fetch\s*\(/);
});

test("reading marks use a dedicated highlight and are excluded from the word list", () => {
  assert.match(source, /\.hl-reading\{/);
  assert.match(source, /\.badge\.reading\{/);
  assert.match(source, /item\?\.type !== TYPE/);
  assert.match(source, /renderWordList = function readingAwareRenderWordList/);
});

test("the selected source offsets and removal are persisted in the result", () => {
  assert.match(source, /start: selection\.start/);
  assert.match(source, /end: selection\.end/);
  assert.match(source, /learningEventId: eventId/);
  assert.match(source, /state\.result\.learningLog = state\.result\.learningLog\.filter/);
});

test("reading difficulty feature loads after source formatting", () => {
  const client = fs.readFileSync(path.join(root, "client-analysis.js"), "utf8");
  const formatting = client.indexOf('loadScript(".\/source-formatting-client.js")');
  const reading = client.indexOf('loadScript(".\/reading-difficulty.js")');
  assert.ok(formatting >= 0);
  assert.ok(reading > formatting);
});

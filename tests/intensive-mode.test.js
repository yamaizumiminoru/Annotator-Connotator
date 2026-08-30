const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const intensive = require("../lib/intensive-mode.js");

const root = path.join(__dirname, "..");

test("intensive mode stays limited to short passages", () => {
  assert.equal(intensive.INTENSIVE_MAX_SOURCE_LENGTH, 1200);
  assert.equal(intensive.isTooLong("a".repeat(1200)), false);
  assert.equal(intensive.isTooLong("a".repeat(1201)), true);
});

test("intensive candidate cap scales up but remains bounded", () => {
  const shortCap = intensive.intensiveCandidateMaximum("This is a short passage for close reading.");
  const longCap = intensive.intensiveCandidateMaximum("研究".repeat(500));
  assert.ok(shortCap >= intensive.INTENSIVE_MIN_CANDIDATES);
  assert.ok(longCap >= shortCap);
  assert.ok(longCap <= intensive.INTENSIVE_MAX_CANDIDATES);
});

test("intensive prompt requests dense but non-overlapping teacher-facing coverage", () => {
  const prompt = intensive.augmentAnnotationPrompt("BASE", { hardMaximum: 30 });
  assert.match(prompt, /teacher-facing close-reading preparation/);
  assert.match(prompt, /every ordinary annotation that has at least moderate teaching value/);
  assert.match(prompt, /no-overlap rule/);
  assert.match(prompt, /30 ordinary candidates/);
});

test("client injects extraction mode and can hide explanations without deleting data", () => {
  const source = fs.readFileSync(path.join(root, "intensive-mode.js"), "utf8");
  assert.match(source, /payload\.extractionMode = mode/);
  assert.match(source, /payload\.density = 3/);
  assert.match(source, /hide-annotation-explanations/);
  assert.match(source, /showExplanations/);
  assert.match(source, /INTENSIVE_MODE/);
});

test("server patch carries extraction mode through request context and raises discovery cap", () => {
  const source = fs.readFileSync(path.join(root, "server-reason-selection.js"), "utf8");
  assert.match(source, /context\.extractionMode = intensiveMode\.normalizeMode\(payload\.extractionMode\)/);
  assert.match(source, /intensiveMode\.intensiveCandidateMaximum\(sourceText\)/);
  assert.match(source, /intensiveMode\.augmentAnnotationPrompt/);
  assert.match(source, /effectiveDensity = intensiveMode\.isIntensive/);
});

test("material JSON preserves intensive and explanation-visibility settings", () => {
  const source = fs.readFileSync(path.join(root, "material-io.js"), "utf8");
  assert.match(source, /extractionMode:/);
  assert.match(source, /showExplanations:/);
  assert.match(source, /applyImportedDisplaySettings/);
  assert.match(source, /setExplanationsVisible/);
});

test("the app bootstrap loads the intensive core and client", () => {
  const source = fs.readFileSync(path.join(root, "vocabulary-notebook-ui.js"), "utf8");
  assert.match(source, /\.\/lib\/intensive-mode\.js/);
  assert.match(source, /\.\/intensive-mode\.js/);
});

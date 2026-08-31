const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const intensive = require("../lib/intensive-mode.js");
const selection = require("../lib/annotation-selection.js");
const analysisCore = require("../lib/analysis-core.js");

const root = path.join(__dirname, "..");

test("exhaustive coverage stays limited to short passages", () => {
  assert.equal(intensive.INTENSIVE_MAX_SOURCE_LENGTH, 1200);
  assert.equal(intensive.isTooLong("a".repeat(1200)), false);
  assert.equal(intensive.isTooLong("a".repeat(1201)), true);
});

test("exhaustive candidate cap scales up but remains bounded", () => {
  const shortCap = intensive.intensiveCandidateMaximum("This is a short passage for teaching preparation.");
  const longCap = intensive.intensiveCandidateMaximum("研究".repeat(500));
  assert.ok(shortCap >= intensive.INTENSIVE_MIN_CANDIDATES);
  assert.ok(longCap >= shortCap);
  assert.ok(longCap <= intensive.INTENSIVE_MAX_CANDIDATES);
});

test("exhaustive prompt permits distinct overlapping teaching units and optional notes", () => {
  const prompt = intensive.augmentAnnotationPrompt("BASE", { hardMaximum: 30 });
  assert.match(prompt, /teacher-facing preparation/);
  assert.match(prompt, /every ordinary annotation that has at least moderate teaching value/);
  assert.match(prompt, /Overlapping annotation spans are allowed/);
  assert.match(prompt, /noteJa is optional/);
  assert.match(prompt, /30 ordinary candidates/);
});

test("annotation merging keeps overlaps but removes exact duplicate analyses", () => {
  const items = selection.mergeUniqueNonOverlappingAnnotations([], [
    { text: "go over", type: "word", start: 10, end: 17, priority: 5, reliability: "high" },
    { text: "go over the main branches", type: "construction", start: 10, end: 35, priority: 4, reliability: "high" },
    { text: "go over", type: "word", start: 10, end: 17, priority: 3, reliability: "medium" },
  ]);
  assert.equal(items.length, 2);
  assert.ok(items.some((item) => item.text === "go over"));
  assert.ok(items.some((item) => item.text === "go over the main branches"));
});

test("analysis cache separates standard and exhaustive discovery", () => {
  const standard = analysisCore.cacheMaterial({ text: "abc", extractionMode: "standard" });
  const exhaustive = analysisCore.cacheMaterial({ text: "abc", extractionMode: "intensive" });
  assert.notDeepEqual(standard, exhaustive);
  assert.equal(exhaustive.extractionMode, "intensive");
});

test("client exposes density 4 as exhaustive and supports added explanations", () => {
  const source = fs.readFileSync(path.join(root, "intensive-mode.js"), "utf8");
  assert.match(source, /range\.max = "4"/);
  assert.match(source, /densityCoverage/);
  assert.match(source, /payload\.extractionMode = coverage/);
  assert.match(source, /type: "additional"/);
  assert.match(source, /addAsAnnotation/);
  assert.match(source, /hl-stack-2/);
  assert.match(source, /openAnnotationStack/);
  assert.match(source, /hide-annotation-explanations/);
});

test("normal note policy explicitly allows blank non-redundant notes", () => {
  const source = fs.readFileSync(path.join(root, "server-note-policy.js"), "utf8");
  assert.match(source, /noteJa is optional/);
  assert.match(source, /merely to restate meaningJa/);
  assert.match(source, /technical definition/);
});

test("server patch carries exhaustive mode through request context and raises discovery cap", () => {
  const source = fs.readFileSync(path.join(root, "server-reason-selection.js"), "utf8");
  assert.match(source, /context\.extractionMode = intensiveMode\.normalizeMode\(payload\.extractionMode\)/);
  assert.match(source, /intensiveMode\.intensiveCandidateMaximum\(sourceText\)/);
  assert.match(source, /intensiveMode\.augmentAnnotationPrompt/);
  assert.match(source, /effectiveDensity = intensiveMode\.isIntensive/);
});

test("material JSON preserves exhaustive and explanation-visibility settings", () => {
  const source = fs.readFileSync(path.join(root, "material-io.js"), "utf8");
  assert.match(source, /extractionMode:/);
  assert.match(source, /showExplanations:/);
  assert.match(source, /applyImportedDisplaySettings/);
  assert.match(source, /setExplanationsVisible/);
});

test("the app bootstrap loads the exhaustive core and client", () => {
  const source = fs.readFileSync(path.join(root, "vocabulary-notebook-ui.js"), "utf8");
  assert.match(source, /\.\/lib\/intensive-mode\.js/);
  assert.match(source, /\.\/intensive-mode\.js/);
});

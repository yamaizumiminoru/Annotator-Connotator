const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildCandidateScanPrompt,
  stripCandidateScanMetadata,
  validSelectionReason,
} = require("../lib/candidate-scan");

const advancedPrompt = buildCandidateScanPrompt({
  sourceLanguage: "English",
  explanationLanguage: "Japanese",
  level: "advanced",
  focus: "all",
  includeGrammar: true,
  discoveryTarget: 12,
});

test("advanced candidate scan uses a C1-C2 floor with explicit exception routes", () => {
  assert.match(advancedPrompt, /C1-C2/);
  assert.match(advancedPrompt, /domain_term/);
  assert.match(advancedPrompt, /phraseological/);
  assert.match(advancedPrompt, /reusable_construction/);
  assert.match(advancedPrompt, /lower-CEFR wording may still qualify/i);
});

test("candidate scan calibration keeps high-value easy-word units and rejects compositional padding", () => {
  for (const expected of [
    "stay with you",
    "They're at it",
    "brain plasticity",
    "rule of thumb",
    "window of opportunity",
    "It is misleading to think of A as B",
  ]) assert.match(advancedPrompt, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  for (const rejected of [
    "on the other hand",
    "one key factor",
    "understanding sarcasm or irony",
    "during practically every waking moment",
  ]) assert.match(advancedPrompt, new RegExp(rejected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("candidate scan metadata can guide selection without leaking into public annotations", () => {
  const stripped = stripCandidateScanMetadata([{
    text: "rule of thumb",
    selectionReason: "phraseological",
    priority: 5,
  }]);
  assert.deepEqual(stripped, [{ text: "rule of thumb", priority: 5 }]);
  assert.equal(validSelectionReason("domain_term"), true);
  assert.equal(validSelectionReason("ordinary_compositional"), false);
});

test("server integrates the scan as a parallel experimental discovery path", () => {
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.match(server, /ANNOTATION_CANDIDATE_SCAN/);
  assert.match(server, /scanAnnotationCandidates/);
  assert.match(server, /Promise\.all/);
  assert.match(server, /dedicated-scan-v1/);
});

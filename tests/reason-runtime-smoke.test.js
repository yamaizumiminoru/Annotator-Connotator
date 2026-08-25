const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("reason-aware server keeps connotation benchmark calls on the legacy integrated path", () => {
  const source = fs.readFileSync(path.join(root, "server-reason-selection.js"), "utf8");
  assert.match(source, /isConnotationTargetTest/);
  assert.match(source, /if \(isConnotationTargetTest\) return nativeFetch/);
});

test("broad discovery is followed by a separate judge call using the same model", () => {
  const source = fs.readFileSync(path.join(root, "server-reason-selection.js"), "utf8");
  assert.match(source, /reasonJudge\.broadenAnnotationPrompt/);
  assert.match(source, /reasonJudge\.buildJudgePrompt/);
  assert.match(source, /model: parentBody\.model/);
  assert.match(source, /applyJudgments/);
});

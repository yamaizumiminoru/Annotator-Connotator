const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("question answer observer is scoped to the answer box so add-button mutations cannot self-trigger", () => {
  const source = fs.readFileSync(path.join(root, "intensive-mode.js"), "utf8");
  assert.match(source, /const answer = root\.document\.querySelector\("\.ac-question-answer"\)/);
  assert.match(source, /observer\.observe\(answer, \{ childList: true, subtree: true, characterData: true \}\)/);
  assert.doesNotMatch(source, /observer\.observe\(root\.document\.body, \{ childList: true, subtree: true, characterData: true \}\)/);
});

test("question add button updates are idempotent", () => {
  const source = fs.readFileSync(path.join(root, "intensive-mode.js"), "utf8");
  assert.match(source, /if \(button\.textContent !== label\) button\.textContent = label/);
  assert.match(source, /if \(button\.disabled\) button\.disabled = false/);
});

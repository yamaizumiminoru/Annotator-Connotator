const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("question answers are rendered as safe rich text instead of raw markdown", () => {
  const source = fs.readFileSync(path.join(root, "display-settings-polish.js"), "utf8");
  assert.match(source, /function renderRichText\(container, source\)/);
  assert.match(source, /createElement\("strong"\)/);
  assert.match(source, /createElement\("li"\)/);
  assert.match(source, /querySelector\("\.ac-question-answer"\)/);
  assert.match(source, /observer\.disconnect\(\)/);
  assert.match(source, /root\.AC_RICH_TEXT = \{ render: renderRichText \}/);
  assert.doesNotMatch(source, /answer\.innerHTML\s*=/);
});

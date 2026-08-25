const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("architecture note records separated discovery, judge, and soft selection", () => {
  const text = fs.readFileSync(path.join(__dirname, "..", "docs", "REASON_TAGGED_SELECTION_V1.md"), "utf8");
  assert.match(text, /discovery from learner-band judgment/);
  assert.match(text, /難語/);
  assert.match(text, /慣用表現/);
  assert.match(text, /術語/);
  assert.match(text, /構文/);
  assert.match(text, /soft threshold/);
});

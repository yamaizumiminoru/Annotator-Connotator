const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("display settings polish renames translation generation and moves explanation visibility to result filters", () => {
  const source = fs.readFileSync(path.join(root, "display-settings-polish.js"), "utf8");
  assert.match(source, /includeTranslation = "翻訳を生成"/);
  assert.match(source, /includeTranslation = "Generate translation"/);
  assert.match(source, /getElementById\("annotationFilterBar"\)/);
  assert.match(source, /getElementById\("showExplanations"\)/);
  assert.match(source, /filterBar\.insertBefore\(label, help \|\| null\)/);
});

test("client bootstrap loads display settings polish", () => {
  const source = fs.readFileSync(path.join(root, "client-analysis.js"), "utf8");
  assert.match(source, /loadScript\("\.\/display-settings-polish\.js"\)/);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("display settings polish separates analysis and result display controls", () => {
  const source = fs.readFileSync(path.join(root, "display-settings-polish.js"), "utf8");
  assert.match(source, /includeTranslation = "翻訳を生成"/);
  assert.match(source, /includeTranslation = "Generate translation"/);
  assert.match(source, /showExplanations = "語句解説を表示"/);
  assert.match(source, /showExplanations = "Show word explanations"/);
  assert.match(source, /getElementById\("annotationFilterBar"\)/);
  assert.match(source, /getElementById\("showExplanations"\)/);
  assert.match(source, /help\.insertAdjacentElement\("afterend", label\)/);
});

test("category glossary suppresses the irrelevant vocabulary registration control", () => {
  const source = fs.readFileSync(path.join(root, "display-settings-polish.js"), "utf8");
  assert.match(source, /querySelector\("\.category-glossary"\)/);
  assert.match(source, /querySelectorAll\("\.vocab-register-control"\)/);
  assert.match(source, /isGlossary \? "none" : ""/);
});

test("client bootstrap loads display settings polish", () => {
  const source = fs.readFileSync(path.join(root, "client-analysis.js"), "utf8");
  assert.match(source, /loadScript\("\.\/display-settings-polish\.js"\)/);
});

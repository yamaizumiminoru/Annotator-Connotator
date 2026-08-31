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

test("text-click explanation popups remain fully visible when the word-list explanation toggle is off", () => {
  const source = fs.readFileSync(path.join(root, "display-settings-polish.js"), "utf8");
  assert.match(source, /hide-annotation-explanations \.popup \.popup-def/);
  assert.match(source, /hide-annotation-explanations \.popup \.popup-pattern/);
  assert.match(source, /hide-annotation-explanations \.popup \.popup-note/);
  assert.match(source, /hide-annotation-explanations \.popup \.popup-ex/);
  assert.match(source, /hide-annotation-explanations \.popup \.popup-nuances/);
  assert.match(source, /hide-annotation-explanations \.annotation-stack-body\{display:block!important\}/);
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

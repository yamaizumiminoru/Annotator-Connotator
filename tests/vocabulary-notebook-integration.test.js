const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const notebookJs = fs.readFileSync(path.join(root, "vocabulary-notebook.js"), "utf8");

test("index loads vocabulary notebook before the main app script", () => {
  const coreIndex = indexHtml.indexOf('./lib/vocabulary-notebook-core.js');
  const notebookIndex = indexHtml.indexOf('./vocabulary-notebook.js');
  const appIndex = indexHtml.indexOf('./script.js');
  assert.ok(coreIndex >= 0);
  assert.ok(notebookIndex > coreIndex);
  assert.ok(appIndex > notebookIndex);
});

test("browser notebook uses a dedicated IndexedDB and persistent source/card stores", () => {
  assert.match(notebookJs, /annotator-connotator-study/);
  assert.match(notebookJs, /SOURCE_STORE = "sources"/);
  assert.match(notebookJs, /CARD_STORE = "cards"/);
  assert.match(notebookJs, /navigator\?\.storage\?\.persist/);
});

test("notebook UI exposes registration, source context, and all v1 exports", () => {
  assert.match(notebookJs, /vocabularyRegister/);
  assert.match(notebookJs, /vocabularySource/);
  assert.match(notebookJs, /vocabularyExportJson/);
  assert.match(notebookJs, /vocabularyExportCsv/);
  assert.match(notebookJs, /vocabularyExportAnki/);
});

test("saved cards retain the explanation language used by their analysis", () => {
  assert.match(notebookJs, /explanationLanguage:\s*result\.explanationLanguage/);
  assert.match(notebookJs, /vocabularyExplanationLanguage/);
});

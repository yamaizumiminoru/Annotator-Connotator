const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("Japanese UI polish covers dynamic status and speech controls", () => {
  const source = fs.readFileSync(path.join(root, "reason-ui-localization.js"), "utf8");
  assert.match(source, /uiLanguage:\s*"表示言語"/);
  assert.match(source, /serverReadyShort:\s*"LLM準備完了"/);
  assert.match(source, /serverKeyNeededShort:\s*"キー未設定"/);
  assert.match(source, /serverOfflineShort:\s*"オフライン"/);
  assert.match(source, /relocalizeTtsControls/);
  assert.match(source, /deviceSpeech/);
  assert.match(source, /aiSpeech/);
  assert.match(source, /MutationObserver/);
});

test("question feature is loaded before final localization and browser import", () => {
  const source = fs.readFileSync(path.join(root, "client-analysis.js"), "utf8");
  const question = source.indexOf('loadScript("./question-client.js")');
  const localization = source.indexOf('loadScript("./reason-ui-localization.js")');
  const browserImport = source.indexOf('loadScript("./browser-import.js")');
  assert.ok(question >= 0, "question-client.js should be loaded");
  assert.ok(localization > question, "localization should run after question UI strings are installed");
  assert.ok(browserImport > localization, "browser import should remain after localization");
});

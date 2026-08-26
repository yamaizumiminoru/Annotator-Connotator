const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("the app uses the Annotator-Connotator logo in the header and favicon", () => {
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const enhancements = fs.readFileSync(path.join(root, "enhancements.css"), "utf8");
  const logoPath = path.join(root, "assets", "annotator-connotator-logo.png");
  assert.match(index, /rel="icon"[^>]+annotator-connotator-logo\.png/);
  assert.match(enhancements, /brand-row[\s\S]+annotator-connotator-logo\.png/);
  assert.equal(fs.existsSync(logoPath), true);
  assert.ok(fs.statSync(logoPath).size > 0);
});

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

test("question feature is loaded directly after the base app", () => {
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const bootstrap = fs.readFileSync(path.join(root, "client-analysis.js"), "utf8");
  const baseApp = index.indexOf('<script src="./script.js"></script>');
  const question = index.indexOf('<script src="./question-client.js"></script>');
  assert.ok(baseApp >= 0, "base app should be loaded");
  assert.ok(question > baseApp, "question-client.js should load directly after the base app");
  assert.doesNotMatch(bootstrap, /loadScript\("\.\/question-client\.js"\)/);
});

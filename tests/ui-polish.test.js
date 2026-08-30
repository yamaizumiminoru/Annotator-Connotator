const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { normalizePastedProse } = require("../ui-polish.js");

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

test("Japanese UI polish covers dynamic status, question hints, and speech controls", () => {
  const source = fs.readFileSync(path.join(root, "reason-ui-localization.js"), "utf8");
  assert.match(source, /uiLanguage:\s*"表示言語"/);
  assert.match(source, /serverReadyShort:\s*"LLM準備完了"/);
  assert.match(source, /serverKeyNeededShort:\s*"キー未設定"/);
  assert.match(source, /serverOfflineShort:\s*"オフライン"/);
  assert.match(source, /relocalizeQuestionUi/);
  assert.match(source, /\[data-question-i18n\]/);
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

test("joins wrapped English prose within a sentence", () => {
  assert.equal(
    normalizePastedProse("What we communicate is much richer\nthan what we literally say and the listener\nuses contextual information."),
    "What we communicate is much richer than what we literally say and the listener uses contextual information.",
  );
});

test("joins wrapped Japanese prose without inserting spaces", () => {
  assert.equal(
    normalizePastedProse("研究とは、人類の知を\n広げる活動です。"),
    "研究とは、人類の知を広げる活動です。",
  );
});

test("preserves explicit blank-line paragraph boundaries", () => {
  assert.equal(
    normalizePastedProse("First line\ncontinues here.\n\nSecond paragraph\ncontinues too."),
    "First line continues here.\n\nSecond paragraph continues too.",
  );
});

test("preserves an English single line break after sentence-final punctuation", () => {
  assert.equal(
    normalizePastedProse("First paragraph ends here.\nSecond paragraph starts here."),
    "First paragraph ends here.\nSecond paragraph starts here.",
  );
});

test("preserves a Japanese single line break after sentence-final punctuation", () => {
  assert.equal(
    normalizePastedProse("第一段落です。\n第二段落です。"),
    "第一段落です。\n第二段落です。",
  );
});

test("repairs common line-end hyphenation", () => {
  assert.equal(
    normalizePastedProse("This is an inter-\nnational example."),
    "This is an international example.",
  );
});

test("preserves simple list structure", () => {
  assert.equal(
    normalizePastedProse("Intro line\n- first item\n- second item"),
    "Intro line\n- first item\n- second item",
  );
});

test("analysis cleanup restores the pasted textarea after supplying a cleaned copy", () => {
  const source = fs.readFileSync(path.join(root, "ui-polish.js"), "utf8");
  assert.match(source, /const original = source\.value/);
  assert.match(source, /queueMicrotask\(restore\)/);
  assert.match(source, /annotation\.sourceText", original/);
});

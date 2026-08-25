const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  UI_TEXT_CACHE_VERSION,
  JAPANESE_APP_TITLE,
  cacheKey,
  install,
  interpolate,
  mergeUiStrings,
  missingUiStrings,
  readCache,
} = require("../reason-ui-localization");

test("uses the playful app title only for the Japanese UI", () => {
  const appTitleNode = { textContent: "多言語アノテーション" };
  const select = {
    value: "ja",
    addEventListener() {},
  };
  const storage = {
    getItem() { return null; },
    setItem() {},
  };
  const root = {
    UI_TEXT: {
      ja: { appTitle: "多言語アノテーション" },
      en: { appTitle: "Multilingual Annotation" },
    },
    document: {
      getElementById(id) { return id === "uiLangSelect" ? select : null; },
      querySelector(selector) { return selector === '[data-i18n="appTitle"]' ? appTitleNode : null; },
      querySelectorAll() { return []; },
    },
    localStorage: storage,
    setTimeout(callback) { callback(); },
  };

  install(root);

  assert.equal(JAPANESE_APP_TITLE, "あの手ーターこの手ーター");
  assert.equal(root.UI_TEXT.ja.appTitle, JAPANESE_APP_TITLE);
  assert.equal(root.UI_TEXT.en.appTitle, "Multilingual Annotation");
  assert.equal(appTitleNode.textContent, JAPANESE_APP_TITLE);
});

test("detects only UI strings missing from an existing generated translation cache", () => {
  assert.deepEqual(
    missingUiStrings(
      { appTitle: "App", reasonHardWord: "Difficult word", reasonTerm: "Technical term" },
      { appTitle: "Aplicación" },
    ),
    { reasonHardWord: "Difficult word", reasonTerm: "Technical term" },
  );
});

test("merges supplemental translations without discarding existing cached UI strings", () => {
  assert.deepEqual(
    mergeUiStrings(
      { appTitle: "Aplicación", analyze: "Analizar" },
      { reasonHardWord: "Palabra difícil" },
    ),
    { appTitle: "Aplicación", analyze: "Analizar", reasonHardWord: "Palabra difícil" },
  );
});

test("uses the existing UI cache schema and can read a supplemented cache", () => {
  const values = new Map();
  const storage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, value); },
  };
  const key = cacheKey("es");
  assert.equal(UI_TEXT_CACHE_VERSION, "5");
  assert.equal(key, "annotation.uiText.5.es");
  storage.setItem(key, JSON.stringify({ reasonIdiomatic: "Expresión idiomática" }));
  assert.deepEqual(readCache(storage, "es"), { reasonIdiomatic: "Expresión idiomática" });
});

test("placeholder interpolation is preserved for supplemental translations", () => {
  assert.equal(interpolate("Section {current} / {total}", { current: 2, total: 5 }), "Section 2 / 5");
});

test("localization supplement loads after reason-selection client adds its UI keys", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "client-analysis.js"), "utf8");
  const reasonClient = source.indexOf('loadScript("./reason-selection-client.js")');
  const supplement = source.indexOf('loadScript("./reason-ui-localization.js")');
  assert.ok(reasonClient >= 0);
  assert.ok(supplement > reasonClient);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  UI_TEXT_CACHE_VERSION,
  cacheKey,
  interpolate,
  mergeUiStrings,
  missingUiStrings,
  readCache,
} = require("../reason-ui-localization");

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

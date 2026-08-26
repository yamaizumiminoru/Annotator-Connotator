const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  isTranslationEnabled,
  normalizeTranslation,
  shouldRepairTranslation,
  translationPromptDirectives,
} = require("../lib/translation-policy");

const root = path.join(__dirname, "..");

test("translation prompt is opt-in and retains the existing full-translation rules when enabled", () => {
  const disabled = translationPromptDirectives({ includeTranslation: false });
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.chunkAction, "Analyze only sourceText.");
  assert.match(disabled.rules.join("\n"), /Do not generate a translation/);
  assert.match(disabled.rules.join("\n"), /Set "translation" to an empty string/);
  assert.doesNotMatch(disabled.rules.join("\n"), /full-passage translation/);

  const enabled = translationPromptDirectives({ includeTranslation: true });
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.chunkAction, "Analyze and translate only sourceText.");
  assert.match(enabled.rules.join("\n"), /faithful full-passage translation/);
});

test("server discards an unexpected model translation while disabled", () => {
  assert.equal(isTranslationEnabled({ includeTranslation: false }), false);
  assert.equal(isTranslationEnabled({}), false);
  assert.equal(isTranslationEnabled({ includeTranslation: "true" }), false);
  assert.equal(normalizeTranslation("モデルが返した翻訳", { includeTranslation: false }), "");
  assert.equal(normalizeTranslation("モデルが返した翻訳", { includeTranslation: true }), "モデルが返した翻訳");
});

test("translation repair predicate is lazy while disabled and preserved while enabled", () => {
  let calls = 0;
  const needsRepair = () => {
    calls += 1;
    return true;
  };
  assert.equal(shouldRepairTranslation({ includeTranslation: false }, needsRepair), false);
  assert.equal(calls, 0);
  assert.equal(shouldRepairTranslation({ includeTranslation: true }, needsRepair), true);
  assert.equal(calls, 1);
});

test("UI defaults translation to off, persists it, sends it, and hides an empty result", () => {
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const client = fs.readFileSync(path.join(root, "script.js"), "utf8");
  assert.match(index, /id="includeTranslation" type="checkbox">/);
  assert.match(index, /data-i18n="includeTranslation">翻訳を表示/);
  assert.match(index, /class="translation-card" id="translationCard" hidden/);
  assert.match(client, /annotation\.includeTranslation"\) === "true"/);
  assert.match(client, /annotation\.includeTranslation", String\(els\.includeTranslation\.checked\)/);
  assert.match(client, /includeTranslation: els\.includeTranslation\.checked/);
  assert.match(client, /shouldShowTranslation\(els\.includeTranslation\.checked, translation\)/);
});

test("changing the translation checkbox only persists and rerenders locally", () => {
  const client = fs.readFileSync(path.join(root, "script.js"), "utf8");
  const start = client.indexOf('els.includeTranslation.addEventListener("change"');
  const end = client.indexOf('els.annotateBtn.addEventListener("click"', start);
  assert.ok(start >= 0 && end > start);
  const handler = client.slice(start, end);
  assert.match(handler, /persistSettings\(\)/);
  assert.match(handler, /renderTranslation\(\)/);
  assert.doesNotMatch(handler, /fetch\s*\(/);
  assert.doesNotMatch(handler, /annotate\s*\(/);
});

test("server wires translation policy through prompt, repair, and long-form merge", () => {
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
  assert.match(server, /translationPromptDirectives\(payload\)/);
  assert.match(server, /translation\.enabled[\s\S]*?full sourceText translation[\s\S]*?'  "translation": ""/);
  assert.match(server, /parsed\.translation = normalizeTranslation\(parsed\.translation, payload\)/);
  assert.match(server, /shouldRepairTranslation\(payload, \(\) =>/);
  assert.match(server, /includeTranslation: isTranslationEnabled\(payload\)/);
});

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const routing = require("../lib/explanation-language-routing");

const restored = [
  ["mn", "Mongolian"],
  ["mi", "Māori"],
  ["ur", "Urdu"],
];

test("validated explanation languages route without Japanese fallback", () => {
  for (const [code, name] of restored) {
    assert.equal(routing.languageNameForCode(code), name);
    const prompt = [
      "Source language: Japanese.",
      "Explanation language: Japanese.",
      "Write summaryJa and meaningJa values in natural Japanese.",
      "Use only Japanese in explanatory prose.",
      "Check explanations for accidental words from a language other than Japanese.",
    ].join("\n");
    const routed = routing.rewriteExplanationLanguagePrompt(prompt, code);
    assert.match(routed, new RegExp(`Explanation language: ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.`));
    assert.match(routed, new RegExp(`in natural ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.match(routed, new RegExp(`Use only ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} in explanatory prose`));
    assert.match(routed, /Source language: Japanese\./);
    assert.doesNotMatch(routed, /Explanation language: Japanese\./);
  }
});

test("UI translation prompts use full validated language names", () => {
  for (const [code, name] of restored) {
    assert.equal(
      routing.rewriteUiTargetLanguagePrompt(`Target language: ${code}.`),
      `Target language: ${name}.`,
    );
  }
});

test("browser catalog exposes all three restored languages", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "client-analysis.js"), "utf8");
  const context = {
    LANGUAGE_CATALOG: [
      { code: "ja", name: "Japanese", native: "日本語", speech: "ja-JP" },
      { code: "en", name: "English", native: "English", speech: "en-US" },
    ],
    module: { exports: {} },
    console,
  };
  vm.createContext(context);
  vm.runInContext(source, context);

  for (const [code, name] of restored) {
    const entry = context.LANGUAGE_CATALOG.find((item) => item.code === code);
    assert.ok(entry, `${code} should be present`);
    assert.equal(entry.name, name);
  }
});

test("server wrapper applies validated explanation-language routing", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "server-reason-selection.js"), "utf8");
  assert.match(source, /context\.explanationLanguage/);
  assert.match(source, /rewriteExplanationLanguagePrompt/);
  assert.match(source, /rewriteUiTargetLanguagePrompt/);
});

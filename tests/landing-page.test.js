const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "landing.html"), "utf8");
const css = fs.readFileSync(path.join(root, "landing-v2.css"), "utf8");

test("landing hero uses the current Japanese message and public repository CTA", () => {
  assert.match(html, /文章も動画も、[\s\S]*あの手この手で、[\s\S]*語学教材に。/);
  assert.match(html, />最新版を見る</);
  assert.doesNotMatch(html, /href="\.\/index\.html"/);
  assert.doesNotMatch(html, />アプリを開く</);
});

test("landing page visibly lists all 74 supported languages", () => {
  const block = html.match(/<div class="language-grid"[\s\S]*?<\/div>/)?.[0] || "";
  const entries = Array.from(block.matchAll(/<span>[^<]+<\/span>/g));
  assert.equal(entries.length, 74);
  for (const language of ["日本語", "英語", "モンゴル語", "マオリ語", "ウルドゥー語"]) {
    assert.ok(block.includes(`<span>${language}</span>`), `Missing ${language}`);
  }
});

test("landing page offers an AI setup prompt without exposing a local app link", () => {
  assert.match(html, /生成AIにそのまま渡すプロンプト/);
  assert.match(html, /https:\/\/github\.com\/yamaizumiminoru\/Annotator-Connotator/);
  assert.match(html, /APIキーは秘密情報/);
  assert.match(html, /id="copySetupPrompt"/);
});

test("landing UI mockup is intentionally straight", () => {
  assert.match(css, /\.browser-frame\s*\{\s*transform:\s*none;/);
});

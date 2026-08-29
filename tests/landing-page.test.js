const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "landing.html"), "utf8");
const css = fs.readFileSync(path.join(root, "landing-v2.css"), "utf8");
const fixes = fs.readFileSync(path.join(root, "landing-fixes.js"), "utf8");
const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "landing-pages.yml"), "utf8");

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

test("landing page shows the intact real app screenshot after the 74-language list", () => {
  const languageSectionEnd = html.indexOf("</section>", html.indexOf('id="languages"'));
  const screenSection = html.indexOf('class="screen-section"');
  assert.ok(languageSectionEnd >= 0 && screenSection > languageSectionEnd);
  assert.match(html, /<h2 id="screen-title">実際の画面<\/h2>/);
  assert.match(html, /src="\.\/assets\/annotator-connotator-overview\.png"/);

  const screenshot = fs.readFileSync(path.join(root, "assets", "annotator-connotator-overview.png"));
  assert.deepEqual(Array.from(screenshot.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(screenshot.readUInt32BE(16), 2787);
  assert.equal(screenshot.readUInt32BE(20), 2142);
  assert.ok(screenshot.length > 500_000);
});

test("real screenshot is responsive and included in Pages deployment", () => {
  assert.match(css, /\.screen-figure img\s*\{[\s\S]*?width:\s*100%;[\s\S]*?height:\s*auto;/);
  assert.match(css, /@media \(max-width:\s*680px\)[\s\S]*?\.hero-demo::before\s*\{[\s\S]*?right:\s*0;[\s\S]*?left:\s*0;/);
  assert.match(workflow, /- assets\/annotator-connotator-overview\.png/);
  assert.match(workflow, /cp assets\/annotator-connotator-overview\.png _site\/assets\/annotator-connotator-overview\.png/);
});

test("the current ダメだった nuance demo remains in the deployed landing page", () => {
  assert.match(fixes, /ダメだった/);
  assert.match(fixes, /ニュアンス/);
  assert.match(workflow, /cp landing-fixes\.js _site\/landing-fixes\.js/);
  assert.match(workflow, /landing-fixes\.js/);
});

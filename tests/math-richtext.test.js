const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const math = require("../math-richtext.js");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

test("extractMath protects inline and display TeX before Markdown rendering", () => {
  const source = [
    "つまり、\\(x\\) が大きくなると、\\(y\\) は小さくなる。",
    "",
    "\\[",
    "y = \\frac{C}{x^a}",
    "\\]",
    "",
    "Zipfでは \\(f \\propto \\frac{1}{r}\\) です。",
  ].join("\n");
  const result = math.extractMath(source);
  assert.equal(result.items.length, 4);
  assert.deepEqual(result.items.map((item) => item.display), [false, false, true, false]);
  assert.equal(result.items[2].tex, "y = \\frac{C}{x^a}");
  assert.equal(result.items[3].tex, "f \\propto \\frac{1}{r}");
  assert.doesNotMatch(result.text, /\\frac\{C\}/);
  assert.match(result.text, /ACMATH2/);
});

test("inline code containing TeX delimiters is left literal", () => {
  const result = math.extractMath("`\\(literal\\)` and \\(rendered\\)");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].tex, "rendered");
  assert.match(result.text, /`\\\(literal\\\)`/);
});

test("malformed or empty TeX remains ordinary text", () => {
  assert.equal(math.extractMath("before \\(unfinished").items.length, 0);
  assert.equal(math.extractMath("\\(   \\)").items.length, 0);
});

test("math renderer is loaded after shared rich text and before saved-answer polish", () => {
  const client = read("client-analysis.js");
  const display = client.indexOf('loadScript("./display-settings-polish.js")');
  const mathIndex = client.indexOf('loadScript("./math-richtext.js")');
  const added = client.indexOf('loadScript("./additional-richtext-polish.js")');
  assert.ok(display >= 0 && mathIndex > display && added > mathIndex);
});

test("question observer delegates to the current shared rich-text renderer", () => {
  const source = read("display-settings-polish.js");
  assert.match(source, /const renderer = root\.AC_RICH_TEXT\?\.render \|\| renderRichText/);
  assert.match(source, /observer\.disconnect\(\)[\s\S]*renderer\(answer, raw\)[\s\S]*observer\.observe/);
});

test("math layer does not install a second question MutationObserver", () => {
  const source = read("math-richtext.js");
  assert.doesNotMatch(source, /mathRichTextObserverInstalled/);
  assert.doesNotMatch(source, /attributeFilter:\s*\["data-rich-text-source"\]/);
  assert.doesNotMatch(source, /installQuestionSync/);
});

test("math rendering keeps a safe raw-TeX fallback and avoids async DOM rewrites", () => {
  const source = read("math-richtext.js");
  assert.match(source, /trust:\s*false/);
  assert.match(source, /throwOnError:\s*true/);
  assert.match(source, /node\.textContent = item\.raw/);
  assert.match(source, /const katex = root\.katex/);
  assert.match(source, /ensureKatex\(root\)\.catch\(\(\) => \{\}\)/);
  assert.doesNotMatch(source, /ensureKatex\(root\)\.then\(\(katex\)/);
  assert.doesNotMatch(source, /\.innerHTML\s*=/);
});

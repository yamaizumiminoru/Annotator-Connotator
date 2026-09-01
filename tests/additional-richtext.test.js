const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("added explanation popups reuse the safe rich-text renderer", () => {
  const source = fs.readFileSync(path.join(root, "additional-richtext-polish.js"), "utf8");
  assert.match(source, /root\.AC_RICH_TEXT\?\.render/);
  assert.match(source, /item\?\.type === "additional"/);
  assert.match(source, /item\.answer \|\| item\.meaningJa/);
  assert.match(source, /note\.hidden = true/);
  assert.doesNotMatch(source, /innerHTML\s*=/);
});

test("added explanations in overlap dialogs are also rendered richly", () => {
  const source = fs.readFileSync(path.join(root, "additional-richtext-polish.js"), "utf8");
  assert.match(source, /\.badge\.additional/);
  assert.match(source, /annotation-stack-rich-answer/);
  assert.match(source, /renderInto\(content, stripAnswerPrefix\(answer\.textContent\)\)/);
});

test("popup visibility override does not resurrect fields explicitly marked hidden", () => {
  const source = fs.readFileSync(path.join(root, "additional-richtext-polish.js"), "utf8");
  assert.match(source, /\.popup-def\[hidden\]/);
  assert.match(source, /\.popup-pattern\[hidden\]/);
  assert.match(source, /\.popup-note\[hidden\]/);
  assert.match(source, /\.popup-ex\[hidden\]/);
  assert.match(source, /\.popup-nuances\[hidden\]/);
  assert.match(source, /display:none!important/);
});

test("client loads the added-explanation rich-text polish after the shared renderer", () => {
  const source = fs.readFileSync(path.join(root, "client-analysis.js"), "utf8");
  const renderer = source.indexOf('loadScript(".\/display-settings-polish.js")');
  const added = source.indexOf('loadScript(".\/additional-richtext-polish.js")');
  assert.ok(renderer >= 0);
  assert.ok(added > renderer);
});

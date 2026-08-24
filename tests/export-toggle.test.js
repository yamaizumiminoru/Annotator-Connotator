const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("JSON export control restores the JSON preview after Markdown", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const script = fs.readFileSync(path.join(root, "script.js"), "utf8");

  assert.match(script, /function renderExportJson\(\)[\s\S]*?JSON\.stringify\(state\.result, null, 2\)/);
  assert.match(script, /function copyMarkdown\(\)[\s\S]*?els\.exportText\.value = lines\.join\("\\n"\)/);
  assert.match(
    html,
    /document\.getElementById\("copyJsonBtn"\)\?\.addEventListener\("click", \(\) => \{[\s\S]*?renderExportJson\(\)/,
  );
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("All category filter toggles all categories off when already fully enabled", () => {
  const source = fs.readFileSync(path.join(root, "ui-polish.js"), "utf8");
  assert.match(source, /const allEnabled = enabledFilters\.size === filterDefinitions\.length/);
  assert.match(source, /if \(allEnabled\) enabledFilters\.clear\(\)/);
  assert.match(source, /else filterDefinitions\.forEach\(\(\{ key \}\) => enabledFilters\.add\(key\)\)/);
});

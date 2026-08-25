const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("client bootstrap migrates legacy level state and fixes the legacy discovery level to beginner", () => {
  const source = fs.readFileSync(path.join(root, "client-analysis.js"), "utf8");
  assert.match(source, /annotation\.levels/);
  assert.match(source, /annotation\.level", "beginner"/);
  assert.match(source, /reason-selection-client\.js/);
});

test("reason-selection client turns the old single-choice level control into three checkboxes", () => {
  const source = fs.readFileSync(path.join(root, "reason-selection-client.js"), "utf8");
  assert.match(source, /ensureLevelCheckboxes/);
  assert.match(source, /input\.type = "checkbox"/);
  assert.match(source, /\["beginner", "intermediate", "advanced"\]/);
  assert.match(source, /if \(!checked\.length\) event\.target\.checked = true/);
});

test("reason tags are shown in cards and popup and preserved in export handlers", () => {
  const source = fs.readFileSync(path.join(root, "reason-selection-client.js"), "utf8");
  assert.match(source, /reason-badge-group/);
  assert.match(source, /popupReasonTags/);
  assert.match(source, /reasonTags/);
  assert.match(source, /copyJsonBtn/);
  assert.match(source, /copyMarkdownBtn/);
});

test("runtime entrypoint patches legacy density selection and launch scripts use it", () => {
  const server = fs.readFileSync(path.join(root, "server-reason-selection.js"), "utf8");
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const launch = fs.readFileSync(path.join(root, "launch_app.ps1"), "utf8");
  assert.match(server, /selection\.selectAnnotationsByDensity = function selectReasonTaggedAnnotations/);
  assert.equal(pkg.scripts.start, "node server-reason-selection.js");
  assert.match(launch, /server-reason-selection\.js/);
});

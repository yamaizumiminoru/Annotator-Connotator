const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.join(__dirname, "..");
const browserImport = require(path.join(rootDir, "browser-import.js"));

test("browser import decodes selected text from the URL fragment", () => {
  const text = "PDF selection: ダメだった 😅";
  const hash = `#ac_text=${encodeURIComponent(text)}`;
  assert.equal(browserImport.importedTextFromHash(hash), text);
});

test("browser import fills the input, clears the fragment, and never starts analysis", () => {
  const events = [];
  const input = {
    value: "",
    dispatchEvent(event) { events.push(event.type); },
    focus() { events.push("focus"); },
  };
  const historyCalls = [];
  class FakeEvent {
    constructor(type) { this.type = type; }
  }
  const fakeRoot = {
    location: {
      hash: `#ac_text=${encodeURIComponent("selected passage")}`,
      pathname: "/",
      search: "?v=0.8.0",
    },
    document: {
      getElementById(id) { return id === "sourceText" ? input : null; },
    },
    history: {
      replaceState(...args) { historyCalls.push(args); },
    },
    Event: FakeEvent,
    setTimeout(fn) { fn(); },
  };

  assert.equal(browserImport.install(fakeRoot), true);
  assert.equal(input.value, "selected passage");
  assert.deepEqual(events, ["input", "change", "focus"]);
  assert.equal(historyCalls.length, 1);
  assert.equal(historyCalls[0][2], "/?v=0.8.0");
});

test("Chrome extension is a minimal selection-only Manifest V3 launcher", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, "chrome-extension", "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, "0.1.0");
  assert.deepEqual(manifest.permissions, ["contextMenus"]);
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(manifest.icons, {
    16: "icons/icon16.png",
    32: "icons/icon32.png",
    48: "icons/icon48.png",
    128: "icons/icon128.png",
  });
  for (const iconPath of Object.values(manifest.icons)) {
    assert.equal(fs.existsSync(path.join(rootDir, "chrome-extension", iconPath)), true);
  }

  const background = fs.readFileSync(path.join(rootDir, "chrome-extension", "background.js"), "utf8");
  assert.match(background, /contexts:\s*\["selection"\]/);
  assert.match(background, /info\.selectionText/);
  assert.match(background, /encodeURIComponent\(selectedText\)/);
  assert.match(background, /http:\/\/localhost:4174\//);
  assert.match(background, /chrome\.tabs\.create/);
  assert.doesNotMatch(background, /fetch\s*\(/);
});

test("client bootstrap loads the browser import bridge", () => {
  const source = fs.readFileSync(path.join(rootDir, "client-analysis.js"), "utf8");
  assert.match(source, /loadScript\("\.\/browser-import\.js"\)/);
});

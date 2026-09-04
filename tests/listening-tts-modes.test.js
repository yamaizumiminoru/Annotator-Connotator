const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const listening = require("../listening-tts-modes.js");
const root = path.join(__dirname, "..");

test("listening delivery modes are clear natural casual with natural default", () => {
  assert.deepEqual(listening.MODES, ["clear", "natural", "casual"]);
  assert.equal(listening.DEFAULT_MODE, "natural");
  assert.equal(listening.normalizeMode("CLEAR"), "clear");
  assert.equal(listening.normalizeMode("unknown"), "natural");
});

test("listening audio cache identity separates mode and custom delivery prompt", () => {
  const base = {
    text: "We could have just called him.",
    language: "en",
    model: "gpt-4o-mini-tts",
    voice: "cedar",
    speed: 1,
    mode: "natural",
    customInstructions: "",
  };
  const natural = listening.cacheMaterial(base);
  assert.equal(natural, listening.cacheMaterial({ ...base }));
  assert.notEqual(natural, listening.cacheMaterial({ ...base, mode: "clear" }));
  assert.notEqual(natural, listening.cacheMaterial({ ...base, mode: "casual" }));
  assert.notEqual(natural, listening.cacheMaterial({ ...base, customInstructions: "General American" }));
});

test("custom delivery prompt is trimmed and bounded", () => {
  assert.equal(listening.normalizeCustomInstructions("  General American  "), "General American");
  assert.equal(listening.normalizeCustomInstructions("x".repeat(4000)).length, listening.MAX_CUSTOM_INSTRUCTIONS);
});

test("listening UI exposes three mode buttons and an additive text prompt", () => {
  const source = fs.readFileSync(path.join(root, "listening-tts-modes.js"), "utf8");
  assert.match(source, /\["clear", "natural", "casual"\]/);
  assert.match(source, /tts-mode-group/);
  assert.match(source, /ttsCustomInstructions/);
  assert.match(source, /ttsPromptPlaceholder/);
  assert.match(source, /customInstructions/);
  assert.match(source, /annotation\.ttsMode/);
  assert.match(source, /annotation\.ttsCustomInstructions/);
});

test("listening client replaces legacy TTS buttons instead of stacking duplicate listeners", () => {
  const source = fs.readFileSync(path.join(root, "listening-tts-modes.js"), "utf8");
  assert.match(source, /controls\.replaceChildren\(deviceButton, aiButton, modeWrap, promptButton, voiceSelect, promptPanel\)/);
  assert.doesNotMatch(source, /innerHTML\s*=/);
});

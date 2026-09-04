const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const listening = require("../listening-tts-modes.js");
const root = path.join(__dirname, "..");

test("listening delivery modes are clear natural casual custom with natural default", () => {
  assert.deepEqual(listening.MODES, ["clear", "natural", "casual", "custom"]);
  assert.equal(listening.DEFAULT_MODE, "natural");
  assert.equal(listening.normalizeMode("CLEAR"), "clear");
  assert.equal(listening.normalizeMode("CUSTOM"), "custom");
  assert.equal(listening.normalizeMode("unknown"), "natural");
});

test("custom instructions are used only in Custom mode", () => {
  const prompt = "General American, relaxed conversation between friends.";
  assert.equal(listening.customInstructionsForMode("custom", prompt), prompt);
  assert.equal(listening.customInstructionsForMode("clear", prompt), "");
  assert.equal(listening.customInstructionsForMode("natural", prompt), "");
  assert.equal(listening.customInstructionsForMode("casual", prompt), "");
});

test("listening audio cache identity separates presets from Custom without prompt leakage", () => {
  const base = {
    text: "We could have just called him.",
    language: "en",
    model: "gpt-4o-mini-tts",
    voice: "cedar",
    speed: 1,
  };
  const natural = listening.cacheMaterial({ ...base, mode: "natural", customInstructions: "General American" });
  const naturalWithoutPrompt = listening.cacheMaterial({ ...base, mode: "natural", customInstructions: "" });
  const custom = listening.cacheMaterial({ ...base, mode: "custom", customInstructions: "General American" });
  assert.equal(natural, naturalWithoutPrompt);
  assert.notEqual(natural, listening.cacheMaterial({ ...base, mode: "clear" }));
  assert.notEqual(natural, listening.cacheMaterial({ ...base, mode: "casual" }));
  assert.notEqual(natural, custom);
});

test("changing the TTS prompt generation invalidates preset audio cache", () => {
  const base = {
    text: "I'll go over the main branches of linguistics.",
    language: "en",
    model: "gpt-4o-mini-tts",
    voice: "marin",
    speed: 1,
    mode: "casual",
  };
  const current = listening.cacheMaterial(base);
  assert.match(current, new RegExp(listening.TTS_PROMPT_VERSION));
  assert.notEqual(current, listening.cacheMaterial({ ...base, promptVersion: "next-prompt-generation" }));
});

test("changing Custom prompt text invalidates Custom audio cache", () => {
  const base = {
    text: "We could have just called him.",
    language: "en",
    model: "gpt-4o-mini-tts",
    voice: "cedar",
    speed: 1,
    mode: "custom",
  };
  const first = listening.cacheMaterial({ ...base, customInstructions: "Speak very slowly." });
  const second = listening.cacheMaterial({ ...base, customInstructions: "Speak very quickly." });
  assert.notEqual(first, second);
});

test("custom delivery prompt is trimmed and bounded", () => {
  assert.equal(listening.normalizeCustomInstructions("  General American  "), "General American");
  assert.equal(listening.normalizeCustomInstructions("x".repeat(4000)).length, listening.MAX_CUSTOM_INSTRUCTIONS);
});

test("listening UI exposes four mutually exclusive modes and shows the prompt only for Custom", () => {
  const source = fs.readFileSync(path.join(root, "listening-tts-modes.js"), "utf8");
  assert.match(source, /\["clear", "natural", "casual", "custom"\]/);
  assert.match(source, /tts-mode-group/);
  assert.match(source, /ttsCustomInstructions/);
  assert.match(source, /promptPanel\.hidden = savedMode !== "custom"/);
  assert.match(source, /mode === "custom" && !customInstructions/);
  assert.doesNotMatch(source, /ttsPromptButton/);
  assert.match(source, /annotation\.ttsMode/);
  assert.match(source, /annotation\.ttsCustomInstructions/);
});

test("listening client replaces legacy TTS buttons instead of stacking duplicate listeners", () => {
  const source = fs.readFileSync(path.join(root, "listening-tts-modes.js"), "utf8");
  assert.match(source, /controls\.replaceChildren\(deviceButton, aiButton, modeWrap, voiceSelect, promptPanel\)/);
  assert.doesNotMatch(source, /innerHTML\s*=/);
});
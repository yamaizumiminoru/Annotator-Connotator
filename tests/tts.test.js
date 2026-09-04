const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const client = require("../tts-client.js");
const server = require("../lib/tts-server.js");

const root = path.join(__dirname, "..");

test("device speech now uses normal 1.00 speed and AI speech uses GPT-4o mini TTS", () => {
  assert.equal(client.DEVICE_SPEECH_RATE, 1.0);
  assert.equal(client.AI_TTS_SPEED, 1.0);
  assert.equal(client.AI_TTS_MODEL, "gpt-4o-mini-tts");
  assert.equal(client.AI_TTS_DEFAULT_VOICE, "marin");
  assert.deepEqual(client.AI_TTS_VOICES, ["marin", "cedar"]);
});

test("documented AI speech language set is guarded before paid generation", () => {
  assert.equal(client.SUPPORTED_TTS_LANGUAGE_CODES.size, 57);
  assert.equal(server.SUPPORTED_TTS_LANGUAGE_CODES.size, 57);
  for (const code of ["en", "ja", "zh", "ko", "fr", "de", "es", "cy", "mi", "ur"]) {
    assert.equal(client.isSupportedTtsLanguage(code), true);
    assert.equal(server.isSupportedTtsLanguage(code), true);
  }
  for (const code of ["am", "bn", "eu", "gu", "ha", "ka", "km", "lo", "ml", "mt", "my", "pa", "te", "uz", "yo", "zu", "mn"]) {
    assert.equal(client.isSupportedTtsLanguage(code), false);
    assert.equal(server.isSupportedTtsLanguage(code), false);
  }
});

test("57 of the app's 74 catalog languages overlap the documented AI speech set", () => {
  const sandbox = {};
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, "languages.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(root, "client-analysis.js"), "utf8"), context);
  const codes = context.LANGUAGE_CATALOG.map((language) => language.code);
  assert.equal(codes.length, 74);
  const overlap = codes.filter((code) => client.SUPPORTED_TTS_LANGUAGE_CODES.has(code));
  assert.equal(overlap.length, 57);
});

test("AI speech chunks preserve the source exactly and stay under the conservative client limit", () => {
  const paragraph = "This is one sentence. Here is another sentence, with a little more detail.\n";
  const source = paragraph.repeat(100);
  const chunks = client.splitTextForTts(source);
  assert.ok(chunks.length > 1);
  assert.equal(chunks.join(""), source);
  assert.ok(chunks.every((chunk) => chunk.length <= client.AI_TTS_CHUNK_CHARS));
});

test("AI audio cache identity includes text, language, model, voice, speed, and instruction version", () => {
  const base = {
    text: "A short lesson.",
    language: "en",
    model: client.AI_TTS_MODEL,
    voice: "marin",
    speed: 1,
    instructionVersion: client.AI_TTS_INSTRUCTION_VERSION,
  };
  const first = client.cacheMaterial(base);
  assert.equal(first, client.cacheMaterial({ ...base }));
  assert.notEqual(first, client.cacheMaterial({ ...base, text: "A different lesson." }));
  assert.notEqual(first, client.cacheMaterial({ ...base, language: "ja" }));
  assert.notEqual(first, client.cacheMaterial({ ...base, voice: "cedar" }));
  assert.notEqual(first, client.cacheMaterial({ ...base, speed: 1.1 }));
  assert.notEqual(first, client.cacheMaterial({ ...base, instructionVersion: "v2" }));
});

test("server speech payload defaults to natural exact reading", () => {
  const payload = server.buildSpeechPayload({
    text: "Read this exactly.",
    voice: "cedar",
    model: "gpt-4o-mini-tts",
    speed: 1,
    language: "en",
  });
  assert.equal(payload.model, "gpt-4o-mini-tts");
  assert.equal(payload.input, "Read this exactly.");
  assert.equal(payload.voice, "cedar");
  assert.equal(payload.speed, 1);
  assert.equal(payload.response_format, "mp3");
  assert.match(payload.instructions, /exactly as written/i);
  assert.match(payload.instructions, /weak forms/i);
  assert.match(payload.instructions, /lexical content unchanged/i);
  assert.equal(server.normalizeVoice("not-a-voice"), "marin");
  assert.equal(server.MAX_TTS_INPUT_CHARS, 4096);
});

test("server provides distinct clear, natural, and casual delivery instructions", () => {
  const clear = server.buildSpeechInstructions({ mode: "clear", language: "en" });
  const natural = server.buildSpeechInstructions({ mode: "natural", language: "en" });
  const casual = server.buildSpeechInstructions({ mode: "casual", language: "en" });
  assert.match(clear, /slightly relaxed pace/i);
  assert.match(clear, /phrase boundaries/i);
  assert.match(natural, /normal pace/i);
  assert.match(natural, /weak forms/i);
  assert.match(casual, /spontaneous conversational/i);
  assert.match(casual, /flapping/i);
  assert.match(casual, /H-dropping/i);
  assert.match(casual, /do not merely read the text faster/i);
  assert.notEqual(clear, natural);
  assert.notEqual(natural, casual);
});

test("English-specific connected-speech instructions are not imposed on other languages", () => {
  const english = server.buildSpeechInstructions({ mode: "casual", language: "en" });
  const japanese = server.buildSpeechInstructions({ mode: "casual", language: "ja" });
  assert.match(english, /H-dropping/i);
  assert.match(english, /flapping/i);
  assert.doesNotMatch(japanese, /H-dropping/i);
  assert.doesNotMatch(japanese, /flapping/i);
  assert.match(japanese, /language's natural reductions/i);
});

test("Custom replaces preset delivery instructions instead of being added to them", () => {
  const custom = "General American, relaxed conversation between friends.";
  const instructions = server.buildSpeechInstructions({ mode: "custom", customInstructions: custom, language: "en" });
  assert.match(instructions, /instead of any preset delivery style/i);
  assert.match(instructions, /General American/);
  assert.match(instructions, /lexical content unchanged/i);
  assert.doesNotMatch(instructions, /slightly relaxed pace/i);
  assert.doesNotMatch(instructions, /ordinary fluent conversational delivery/i);
  assert.doesNotMatch(instructions, /spontaneous conversational delivery/i);
  assert.doesNotMatch(instructions, /H-dropping/i);
  assert.equal(server.normalizeTtsMode("CUSTOM"), "custom");
  assert.equal(server.normalizeTtsMode("unknown"), "natural");
  assert.equal(server.normalizeCustomInstructions("x".repeat(5000)).length, server.MAX_TTS_CUSTOM_INSTRUCTIONS_CHARS);
});

test("preset modes ignore a supplied custom prompt at the server instruction layer", () => {
  const instructions = server.buildSpeechInstructions({
    mode: "clear",
    customInstructions: "Speak extremely fast with heavy reductions.",
    language: "en",
  });
  assert.match(instructions, /slightly relaxed pace/i);
  assert.doesNotMatch(instructions, /extremely fast/i);
});

test("unsupported-language errors are UI messages, with Japanese and English fallbacks", () => {
  assert.match(client.UI_ADDITIONS.ja.ttsLanguageUnsupported, /端末音声/);
  assert.match(client.UI_ADDITIONS.en.ttsLanguageUnsupported, /device speech/i);
  assert.match(client.UI_ADDITIONS.ja.ttsLanguageUnsupported, /\{language\}/);
  assert.match(client.UI_ADDITIONS.en.ttsLanguageUnsupported, /\{language\}/);
});

test("client enhancement loads listening modes immediately after base TTS", () => {
  const source = fs.readFileSync(path.join(root, "client-analysis.js"), "utf8");
  const ttsIndex = source.indexOf('loadScript("./tts-client.js")');
  const listeningIndex = source.indexOf('loadScript("./listening-tts-modes.js")');
  const localizationIndex = source.indexOf('loadScript("./reason-ui-localization.js")');
  assert.ok(ttsIndex >= 0);
  assert.ok(listeningIndex > ttsIndex);
  assert.ok(localizationIndex > listeningIndex);
});
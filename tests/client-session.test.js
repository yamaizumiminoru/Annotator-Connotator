const test = require("node:test");
const assert = require("node:assert/strict");
const {
  UI_ADDITIONS,
  extractResultFromNdjson,
  formatUsageMetadata,
  shortModelName,
} = require("../client-session.js");

test("shortModelName presents Luna and Sol compactly", () => {
  assert.equal(shortModelName("gpt-5.6-luna"), "Luna");
  assert.equal(shortModelName("gpt-5.6-sol"), "Sol");
  assert.equal(shortModelName("custom-model"), "custom-model");
});

test("formatUsageMetadata includes model, mode, chunks, and token totals", () => {
  const rendered = formatUsageMetadata({
    model: "gpt-5.6-luna",
    analysisMode: "standard",
    chunkCount: 3,
    usage: {
      input_tokens: 4820,
      output_tokens: 3110,
      total_tokens: 7930,
    },
  }, UI_ADDITIONS.en, "en-US");

  assert.equal(
    rendered,
    "Luna · standard · 3 sections · input 4,820 · output 3,110 · total 7,930 tokens",
  );
});

test("formatUsageMetadata degrades gracefully when usage is missing", () => {
  assert.equal(formatUsageMetadata({ model: "gpt-5.6-luna" }), "");
  assert.equal(formatUsageMetadata(null), "");
});

test("extractResultFromNdjson returns the final result event", () => {
  const result = extractResultFromNdjson([
    JSON.stringify({ type: "progress", current: 1, total: 2 }),
    JSON.stringify({ type: "result", result: { _api: { model: "gpt-5.6-sol" } } }),
    "",
  ].join("\n"));
  assert.equal(result._api.model, "gpt-5.6-sol");
});

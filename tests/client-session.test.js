const test = require("node:test");
const assert = require("node:assert/strict");
const {
  UI_ADDITIONS,
  applyDensityToCachedResult,
  cacheMaterialString,
  extractResultFromNdjson,
  forceRefreshInit,
  formatUsageMetadata,
  selectCandidatesByDensity,
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

test("forced re-analysis also bypasses the server-side candidate cache", () => {
  const signal = new AbortController().signal;
  const init = {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal,
    body: JSON.stringify({ text: "A useful passage.", density: 2 }),
  };
  const forced = forceRefreshInit(init, JSON.parse(init.body));

  assert.notEqual(forced, init);
  assert.equal(forced.signal, signal);
  assert.equal(forced.headers, init.headers);
  assert.deepEqual(JSON.parse(forced.body), {
    text: "A useful passage.",
    density: 2,
    forceRefresh: true,
  });
  assert.equal(JSON.parse(init.body).forceRefresh, undefined);
});

test("cache material ignores density but changes with model and analytical settings", () => {
  const base = {
    text: "A sufficiently useful test passage.",
    sourceLanguage: "en",
    explanationLanguage: "ja",
    analysisMode: "standard",
    level: "intermediate",
    focus: "all",
    includeGrammar: true,
    includeSlash: true,
    density: 1,
  };
  const low = cacheMaterialString(base, "gpt-5.6-luna");
  const high = cacheMaterialString({ ...base, density: 3 }, "gpt-5.6-luna");
  const advanced = cacheMaterialString({ ...base, level: "advanced" }, "gpt-5.6-luna");
  const sol = cacheMaterialString(base, "gpt-5.6-sol");

  assert.equal(low, high);
  assert.notEqual(low, advanced);
  assert.notEqual(low, sol);
});

test("density selection reuses one ranked candidate pool monotonically", () => {
  const candidates = [
    { id: "a1", start: 80, end: 82, priority: 1, reliability: "high" },
    { id: "a2", start: 10, end: 12, priority: 5, reliability: "high" },
    { id: "a3", start: 30, end: 32, priority: 4, reliability: "medium" },
    { id: "a4", start: 50, end: 52, priority: 3, reliability: "high" },
    { id: "a5", start: 70, end: 72, priority: 2, reliability: "medium" },
  ];
  const low = selectCandidatesByDensity(candidates, 1).map((item) => item.id);
  const standard = selectCandidatesByDensity(candidates, 2).map((item) => item.id);
  const high = selectCandidatesByDensity(candidates, 3).map((item) => item.id);

  assert.ok(low.every((id) => standard.includes(id)));
  assert.ok(standard.every((id) => high.includes(id)));
  assert.equal(low.length, 2);
  assert.equal(standard.length, 4);
  assert.equal(high.length, 5);
});

test("cached result can be re-filtered by density without exposing selection internals", () => {
  const result = {
    annotations: [],
    _selection: {
      version: "analysis-v1",
      candidates: [
        { id: "a1", text: "one", start: 0, end: 3, priority: 5, reliability: "high" },
        { id: "a2", text: "two", start: 4, end: 7, priority: 4, reliability: "high" },
        { id: "a3", text: "three", start: 8, end: 13, priority: 3, reliability: "medium" },
        { id: "a4", text: "four", start: 14, end: 18, priority: 2, reliability: "medium" },
        { id: "a5", text: "five", start: 19, end: 23, priority: 1, reliability: "low" },
      ],
    },
    _api: {
      model: "gpt-5.6-luna",
      analysisMode: "standard",
      usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
    },
  };

  const cached = applyDensityToCachedResult(result, 1);
  assert.equal(cached.annotations.length, 2);
  assert.equal(cached._api.localCache, true);
  assert.equal(cached._api.density, "low");
  assert.ok(cached.annotations.every((item) => !("priority" in item) && !("reliability" in item)));
});

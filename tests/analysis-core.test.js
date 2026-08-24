const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CACHE_SCHEMA_VERSION,
  cacheMaterial,
  mergeUsage,
  stableSerialize,
} = require("../lib/analysis-core");

test("aggregates model and repair usage without losing detail counters", () => {
  assert.deepEqual(mergeUsage([{ input_tokens: 10, output_tokens: 4, total_tokens: 14 }, {
    input_tokens: 5,
    output_tokens: 3,
    total_tokens: 8,
    input_tokens_details: { cached_tokens: 2 },
    output_tokens_details: { reasoning_tokens: 1 },
  }]), {
    input_tokens: 15,
    output_tokens: 7,
    total_tokens: 22,
    input_tokens_details: { cached_tokens: 2 },
    output_tokens_details: { reasoning_tokens: 1 },
  });
  assert.equal(mergeUsage([]), null);
});

test("cache material ignores display-only density but includes model-affecting settings", () => {
  const base = {
    text: "A passage",
    sourceLanguage: "en",
    explanationLanguage: "ja",
    level: "intermediate",
    focus: "all",
    includeGrammar: true,
    includeSlash: true,
    analysisMode: "standard",
    model: "gpt-5.6-luna",
  };
  const low = stableSerialize(cacheMaterial({ ...base, density: 1, nuanceDetail: 1 }));
  const high = stableSerialize(cacheMaterial({ ...base, density: 3, nuanceDetail: 3 }));
  const precise = stableSerialize(cacheMaterial({ ...base, analysisMode: "precise", model: "gpt-5.6-sol" }));
  const nextSchema = stableSerialize(cacheMaterial({ ...base, version: `${CACHE_SCHEMA_VERSION}-next` }));

  assert.equal(low, high);
  assert.notEqual(low, precise);
  assert.notEqual(low, nextSchema);
});

test("stable serialization is independent of object property order", () => {
  assert.equal(stableSerialize({ b: 2, a: { d: 4, c: 3 } }), stableSerialize({ a: { c: 3, d: 4 }, b: 2 }));
});

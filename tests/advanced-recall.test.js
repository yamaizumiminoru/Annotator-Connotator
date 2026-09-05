const test = require("node:test");
const assert = require("node:assert/strict");

const reasonSelection = require("../lib/reason-selection");
const advancedRecall = require("../server-advanced-recall");

function judgedCandidate(id, text, type, overrides = {}) {
  return {
    id,
    text,
    type,
    start: overrides.start ?? Number(id.replace(/\D/g, "")) * 20,
    end: overrides.end ?? Number(id.replace(/\D/g, "")) * 20 + text.length,
    judgeMeta: {
      componentLexicalBand: overrides.lexical || "intermediate",
      lexicalTriggerWords: overrides.triggers || [],
      contextualMeaningBand: overrides.contextual || "intermediate",
      domainTerm: overrides.domain === true,
      domainTermConfidence: overrides.domainConfidence || "high",
      annotationValueByBand: overrides.values || {
        beginner: "low",
        intermediate: "low",
        advanced: "low",
      },
      meaningType: overrides.meaningType || "literal_lexical",
      confidence: overrides.confidence || "high",
      reason: "fixture",
    },
  };
}

test("judge prompt protects advanced literal words and introduced domain terms", () => {
  const prompt = advancedRecall.strengthenJudgePrompt("base prompt");
  assert.match(prompt, /genuinely C1-C2\+ lexical burden/i);
  assert.match(prompt, /domain term that is explicitly introduced, named, defined, contrasted/i);
  assert.match(prompt, /called X/);
  assert.match(prompt, /not to basic constructions, collocations, or formulas/i);
});

test("discovery prompt explicitly scans for missed advanced words and named terms", () => {
  const prompt = advancedRecall.strengthenDiscoveryPrompt("base prompt");
  assert.match(prompt, /standalone advanced lexical items/i);
  assert.match(prompt, /rare, formal, academic, historical, technical/i);
  assert.match(prompt, /linguists call X/);
  assert.match(prompt, /quotations, historical passages/i);
  assert.match(prompt, /Do not pad with ordinary B1-B2 literal vocabulary/i);
});

test("advanced lexical words are rescued at standard density even if judge value is too low", () => {
  const philologer = judgedCandidate("a1", "philologer", "word", {
    lexical: "advanced",
    triggers: ["philologer"],
  });
  assert.equal(advancedRecall.isAdvancedRecallCandidate(philologer, 2, ["advanced"]), true);
  assert.equal(advancedRecall.isAdvancedRecallCandidate(philologer, 1, ["advanced"]), false);
  assert.equal(advancedRecall.isAdvancedRecallCandidate(philologer, 2, ["intermediate"]), false);
});

test("useful domain terms are rescued without reviving simple multiword patterns", () => {
  const phoneme = judgedCandidate("a1", "phoneme", "term", {
    lexical: "intermediate",
    contextual: "intermediate",
    domain: true,
    meaningType: "domain_term",
  });
  const whenConstruction = judgedCandidate("a2", "when contact intensifies", "construction", {
    lexical: "advanced",
    triggers: ["intensifies"],
    contextual: "beginner",
    values: { beginner: "high", intermediate: "low", advanced: "low" },
    meaningType: "reusable_construction",
  });
  const collocation = judgedCandidate("a3", "more prestigious language", "collocation", {
    lexical: "advanced",
    triggers: ["prestigious"],
    contextual: "intermediate",
    values: { beginner: "low", intermediate: "medium", advanced: "low" },
    meaningType: "compositional_phrase",
  });

  assert.equal(advancedRecall.isAdvancedRecallCandidate(phoneme, 2, ["advanced"]), true);
  assert.equal(advancedRecall.isAdvancedRecallCandidate(whenConstruction, 2, ["advanced"]), false);
  assert.equal(advancedRecall.isAdvancedRecallCandidate(collocation, 2, ["advanced"]), false);
});

test("merge restores only the advanced lexical/term misses and preserves source order", () => {
  const kept = judgedCandidate("a1", "duality of patterning", "term", {
    domain: true,
    values: { beginner: "low", intermediate: "medium", advanced: "high" },
    start: 100,
    end: 120,
  });
  const missedWord = judgedCandidate("a2", "philologer", "word", {
    lexical: "advanced",
    triggers: ["philologer"],
    start: 40,
    end: 50,
  });
  const basicConstruction = judgedCandidate("a3", "when contact intensifies", "construction", {
    lexical: "advanced",
    triggers: ["intensifies"],
    contextual: "beginner",
    meaningType: "reusable_construction",
    start: 60,
    end: 85,
  });

  const baseline = reasonSelection.selectAnnotationsByDensity([kept, missedWord, basicConstruction], 2, ["advanced"]);
  const merged = advancedRecall.mergeAdvancedRecall(baseline, [kept, missedWord, basicConstruction], 2, ["advanced"]);
  assert.deepEqual(merged.map((item) => item.id), ["a2", "a1"]);
});

test("server patch installation is idempotent", () => {
  assert.doesNotThrow(() => advancedRecall.installAdvancedRecallPatch());
  assert.doesNotThrow(() => advancedRecall.installAdvancedRecallPatch());
});

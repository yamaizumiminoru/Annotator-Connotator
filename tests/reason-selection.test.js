const test = require("node:test");
const assert = require("node:assert/strict");
const {
  prepareCandidate,
  reasonProfile,
  selectAnnotationsByDensity,
  visibleReasonTags,
} = require("../lib/reason-selection");

function candidate(id, text, overrides = {}) {
  return {
    id,
    text,
    type: overrides.type || "word",
    start: overrides.start ?? Number(id.replace(/\D/g, "")) * 10,
    end: overrides.end ?? Number(id.replace(/\D/g, "")) * 10 + text.length,
    priority: overrides.priority ?? 3,
    reliability: "high",
    judgeMeta: {
      componentLexicalBand: overrides.lexical || "intermediate",
      lexicalTriggerWords: overrides.triggers || [],
      contextualMeaningBand: overrides.contextual || "intermediate",
      domainTerm: overrides.domain === true,
      domainTermConfidence: overrides.domainConfidence || "high",
      annotationValueByBand: overrides.values || {
        beginner: "low",
        intermediate: "medium",
        advanced: "medium",
      },
      meaningType: overrides.meaningType || "literal_lexical",
      confidence: "high",
      reason: "fixture",
    },
  };
}

test("derives multiple user-facing reasons without forcing exclusive categories", () => {
  const brain = candidate("a1", "brain plasticity", {
    type: "term",
    lexical: "advanced",
    triggers: ["plasticity"],
    contextual: "advanced",
    domain: true,
    meaningType: "domain_term",
    values: { beginner: "low", intermediate: "medium", advanced: "high" },
  });
  assert.deepEqual(reasonProfile(brain, ["advanced"]).tags, ["難語", "術語"]);
});

test("keeps extended senses for advanced learners while familiar discourse markers can fall away", () => {
  const stay = candidate("a1", "stay with you", {
    type: "formula",
    lexical: "beginner",
    contextual: "intermediate",
    meaningType: "metaphorical_or_extended_sense",
    values: { beginner: "medium", intermediate: "high", advanced: "medium" },
  });
  const otherHand = candidate("a2", "on the other hand", {
    type: "formula",
    lexical: "beginner",
    contextual: "intermediate",
    meaningType: "discourse_marker",
    values: { beginner: "medium", intermediate: "high", advanced: "medium" },
  });
  const standard = selectAnnotationsByDensity([stay, otherHand], 2, ["advanced"]);
  assert.deepEqual(standard.map((item) => item.text), ["stay with you"]);
  assert.deepEqual(standard[0].reasonTags, ["慣用表現"]);
});

test("recognizes technical terms and reusable constructions as separate reasons", () => {
  const twoWord = candidate("a1", "two-word stage", {
    type: "term",
    lexical: "beginner",
    contextual: "advanced",
    domain: true,
    meaningType: "domain_term",
    values: { beginner: "low", intermediate: "medium", advanced: "high" },
  });
  const construction = candidate("a2", "misleading to think of A as B", {
    type: "construction",
    lexical: "intermediate",
    contextual: "advanced",
    meaningType: "reusable_construction",
    values: { beginner: "low", intermediate: "medium", advanced: "high" },
  });
  assert.deepEqual(reasonProfile(twoWord, ["advanced"]).tags, ["術語"]);
  assert.deepEqual(reasonProfile(construction, ["advanced"]).tags, ["構文"]);
});

test("display tags suppress reasons already conveyed by the primary annotation type", () => {
  assert.deepEqual(visibleReasonTags({ type: "construction" }, ["構文"]), []);
  assert.deepEqual(visibleReasonTags({ type: "term" }, ["難語", "術語"]), ["難語"]);
  assert.deepEqual(visibleReasonTags({ type: "idiom" }, ["慣用表現"]), []);
  assert.deepEqual(visibleReasonTags({ type: "formula" }, ["慣用表現"]), ["慣用表現"]);
});

test("prepared candidates retain reason codes while removing redundant visible tags", () => {
  const construction = candidate("a1", "would have been better if", {
    type: "construction",
    contextual: "advanced",
    meaningType: "reusable_construction",
    values: { beginner: "low", intermediate: "medium", advanced: "high" },
  });
  const prepared = prepareCandidate(construction, ["advanced"]);
  assert.deepEqual(prepared.reasonTags, []);
  assert.ok(prepared.selectionReasonCodes.includes("reusable-construction"));
});

test("density is a soft value threshold rather than a fixed 40/70/100 percent quota", () => {
  const candidates = [
    candidate("a1", "high idiom", {
      type: "idiom",
      meaningType: "idiom",
      values: { beginner: "low", intermediate: "low", advanced: "high" },
    }),
    candidate("a2", "medium extended", {
      type: "formula",
      meaningType: "metaphorical_or_extended_sense",
      values: { beginner: "low", intermediate: "low", advanced: "medium" },
    }),
    candidate("a3", "medium discourse", {
      type: "formula",
      meaningType: "discourse_marker",
      values: { beginner: "low", intermediate: "high", advanced: "medium" },
    }),
    candidate("a4", "low compositional", {
      type: "collocation",
      meaningType: "compositional_phrase",
      values: { beginner: "low", intermediate: "low", advanced: "low" },
    }),
    candidate("a5", "high lexical", {
      type: "word",
      lexical: "advanced",
      meaningType: "literal_lexical",
      values: { beginner: "low", intermediate: "medium", advanced: "high" },
    }),
  ];
  const low = selectAnnotationsByDensity(candidates, 1, ["advanced"]);
  const standard = selectAnnotationsByDensity(candidates, 2, ["advanced"]);
  const high = selectAnnotationsByDensity(candidates, 3, ["advanced"]);

  assert.deepEqual(low.map((item) => item.id), ["a1", "a5"]);
  assert.deepEqual(standard.map((item) => item.id), ["a1", "a2", "a5"]);
  assert.deepEqual(high.map((item) => item.id), ["a1", "a2", "a3", "a5"]);
  assert.ok(low.every((item) => standard.some((other) => other.id === item.id)));
  assert.ok(standard.every((item) => high.some((other) => other.id === item.id)));
  assert.notEqual(standard.length, Math.ceil(candidates.length * 0.7));
});

test("multiple checked learner bands use union-style pedagogical value", () => {
  const beginnerOnly = candidate("a1", "basic target", {
    lexical: "beginner",
    values: { beginner: "high", intermediate: "low", advanced: "low" },
  });
  const advancedOnly = candidate("a2", "advanced target", {
    lexical: "advanced",
    values: { beginner: "low", intermediate: "low", advanced: "high" },
  });
  const selected = selectAnnotationsByDensity([beginnerOnly, advancedOnly], 2, ["beginner", "advanced"]);
  assert.deepEqual(selected.map((item) => item.id), ["a1", "a2"]);
});

test("judge failure falls back to priority thresholds without percentage slicing", () => {
  const candidates = [
    { id: "a1", text: "p5", start: 0, end: 2, priority: 5 },
    { id: "a2", text: "p4", start: 3, end: 5, priority: 4 },
    { id: "a3", text: "p2", start: 6, end: 8, priority: 2 },
  ];
  assert.deepEqual(selectAnnotationsByDensity(candidates, 1, ["advanced"]).map((x) => x.id), ["a1"]);
  assert.deepEqual(selectAnnotationsByDensity(candidates, 2, ["advanced"]).map((x) => x.id), ["a1", "a2"]);
  assert.deepEqual(selectAnnotationsByDensity(candidates, 3, ["advanced"]).map((x) => x.id), ["a1", "a2", "a3"]);
});
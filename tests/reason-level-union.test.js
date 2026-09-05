const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeJudgeMeta,
  selectAnnotationsByDensity,
} = require("../lib/reason-selection");

function primaryCandidate(level, text, index) {
  return {
    id: `a${index + 1}`,
    text,
    type: "word",
    start: index * 30,
    end: index * 30 + text.length,
    judgeMeta: {
      primaryLearnerBand: level,
      componentLexicalBand: level,
      lexicalTriggerWords: [],
      contextualMeaningBand: level,
      domainTerm: false,
      domainTermConfidence: "high",
      // Deliberately make every band look educationally useful. The primary
      // band, not cross-band usefulness, must control level filtering.
      annotationValueByBand: {
        beginner: "high",
        intermediate: "high",
        advanced: "high",
      },
      meaningType: "literal_lexical",
      confidence: "high",
      reason: "fixture",
    },
  };
}

const values = [
  ["beginner", "beginner target"],
  ["intermediate", "intermediate target"],
  ["advanced", "advanced target"],
];
const candidates = values.map(([level, text], index) => primaryCandidate(level, text, index));

test("a single checked level selects only candidates whose primary band matches", () => {
  for (const [level, text] of values) {
    assert.deepEqual(
      selectAnnotationsByDensity(candidates, 3, [level]).map((item) => item.text),
      [text],
    );
  }
});

test("multiple independent level checkboxes select the union of primary bands", () => {
  assert.deepEqual(
    selectAnnotationsByDensity(candidates, 3, ["beginner", "advanced"]).map((item) => item.text),
    ["beginner target", "advanced target"],
  );
  assert.deepEqual(
    selectAnnotationsByDensity(candidates, 3, ["beginner", "intermediate", "advanced"]).map((item) => item.text),
    values.map(([, text]) => text),
  );
});

test("legacy judge metadata without primaryLearnerBand gets a stable inferred primary band", () => {
  const normalized = normalizeJudgeMeta({
    componentLexicalBand: "advanced",
    contextualMeaningBand: "intermediate",
    domainTerm: false,
    domainTermConfidence: "high",
    annotationValueByBand: {
      beginner: "low",
      intermediate: "high",
      advanced: "medium",
    },
    meaningType: "literal_lexical",
    confidence: "high",
  });
  assert.equal(normalized.primaryLearnerBand, "intermediate");
});

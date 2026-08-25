const test = require("node:test");
const assert = require("node:assert/strict");
const { selectAnnotationsByDensity } = require("../lib/reason-selection");

test("three independent level checkboxes can all contribute candidates at once", () => {
  const values = [
    ["beginner", "beginner target"],
    ["intermediate", "intermediate target"],
    ["advanced", "advanced target"],
  ];
  const candidates = values.map(([level, text], index) => ({
    id: `a${index + 1}`,
    text,
    type: "word",
    start: index * 30,
    end: index * 30 + text.length,
    judgeMeta: {
      componentLexicalBand: level,
      lexicalTriggerWords: [],
      contextualMeaningBand: level,
      domainTerm: false,
      domainTermConfidence: "high",
      annotationValueByBand: {
        beginner: level === "beginner" ? "high" : "low",
        intermediate: level === "intermediate" ? "high" : "low",
        advanced: level === "advanced" ? "high" : "low",
      },
      meaningType: "literal_lexical",
      confidence: "high",
      reason: "fixture",
    },
  }));

  assert.deepEqual(
    selectAnnotationsByDensity(candidates, 2, ["beginner", "intermediate", "advanced"]).map((item) => item.text),
    values.map(([, text]) => text),
  );
});

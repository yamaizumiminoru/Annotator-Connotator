const test = require("node:test");
const assert = require("node:assert/strict");
const { repairAnnotationOffsets } = require("../lib/annotation-normalization");
const { mergeUniqueNonOverlappingAnnotations } = require("../lib/annotation-selection");
const { flattenRegionalAnnotations } = require("../lib/regional-discovery");
const { applyJudgments, buildJudgeItems } = require("../lib/reason-judge");
const { mergeChunkResults } = require("../lib/long-form");
const { selectAnnotationsByDensity } = require("../lib/reason-selection");

const cases = [
  {
    level: "beginner", language: "en", prelude: "Opening. ",
    broad: "The dog is sleeping", target: "dog", type: "word",
  },
  {
    level: "intermediate", language: "es", prelude: "Inicio. ",
    broad: "a pesar de la lluvia", target: "a pesar de", type: "formula",
  },
  {
    level: "advanced", language: "ja", prelude: "前文。",
    broad: "形態素の組み合わせ", target: "形態素", type: "term",
  },
];

for (const fixture of cases) {
  test(`${fixture.level} nested target survives regional repair, judging, and long-form merge`, () => {
    const section = fixture.prelude + fixture.broad;
    const source = "🙂\n" + section;
    const targetStart = fixture.broad.indexOf(fixture.target);
    const target = {
      id: "nested", text: fixture.target, type: fixture.type,
      start: targetStart, end: targetStart + fixture.target.length,
    };
    const flattened = flattenRegionalAnnotations(section, [{
      index: 0, start: 0, end: fixture.prelude.length, text: fixture.prelude,
    }, {
      index: 1, start: fixture.prelude.length, end: section.length, text: fixture.broad,
    }], [{
      regionIndex: 1, annotations: [],
    }, {
      regionIndex: 2,
      annotations: [{
        id: "broad", text: fixture.broad, type: "construction",
        pattern: "a more familiar construction", start: 0, end: fixture.broad.length,
      }, target, { ...target }],
    }]);

    assert.equal(flattened.annotations.length, 2, "only the exact duplicate is removed");
    const judgeItems = buildJudgeItems(section, flattened.annotations);
    assert.ok(judgeItems.some((item) => item.text === fixture.target), "judge receives the nested target");
    // The judge's pedagogical decisions are controlled here: the surrounding
    // construction is unhelpful for this band, while the nested target is useful.
    const judgments = judgeItems.map((item) => ({
      id: item.id,
      componentLexicalBand: fixture.level,
      contextualMeaningBand: item.text === fixture.target ? fixture.level : "beginner",
      domainTerm: fixture.type === "term" && item.text === fixture.target,
      domainTermConfidence: "high",
      annotationValueByBand: {
        beginner: "low", intermediate: "low", advanced: "low",
        [fixture.level]: item.text === fixture.target ? "high" : "low",
      },
      meaningType: item.text === fixture.broad ? "reusable_construction"
        : fixture.type === "term" ? "domain_term"
          : fixture.type === "formula" ? "idiom" : "literal_lexical",
      confidence: "high",
    }));
    const judged = applyJudgments(flattened.annotations, judgments, [fixture.level]);
    const normalized = mergeUniqueNonOverlappingAnnotations([], repairAnnotationOffsets(section, judged));
    const merged = mergeChunkResults(source, [{
      chunk: { index: 0, start: 0, end: 3, text: source.slice(0, 3) },
      result: { sourceLanguage: fixture.language, annotations: [] },
    }, {
      chunk: { index: 1, start: 3, end: source.length, text: section },
      result: { sourceLanguage: fixture.language, annotations: normalized },
    }]);

    assert.equal(merged.result.annotations.length, 2, "merge preserves both decisions until selection");
    for (const density of [1, 2, 3]) {
      const selected = selectAnnotationsByDensity(merged.result.annotations, density, [fixture.level]);
      assert.deepEqual(selected.map((item) => item.text), [fixture.target]);
      assert.equal(selected[0].start, 3 + fixture.prelude.length + targetStart);
      assert.equal(source.slice(selected[0].start, selected[0].end), fixture.target);
    }
  });
}

test("same-span distinct teaching types survive while duplicates stay at their original occurrence", () => {
  const source = "faire face, puis faire face";
  const candidates = [
    { text: "faire face", type: "collocation", start: 0, end: 10 },
    { text: "faire face", type: "construction", pattern: "faire + noun", start: 0, end: 10 },
    { text: "faire face", type: "collocation", start: 0, end: 10 },
  ];
  const merged = mergeUniqueNonOverlappingAnnotations([], repairAnnotationOffsets(source, candidates));

  assert.equal(merged.length, 2);
  assert.deepEqual(merged.map((item) => item.type), ["collocation", "construction"]);
  assert.ok(merged.every((item) => item.start === 0 && item.end === 10));
});

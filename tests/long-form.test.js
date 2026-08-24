const test = require("node:test");
const assert = require("node:assert/strict");
const fixtures = require("./fixtures/long-form-cases.json");
const {
  AnalysisCancelledError,
  PartialAnalysisError,
  mergeChunkResults,
  runChunkPipeline,
  splitTextRanges,
} = require("../lib/long-form");
const { selectAnnotationsByDensity } = require("../lib/annotation-selection");

function fixtureText(name) {
  const fixture = fixtures[name];
  return Array.from({ length: fixture.repeat }, (_, index) => (
    `Section ${index + 1}\n${fixture.sections[index % fixture.sections.length]}`
  )).join("\n\n");
}

test("splits realistic English and Japanese long-form fixtures without losing source text", () => {
  for (const name of ["english", "japanese"]) {
    const source = fixtureText(name);
    const chunks = splitTextRanges(source, 1800);
    assert.ok(source.length > 20_000, `${name} fixture must exceed the old limit`);
    assert.ok(chunks.length > 2);
    assert.equal(chunks.map((chunk) => chunk.text).join(""), source);
    assert.equal(chunks[0].start, 0);
    assert.equal(chunks.at(-1).end, source.length);
    chunks.forEach((chunk, index) => {
      assert.equal(chunk.index, index);
      assert.equal(source.slice(chunk.start, chunk.end), chunk.text);
      assert.ok(chunk.text.length <= 1800);
      if (index > 0) assert.equal(chunks[index - 1].end, chunk.start);
    });
  }
});

test("prefers Japanese sentence boundaries even when punctuation is not followed by whitespace", () => {
  const source = "これは第一文です。これは第二文です。これは第三文です。";
  const chunks = splitTextRanges(source, 13);

  assert.ok(chunks.length > 1);
  assert.equal(chunks.map((chunk) => chunk.text).join(""), source);
  chunks.slice(0, -1).forEach((chunk) => assert.match(chunk.text, /[。！？]$/));
});

test("supplies neighboring context without mixing it into the chunk offset space", () => {
  const source = `${"Opening context. ".repeat(80)}Boundary-adjacent target appears here. ${"Later context. ".repeat(80)}`;
  const chunks = splitTextRanges(source, 900);
  const targetChunk = chunks.find((chunk) => chunk.text.includes("Boundary-adjacent target"));
  assert.ok(targetChunk);
  assert.equal(source.slice(targetChunk.start, targetChunk.end), targetChunk.text);
  assert.ok(targetChunk.contextBefore || targetChunk.contextAfter);
});

test("merges chunk results with global offsets, source order, usage, and duplicate removal", () => {
  const source = "First useful phrase. Second nuanced phrase.";
  const chunks = [
    { index: 0, start: 0, end: 21, text: source.slice(0, 21) },
    { index: 1, start: 21, end: source.length, text: source.slice(21) },
  ];
  const secondLocal = chunks[1].text.indexOf("nuanced phrase");
  const analyzed = [{
    chunk: chunks[0],
    result: {
      sourceLanguage: "en",
      translation: "最初の有用な表現。",
      annotations: [{ text: "useful phrase", start: 6, end: 19, priority: 2, reliability: "high" }],
      connotations: [],
      slashReading: ["First useful phrase."],
    },
    usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
  }, {
    chunk: chunks[1],
    result: {
      sourceLanguage: "en",
      translation: "次のニュアンスを持つ表現。",
      annotations: [{ text: "nuanced phrase", start: secondLocal, end: secondLocal + 14, priority: 5 }],
      connotations: [{
        text: "nuanced phrase",
        start: secondLocal,
        end: secondLocal + 14,
        category: "stance",
        suggestedMeaning: "speaker positioning",
        contextNote: "",
      }, {
        text: "nuanced phrase",
        start: secondLocal,
        end: secondLocal + 14,
        category: "stance",
        suggestedMeaning: "speaker positioning",
        contextNote: "",
      }],
      slashReading: ["Second nuanced phrase."],
    },
    usage: { input_tokens: 8, output_tokens: 4, total_tokens: 12 },
  }];

  const merged = mergeChunkResults(source, analyzed, { explanationLanguage: "ja" });
  assert.equal(merged.result.sourceText, source);
  assert.deepEqual(merged.result.annotations.map((item) => item.text), ["nuanced phrase", "useful phrase"]);
  assert.equal(merged.result.annotations[0].start, source.indexOf("nuanced phrase"));
  assert.deepEqual(
    selectAnnotationsByDensity(merged.result.annotations, 1).map((item) => item.text),
    ["nuanced phrase"],
  );
  assert.equal(merged.result.connotations.length, 1);
  assert.equal(merged.result.translation, "最初の有用な表現。\n\n次のニュアンスを持つ表現。");
  assert.equal(merged.usage.total_tokens, 27);
});

test("cancellation stops subsequent chunks and reports completed work", async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(runChunkPipeline({
    chunks: [{ index: 0 }, { index: 1 }, { index: 2 }],
    signal: controller.signal,
    analyzeChunk: async () => {
      calls += 1;
      controller.abort();
      return { usage: { total_tokens: 1 } };
    },
  }), (error) => {
    assert.ok(error instanceof AnalysisCancelledError);
    assert.equal(error.completedChunks, 1);
    return true;
  });
  assert.equal(calls, 1);
});

test("partial failure is explicit and retains usage from completed chunks", async () => {
  let calls = 0;
  await assert.rejects(runChunkPipeline({
    chunks: [{ index: 0 }, { index: 1 }, { index: 2 }],
    analyzeChunk: async () => {
      calls += 1;
      if (calls === 2) throw new Error("fixture failure");
      return { usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 } };
    },
  }), (error) => {
    assert.ok(error instanceof PartialAnalysisError);
    assert.equal(error.completedChunks, 1);
    assert.equal(error.failedChunk, 2);
    assert.equal(error.usage.total_tokens, 5);
    return true;
  });
  assert.equal(calls, 2);
});

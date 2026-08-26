const test = require("node:test");
const assert = require("node:assert/strict");
const fixtures = require("./fixtures/long-form-cases.json");
const {
  AnalysisCancelledError,
  DEFAULT_CHUNK_LENGTH,
  MAX_CHUNK_CONCURRENCY,
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

test("default splitting exhaustively scans medium lecture passages in several sections", () => {
  const sentence = "Researchers compare child-language examples, corpora, recurring patterns, and competing explanations before drawing conclusions. ";
  const source = sentence.repeat(65).trim();
  const chunks = splitTextRanges(source);

  assert.equal(DEFAULT_CHUNK_LENGTH, 3_200);
  assert.ok(source.length > DEFAULT_CHUNK_LENGTH);
  assert.ok(chunks.length >= 2);
  assert.equal(chunks.map((chunk) => chunk.text).join(""), source);
  assert.ok(chunks.every((chunk) => chunk.text.length <= DEFAULT_CHUNK_LENGTH));
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

test("long-form merge discards all chunk translations when translation is disabled", () => {
  const source = "First section. Second section.";
  const chunks = [
    { index: 0, start: 0, end: 15, text: source.slice(0, 15) },
    { index: 1, start: 15, end: source.length, text: source.slice(15) },
  ];
  const analyzed = chunks.map((chunk, index) => ({
    chunk,
    result: {
      sourceLanguage: "en",
      translation: index === 0 ? "第一部。" : "第二部。",
      annotations: [],
      connotations: [],
      slashReading: [],
    },
  }));

  const merged = mergeChunkResults(source, analyzed, {
    explanationLanguage: "ja",
    includeTranslation: false,
  });
  assert.equal(merged.result.translation, "");
});

test("runs at most five chunks concurrently and still returns source order", async () => {
  assert.equal(MAX_CHUNK_CONCURRENCY, 5);
  const chunks = Array.from({ length: 6 }, (_, index) => ({ index }));
  const started = [];
  let active = 0;
  let maxActive = 0;
  let releaseFirstWave;
  let notifyFirstWaveStarted;
  const firstWaveGate = new Promise((resolve) => { releaseFirstWave = resolve; });
  const firstWaveStarted = new Promise((resolve) => { notifyFirstWaveStarted = resolve; });

  const resultPromise = runChunkPipeline({
    chunks,
    analyzeChunk: async (chunk) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      started.push(chunk.index);
      if (started.length === MAX_CHUNK_CONCURRENCY) notifyFirstWaveStarted();
      try {
        if (chunk.index < MAX_CHUNK_CONCURRENCY) await firstWaveGate;
        return { chunk, usage: { total_tokens: 1 } };
      } finally {
        active -= 1;
      }
    },
  });

  await firstWaveStarted;
  assert.deepEqual(started, [0, 1, 2, 3, 4]);
  assert.equal(maxActive, 5);
  releaseFirstWave();

  const result = await resultPromise;
  assert.deepEqual(result.map((item) => item.chunk.index), [0, 1, 2, 3, 4, 5]);
  assert.equal(maxActive, 5);
});

test("parallel failure stops assigning later chunks and retains completed in-flight usage", async () => {
  const started = [];
  await assert.rejects(runChunkPipeline({
    chunks: [{ index: 0 }, { index: 1 }, { index: 2 }, { index: 3 }],
    maxConcurrency: 2,
    analyzeChunk: async (chunk) => {
      started.push(chunk.index);
      if (chunk.index === 0) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        throw new Error("parallel fixture failure");
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 } };
    },
  }), (error) => {
    assert.ok(error instanceof PartialAnalysisError);
    assert.equal(error.failedChunk, 1);
    assert.equal(error.completedChunks, 1);
    assert.equal(error.usage.total_tokens, 5);
    return true;
  });
  assert.deepEqual(started, [0, 1]);
});

test("cancellation stops subsequent chunks and reports completed work", async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(runChunkPipeline({
    chunks: [{ index: 0 }, { index: 1 }, { index: 2 }],
    signal: controller.signal,
    maxConcurrency: 1,
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
    maxConcurrency: 1,
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

test("a transient section failure can be retried without repeating completed sections", async () => {
  const calls = [];
  const progress = [];
  const result = await runChunkPipeline({
    chunks: [{ index: 0 }, { index: 1 }, { index: 2 }],
    maxConcurrency: 1,
    maxAttempts: 2,
    analyzeChunk: async (chunk) => {
      calls.push(chunk.index);
      if (chunk.index === 1 && calls.filter((index) => index === 1).length === 1) {
        throw new Error("temporary model failure");
      }
      return { chunk, usage: { total_tokens: 1 } };
    },
    onProgress: (event) => progress.push(event),
  });

  assert.deepEqual(calls, [0, 1, 1, 2]);
  assert.deepEqual(result.map((item) => item.chunk.index), [0, 1, 2]);
  assert.deepEqual(progress.find((event) => event.stage === "retrying"), {
    stage: "retrying",
    current: 2,
    total: 3,
    attempt: 2,
  });
});

test("cancellation during a retry delay prevents another model call", async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(runChunkPipeline({
    chunks: [{ index: 0 }],
    signal: controller.signal,
    maxAttempts: 2,
    retryDelayMs: 100,
    analyzeChunk: async () => {
      calls += 1;
      setTimeout(() => controller.abort(), 5);
      throw new Error("temporary model failure");
    },
  }), (error) => {
    assert.ok(error instanceof AnalysisCancelledError);
    assert.equal(error.completedChunks, 0);
    return true;
  });
  assert.equal(calls, 1);
});

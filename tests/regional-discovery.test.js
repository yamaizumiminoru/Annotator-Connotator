const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildScanRegions,
  flattenRegionalAnnotations,
  regionalizeAnnotationPrompt,
} = require("../lib/regional-discovery");
const { mergeChunkResults } = require("../lib/long-form");

test("splits a 3200-character section into about four natural exhaustive regions", () => {
  const sentence = "Researchers inspect every section before recording a useful candidate. ";
  const source = sentence.repeat(Math.ceil(3200 / sentence.length)).slice(0, 3200);
  const regions = buildScanRegions(source);

  assert.equal(regions.length, 4);
  assert.equal(regions.map((region) => region.text).join(""), source);
  assert.equal(regions[0].start, 0);
  assert.equal(regions.at(-1).end, source.length);
  regions.forEach((region, index) => {
    assert.equal(region.index, index);
    assert.equal(source.slice(region.start, region.end), region.text);
    if (index > 0) assert.equal(regions[index - 1].end, region.start);
  });
  regions.slice(0, -1).forEach((region) => assert.match(region.text, /[.!?]\s$/));
});

test("regional prompt removes global ranking and target-count selection", () => {
  const prompt = regionalizeAnnotationPrompt([
    "Candidate discovery target: aim for about 12 eligible ordinary annotations.",
    "Rank every eligible ordinary annotation by pedagogical priority across the whole passage, not first-come-first-served reading order.",
    "Schema:",
    "{",
    '  "annotations": [',
    '    {"text":"target"}',
    "  ],",
    '  "connotations": [',
    "  ]",
    "}",
    "- Return ordinary annotation candidates in descending priority order, using reliability only as a secondary ordering consideration.",
    "- Every annotation text must be an exact contiguous substring of sourceText.",
    "- start and end must be JavaScript string offsets for that exact substring.",
  ].join("\n"), {
    regions: [{ index: 0, start: 0, end: 80 }, { index: 1, start: 80, end: 160 }],
    hardMaximum: 20,
  });

  assert.doesNotMatch(prompt, /Candidate discovery target:/);
  assert.doesNotMatch(prompt, /Rank every eligible ordinary annotation by pedagogical priority/);
  assert.doesNotMatch(prompt, /descending priority order/);
  assert.match(prompt, /Do not rank candidates globally/);
  assert.match(prompt, /Scan every region independently from beginning to end/);
  assert.match(prompt, /Do not stop because you have already found many candidates in earlier regions/);
  assert.match(prompt, /hard maximum is 20 ordinary candidates/);
  assert.match(prompt, /"regions"/);
});

test("flattens region-local offsets in source order and accepts an empty region", () => {
  const source = "Opening target. Middle words. Final phrase.";
  const regions = [
    { index: 0, start: 0, end: 16, text: source.slice(0, 16) },
    { index: 1, start: 16, end: 30, text: source.slice(16, 30) },
    { index: 2, start: 30, end: source.length, text: source.slice(30) },
  ];
  const modelRegions = [{
    regionIndex: 3,
    annotations: [{ text: "Final phrase", start: 1, end: 13, priority: 4 }],
  }, {
    regionIndex: 1,
    annotations: [
      { text: "Opening target", start: 99, end: 100, priority: 5 },
      { text: "target", start: 8, end: 14, priority: 3 },
    ],
  }, {
    regionIndex: 2,
    annotations: [],
  }];

  const flattened = flattenRegionalAnnotations(source, regions, modelRegions);
  assert.deepEqual(flattened.annotations.map((item) => item.text), ["Opening target", "Final phrase"]);
  assert.deepEqual(flattened.annotations.map((item) => item.start), [0, 30]);
  assert.deepEqual(flattened.telemetry.regions.map((item) => item.candidateCount), [1, 0, 1]);
  assert.equal(flattened.telemetry.rawCandidateCount, 3);
  assert.equal(flattened.telemetry.candidateCount, 2);
  assert.equal(flattened.telemetry.droppedCandidateCount, 1);
});

test("long-form merge preserves regional discovery telemetry with global boundaries", () => {
  const source = "First target. Second target.";
  const chunks = [
    { index: 0, start: 0, end: 14, text: source.slice(0, 14) },
    { index: 1, start: 14, end: source.length, text: source.slice(14) },
  ];
  const analyzed = chunks.map((chunk) => ({
    chunk,
    result: {
      sourceLanguage: "en",
      annotations: [],
      connotations: [],
      slashReading: [],
      _regionalDiscovery: {
        mode: "regional-exhaustive",
        rawCandidateCount: 1,
        candidateCount: 1,
        droppedCandidateCount: 0,
        regions: [{ regionIndex: 1, start: 0, end: chunk.text.length, candidateCount: 1 }],
      },
    },
  }));

  const merged = mergeChunkResults(source, analyzed);
  assert.equal(merged.result._regionalDiscovery.candidateCount, 2);
  assert.equal(merged.result._regionalDiscovery.chunks.length, 2);
  assert.equal(merged.result._regionalDiscovery.chunks[1].regions[0].start, 14);
  assert.equal(merged.result._regionalDiscovery.chunks[1].regions[0].end, source.length);
});

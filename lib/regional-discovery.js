const { repairAnnotationOffsets } = require("./annotation-normalization");
const { mergeUniqueNonOverlappingAnnotations } = require("./annotation-selection");

const DEFAULT_REGION_LENGTH = 800;
const MAX_SCAN_REGIONS = 4;

function buildScanRegions(sourceText, options = {}) {
  const source = String(sourceText || "");
  if (!source) return [];

  const targetLength = Math.max(1, Number(options.targetLength) || DEFAULT_REGION_LENGTH);
  const maximum = Math.max(1, Number(options.maxRegions) || MAX_SCAN_REGIONS);
  const count = Math.max(1, Math.min(maximum, Math.ceil(source.length / targetLength)));
  const regions = [];
  let start = 0;

  for (let index = 0; index < count - 1; index += 1) {
    const remainingRegions = count - index;
    const idealEnd = start + Math.round((source.length - start) / remainingRegions);
    const tolerance = Math.min(180, Math.max(40, Math.floor(targetLength * 0.22)));
    const minimum = Math.max(start + 1, idealEnd - tolerance);
    const maximumEnd = Math.min(source.length - (remainingRegions - 1), idealEnd + tolerance);
    const end = nearestNaturalBoundary(source, minimum, idealEnd, maximumEnd) || idealEnd;
    regions.push({ index, start, end, text: source.slice(start, end) });
    start = end;
  }

  regions.push({ index: regions.length, start, end: source.length, text: source.slice(start) });
  return regions;
}

function nearestNaturalBoundary(source, minimum, ideal, maximum) {
  const window = source.slice(minimum, maximum);
  const patterns = [
    /\n\s*\n/g,
    /[。！？](?:["'”’」』】）)]*)/g,
    /[.!?](?:["'”’)\]}]*)\s+/g,
    /\n/g,
    /\s+/g,
  ];

  for (const pattern of patterns) {
    const candidates = [...window.matchAll(pattern)].map((match) => (
      minimum + match.index + match[0].length
    ));
    if (candidates.length) {
      return candidates.sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal))[0];
    }
  }
  return null;
}

function regionalizeAnnotationPrompt(prompt, { regions, hardMaximum }) {
  const removedRules = [
    /^Candidate discovery target:/,
    /^Before choosing ordinary annotation candidates, inspect the entire source text/,
    /^Discover candidates before applying any density preference/,
    /^Rank every eligible ordinary annotation by pedagogical priority across the whole passage/,
    /^When suitable targets occur in the beginning, middle, and end/,
    /^Return fewer candidates when there are genuinely fewer suitable targets/,
    /^- Return ordinary annotation candidates in descending priority order/,
    /^- Never pad the ordinary candidate list to reach the discovery target/,
  ];
  let text = String(prompt || "")
    .split("\n")
    .filter((line) => !removedRules.some((pattern) => pattern.test(line)))
    .join("\n");

  text = text.replace(
    '- Every annotation text must be an exact contiguous substring of sourceText.',
    '- Every ordinary annotation text must be an exact contiguous substring of its regionText. Every connotation text must remain an exact contiguous substring of sourceText.',
  ).replace(
    '- start and end must be JavaScript string offsets for that exact substring.',
    '- Ordinary annotation start and end offsets must be local to regionText. Connotation start and end offsets remain local to sourceText.',
  );

  text = text.replace(
    /  "annotations": \[\n[\s\S]*?\n  \],\n  "connotations": \[/,
    [
      '  "regions": [',
      "    {",
      '      "regionIndex": 1,',
      '      "annotations": [',
      "        {",
      '          "id": "a1",',
      '          "text": "exact substring from regionText",',
      '          "type": "word|collocation|formula|construction|idiom|term",',
      '          "meaningJa": "meaning in the selected explanation language",',
      '          "noteJa": "why it matters or how to use it",',
      '          "example": "short example in the source language when possible",',
      '          "pattern": "generalized reusable pattern or empty string",',
      '          "coreRanges": [{"start": 0, "end": 8}],',
      '          "start": 0,',
      '          "end": 10,',
      '          "priority": 5,',
      '          "reliability": "high|medium|low"',
      "        }",
      "      ]",
      "    }",
      "  ],",
      '  "connotations": [',
    ].join("\n"),
  );

  const regionSummary = regions.map((region) => (
    `region ${region.index + 1}: sourceText[${region.start}:${region.end}]`
  )).join("; ");
  const regionalRules = [
    "",
    "Regional exhaustive ordinary-candidate discovery:",
    "- Do not rank candidates globally.",
    "- Do not choose only the best items in the passage.",
    "- Scan every region independently from beginning to end.",
    "- Enumerate every eligible ordinary candidate you find, subject only to the hard maximum.",
    "- Return ordinary candidates in source order within each region.",
    "- A region may contain zero candidates only when it genuinely contains no eligible target.",
    "- Do not stop because you have already found many candidates in earlier regions.",
    "- Do not consider display density during discovery. The later judge and selection stages decide pedagogical priority and visibility.",
    "- Do not pad a region with trivial or merely compositional material. A candidate must still have plausible learning value for at least one learner band.",
    `- Return exactly ${regions.length} region objects, in order, using regionIndex 1 through ${regions.length}.`,
    `- The hard maximum is ${hardMaximum} ordinary candidates across all regions. It is a safety cap, not a target or quota.`,
    `- Authoritative regions: ${regionSummary}.`,
    "- Use the scanRegions supplied in the user message. Ordinary offsets are local to each regionText; the server will restore section-local offsets.",
    "- Keep translation, summary, slash reading, and precision-first connotation behavior unchanged at the top level.",
  ];
  return `${text}\n${regionalRules.join("\n")}`;
}

function flattenRegionalAnnotations(sourceText, scanRegions, modelRegions) {
  const source = String(sourceText || "");
  const supplied = Array.isArray(modelRegions) ? modelRegions : [];
  const byIndex = new Map();
  for (const item of supplied) {
    const index = Number(item?.regionIndex);
    if (Number.isInteger(index) && index >= 1 && !byIndex.has(index)) byIndex.set(index, item);
  }

  const shifted = [];
  const regionTelemetry = [];
  let rawCandidateCount = 0;
  for (const region of scanRegions) {
    const returned = byIndex.get(region.index + 1);
    const raw = Array.isArray(returned?.annotations) ? returned.annotations : [];
    rawCandidateCount += raw.length;
    const repaired = repairAnnotationOffsets(region.text, raw);
    shifted.push(...repaired.map((item) => ({
      ...item,
      start: item.start + region.start,
      end: item.end + region.start,
    })));
    regionTelemetry.push({
      regionIndex: region.index + 1,
      start: region.start,
      end: region.end,
      rawCandidateCount: raw.length,
      repairedCandidateCount: repaired.length,
      returned: Boolean(returned),
    });
  }

  const annotations = mergeUniqueNonOverlappingAnnotations([], shifted)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  for (const region of regionTelemetry) {
    region.candidateCount = annotations.filter((item) => (
      item.start >= region.start && item.start < region.end
    )).length;
  }

  return {
    annotations,
    telemetry: {
      mode: "regional-exhaustive",
      rawCandidateCount,
      candidateCount: annotations.length,
      droppedCandidateCount: rawCandidateCount - annotations.length,
      regions: regionTelemetry,
    },
  };
}

module.exports = {
  DEFAULT_REGION_LENGTH,
  MAX_SCAN_REGIONS,
  buildScanRegions,
  flattenRegionalAnnotations,
  regionalizeAnnotationPrompt,
};

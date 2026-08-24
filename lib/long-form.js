const { mergeUsage } = require("./analysis-core");
const { mergeUniqueNonOverlappingAnnotations } = require("./annotation-selection");
const { mergeUniqueConnotations, normalizeConnotations, repairAnnotationOffsets } = require("./annotation-normalization");

const DEFAULT_CHUNK_LENGTH = 3_200;
const DEFAULT_CONTEXT_LENGTH = 320;

class AnalysisCancelledError extends Error {
  constructor(completedChunks, totalChunks) {
    super("Analysis was cancelled.");
    this.name = "AnalysisCancelledError";
    this.code = "analysis_cancelled";
    this.completedChunks = completedChunks;
    this.totalChunks = totalChunks;
  }
}

class PartialAnalysisError extends Error {
  constructor(cause, completedChunks, totalChunks, usage) {
    super(`Long-form analysis failed in section ${completedChunks + 1} of ${totalChunks}.`);
    this.name = "PartialAnalysisError";
    this.code = "long_form_partial_failure";
    this.completedChunks = completedChunks;
    this.failedChunk = completedChunks + 1;
    this.totalChunks = totalChunks;
    this.usage = usage;
    this.cause = cause;
  }
}

function splitTextRanges(sourceText, maxLength = DEFAULT_CHUNK_LENGTH) {
  const source = String(sourceText || "");
  if (!source) return [];
  const ranges = [];
  let start = 0;

  while (source.length - start > maxLength) {
    const hardEnd = Math.min(source.length, start + maxLength);
    const minimum = start + Math.floor(maxLength * 0.55);
    const end = findPreferredBoundary(source, start, minimum, hardEnd);
    ranges.push({ start, end });
    start = end;
  }
  if (start < source.length) ranges.push({ start, end: source.length });

  return ranges.map((range, index) => ({
    index,
    start: range.start,
    end: range.end,
    text: source.slice(range.start, range.end),
    contextBefore: source.slice(Math.max(0, range.start - DEFAULT_CONTEXT_LENGTH), range.start).trim(),
    contextAfter: source.slice(range.end, Math.min(source.length, range.end + DEFAULT_CONTEXT_LENGTH)).trim(),
  }));
}

function findPreferredBoundary(source, start, minimum, hardEnd) {
  const window = source.slice(start, hardEnd + 1);
  const relativeMinimum = minimum - start;
  const patterns = [
    /\n\s*\n/g,
    /[。！？](?:["'”’」』】）)]*)/g,
    /[.!?](?:["'”’)\]}]*)\s+/g,
    /\n/g,
    /\s+/g,
  ];

  for (const pattern of patterns) {
    let chosen = -1;
    for (const match of window.matchAll(pattern)) {
      const boundary = match.index + match[0].length;
      if (boundary >= relativeMinimum && boundary <= hardEnd - start) chosen = boundary;
    }
    if (chosen > 0) return start + chosen;
  }
  return hardEnd;
}

async function runChunkPipeline({ chunks, analyzeChunk, signal, onProgress = () => {} }) {
  const results = [];
  const totalChunks = chunks.length;

  for (let index = 0; index < chunks.length; index += 1) {
    if (signal?.aborted) throw new AnalysisCancelledError(results.length, totalChunks);
    onProgress({ stage: "analyzing", current: index + 1, total: totalChunks });
    try {
      results.push(await analyzeChunk(chunks[index], index, totalChunks));
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) {
        throw new AnalysisCancelledError(results.length, totalChunks);
      }
      throw new PartialAnalysisError(
        error,
        results.length,
        totalChunks,
        mergeUsage(results.map((item) => item.usage)),
      );
    }
  }

  if (signal?.aborted) throw new AnalysisCancelledError(results.length, totalChunks);
  onProgress({ stage: "merging", current: totalChunks, total: totalChunks });
  return results;
}

function mergeChunkResults(sourceText, analyzedChunks, fallback = {}) {
  const source = String(sourceText || "");
  const shiftedAnnotations = [];
  const shiftedConnotations = [];
  const translations = [];
  const summaries = [];
  const slashReading = [];
  const usages = [];
  const coverageCompletion = [];
  let detectedLanguage = fallback.sourceLanguage || "auto";

  for (const entry of analyzedChunks) {
    const result = entry.result || {};
    const offset = entry.chunk.start;
    shiftedAnnotations.push(...(Array.isArray(result.annotations) ? result.annotations : []).map((item) => ({
      ...item,
      start: Number(item.start) + offset,
      end: Number(item.end) + offset,
    })));
    shiftedConnotations.push(...(Array.isArray(result.connotations) ? result.connotations : []).map((item) => ({
      ...item,
      start: Number(item.start) + offset,
      end: Number(item.end) + offset,
    })));
    if (String(result.translation || "").trim()) translations.push(String(result.translation).trim());
    if (String(result.summaryJa || "").trim()) summaries.push(String(result.summaryJa).trim());
    if (Array.isArray(result.slashReading)) slashReading.push(...result.slashReading);
    if (entry.usage) usages.push(entry.usage);
    if (entry.coverageCompletion) coverageCompletion.push(entry.coverageCompletion);
    if (detectedLanguage === "auto" && result.sourceLanguage) detectedLanguage = result.sourceLanguage;
  }

  const repairedAnnotations = repairAnnotationOffsets(source, shiftedAnnotations);
  const annotations = mergeUniqueNonOverlappingAnnotations([], repairedAnnotations)
    .map((item, index) => ({ ...item, id: `a${index + 1}` }));
  const connotations = mergeUniqueConnotations(normalizeConnotations(source, shiftedConnotations))
    .map((item, index) => ({ ...item, id: `c${index + 1}` }));

  return {
    result: {
      sourceText: source,
      sourceLanguage: detectedLanguage,
      explanationLanguage: fallback.explanationLanguage || "ja",
      level: fallback.level || "intermediate",
      summaryJa: summaries.join(" "),
      translation: translations.join("\n\n"),
      annotations,
      connotations,
      slashReading,
    },
    usage: mergeUsage(usages),
    coverageCompletion,
    chunkCount: analyzedChunks.length,
  };
}

function isAbortError(error) {
  return error?.name === "AbortError" || error?.code === "ABORT_ERR";
}

module.exports = {
  AnalysisCancelledError,
  DEFAULT_CHUNK_LENGTH,
  DEFAULT_CONTEXT_LENGTH,
  PartialAnalysisError,
  isAbortError,
  mergeChunkResults,
  runChunkPipeline,
  splitTextRanges,
};

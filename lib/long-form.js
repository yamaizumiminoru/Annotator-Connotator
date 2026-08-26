const { mergeUsage } = require("./analysis-core");
const { mergeUniqueNonOverlappingAnnotations } = require("./annotation-selection");
const { mergeUniqueConnotations, normalizeConnotations, repairAnnotationOffsets } = require("./annotation-normalization");

const DEFAULT_CHUNK_LENGTH = 3_200;
const DEFAULT_CONTEXT_LENGTH = 320;
const MAX_CHUNK_CONCURRENCY = 5;

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
  constructor(cause, completedChunks, totalChunks, usage, failedChunk = completedChunks + 1) {
    super(`Long-form analysis failed in section ${failedChunk} of ${totalChunks}.`);
    this.name = "PartialAnalysisError";
    this.code = "long_form_partial_failure";
    this.completedChunks = completedChunks;
    this.failedChunk = failedChunk;
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

async function runChunkPipeline({
  chunks,
  analyzeChunk,
  signal,
  onProgress = () => {},
  maxAttempts = 1,
  retryDelayMs = 0,
  maxConcurrency = MAX_CHUNK_CONCURRENCY,
}) {
  const totalChunks = chunks.length;
  const results = new Array(totalChunks);
  const attemptsPerChunk = Math.max(1, Number(maxAttempts) || 1);
  const requestedConcurrency = Math.floor(Number(maxConcurrency));
  const concurrencyLimit = Math.max(
    1,
    Math.min(
      MAX_CHUNK_CONCURRENCY,
      Number.isFinite(requestedConcurrency) && requestedConcurrency > 0
        ? requestedConcurrency
        : MAX_CHUNK_CONCURRENCY,
    ),
  );
  const workerCount = Math.min(totalChunks, concurrencyLimit);
  let nextIndex = 0;
  let completedChunks = 0;
  let fatalError = null;

  async function analyzeIndex(index) {
    if (signal?.aborted) throw new AnalysisCancelledError(completedChunks, totalChunks);
    onProgress({ stage: "analyzing", current: index + 1, total: totalChunks });

    for (let attempt = 1; attempt <= attemptsPerChunk; attempt += 1) {
      try {
        const result = await analyzeChunk(chunks[index], index, totalChunks);
        results[index] = result;
        completedChunks += 1;
        return;
      } catch (error) {
        if (signal?.aborted || isAbortError(error)) {
          throw new AnalysisCancelledError(completedChunks, totalChunks);
        }
        if (attempt < attemptsPerChunk) {
          onProgress({
            stage: "retrying",
            current: index + 1,
            total: totalChunks,
            attempt: attempt + 1,
          });
          try {
            await waitForRetry(retryDelayMs, signal);
          } catch (retryError) {
            if (signal?.aborted || isAbortError(retryError)) {
              throw new AnalysisCancelledError(completedChunks, totalChunks);
            }
            throw retryError;
          }
          continue;
        }
        const failure = new Error(error.message);
        failure.cause = error;
        failure.failedIndex = index;
        throw failure;
      }
    }
  }

  async function worker() {
    while (!fatalError) {
      if (signal?.aborted) {
        fatalError = new AnalysisCancelledError(completedChunks, totalChunks);
        return;
      }

      const index = nextIndex;
      if (index >= totalChunks) return;
      nextIndex += 1;

      try {
        await analyzeIndex(index);
      } catch (error) {
        if (!fatalError) fatalError = error;
        return;
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  if (signal?.aborted || fatalError instanceof AnalysisCancelledError) {
    throw new AnalysisCancelledError(completedChunks, totalChunks);
  }
  if (fatalError) {
    const failedIndex = Number.isInteger(fatalError.failedIndex) ? fatalError.failedIndex : completedChunks;
    throw new PartialAnalysisError(
      fatalError.cause || fatalError,
      completedChunks,
      totalChunks,
      mergeUsage(results.filter(Boolean).map((item) => item.usage)),
      failedIndex + 1,
    );
  }

  if (signal?.aborted) throw new AnalysisCancelledError(completedChunks, totalChunks);
  onProgress({ stage: "merging", current: totalChunks, total: totalChunks });
  return results;
}

function waitForRetry(delayMs, signal) {
  const delay = Math.max(0, Number(delayMs) || 0);
  if (delay === 0) return Promise.resolve();
  if (signal?.aborted) {
    const error = new Error("Analysis was cancelled.");
    error.name = "AbortError";
    return Promise.reject(error);
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      const error = new Error("Analysis was cancelled.");
      error.name = "AbortError";
      reject(error);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delay);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function mergeChunkResults(sourceText, analyzedChunks, fallback = {}) {
  const source = String(sourceText || "");
  const includeTranslation = fallback.includeTranslation !== false;
  const shiftedAnnotations = [];
  const shiftedConnotations = [];
  const translations = [];
  const summaries = [];
  const slashReading = [];
  const usages = [];
  const coverageCompletion = [];
  const regionalChunks = [];
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
    if (includeTranslation && String(result.translation || "").trim()) {
      translations.push(String(result.translation).trim());
    }
    if (String(result.summaryJa || "").trim()) summaries.push(String(result.summaryJa).trim());
    if (Array.isArray(result.slashReading)) slashReading.push(...result.slashReading);
    if (entry.usage) usages.push(entry.usage);
    if (entry.coverageCompletion) coverageCompletion.push(entry.coverageCompletion);
    if (result._regionalDiscovery) {
      regionalChunks.push({
        ...result._regionalDiscovery,
        chunkIndex: entry.chunk.index + 1,
        chunkStart: entry.chunk.start,
        chunkEnd: entry.chunk.end,
        regions: (result._regionalDiscovery.regions || []).map((region) => ({
          ...region,
          start: region.start + offset,
          end: region.end + offset,
        })),
      });
    }
    if (detectedLanguage === "auto" && result.sourceLanguage) detectedLanguage = result.sourceLanguage;
  }

  const repairedAnnotations = repairAnnotationOffsets(source, shiftedAnnotations);
  const annotations = mergeUniqueNonOverlappingAnnotations([], repairedAnnotations)
    .map((item, index) => ({ ...item, id: `a${index + 1}` }));
  const connotations = mergeUniqueConnotations(normalizeConnotations(source, shiftedConnotations))
    .map((item, index) => ({ ...item, id: `c${index + 1}` }));

  const result = {
      sourceText: source,
      sourceLanguage: detectedLanguage,
      explanationLanguage: fallback.explanationLanguage || "ja",
      level: fallback.level || "intermediate",
      summaryJa: summaries.join(" "),
      translation: includeTranslation ? translations.join("\n\n") : "",
      annotations,
      connotations,
      slashReading,
  };
  if (regionalChunks.length) {
    result._regionalDiscovery = {
      mode: "regional-exhaustive",
      rawCandidateCount: regionalChunks.reduce((sum, item) => sum + Number(item.rawCandidateCount || 0), 0),
      candidateCount: regionalChunks.reduce((sum, item) => sum + Number(item.candidateCount || 0), 0),
      droppedCandidateCount: regionalChunks.reduce((sum, item) => sum + Number(item.droppedCandidateCount || 0), 0),
      chunks: regionalChunks,
    };
  }

  return {
    result,
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
  MAX_CHUNK_CONCURRENCY,
  PartialAnalysisError,
  isAbortError,
  mergeChunkResults,
  runChunkPipeline,
  splitTextRanges,
};

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
loadDotEnv(path.join(root, ".env"));

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const noJudge = args.includes("--no-judge");
const requestedMode = readOption("--mode") || "discovery";
const requestedCase = readOption("--case");
const limit = Number(readOption("--limit") || 0);
const appUrl = process.env.CONNOTATION_EVAL_APP_URL || "http://localhost:4174";
const model = process.env.CONNOTATION_EVAL_MODEL || process.env.OPENAI_MODEL || "gpt-5.6-sol";
const outputArg = args.find((arg) => !arg.startsWith("--") && ![requestedMode, requestedCase, String(limit)].includes(arg));
const outputPath = path.resolve(
  root,
  outputArg || `connotation-evaluation-${new Date().toISOString().slice(0, 10)}.json`,
);
const casesPath = path.join(root, "tests", "connotation-benchmark-cases.json");
const benchmark = JSON.parse(fs.readFileSync(casesPath, "utf8"));

if (!["discovery", "explanation", "both"].includes(requestedMode)) {
  throw new Error("--mode must be discovery, explanation, or both.");
}

validateBenchmark(benchmark);
let selectedCases = benchmark.cases;
if (requestedCase) selectedCases = selectedCases.filter((testCase) => testCase.id === requestedCase);
if (limit > 0) selectedCases = selectedCases.slice(0, limit);
if (!selectedCases.length) throw new Error("No benchmark cases matched the requested filters.");

const selectedModes = requestedMode === "both" ? ["discovery", "explanation"] : [requestedMode];
const work = selectedCases.flatMap((testCase) => selectedModes
  .filter((mode) => mode === "discovery" || testCase.expected.shouldDetect)
  .map((mode) => ({ testCase, mode })));

if (dryRun) {
  console.log(JSON.stringify({
    valid: true,
    cases: benchmark.cases.length,
    selectedCases: selectedCases.length,
    requests: work.length,
    modes: selectedModes,
    categoryCounts: countBy(benchmark.cases, (item) => item.category),
    languageCounts: countBy(benchmark.cases, (item) => item.language),
    patternCounts: countBy(benchmark.cases, (item) => item.pattern),
  }, null, 2));
  process.exit(0);
}

if (!noJudge && !process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is required unless --no-judge is used.");
}

const appHealth = await assertAppReady();
const output = {
  generatedAt: new Date().toISOString(),
  appUrl,
  appModel: appHealth.model || null,
  judgeModel: noJudge ? null : model,
  benchmarkVersion: benchmark.version,
  requestedMode,
  records: [],
  summary: null,
};

for (let index = 0; index < work.length; index += 1) {
  const { testCase, mode } = work[index];
  console.log(`[${index + 1}/${work.length}] ${testCase.id} (${mode})`);
  const appStartedAt = performance.now();
  const annotation = await callApp(testCase, mode);
  const appElapsedMs = Math.round(performance.now() - appStartedAt);
  const structure = inspectStructure(testCase, annotation);
  const judgeStartedAt = performance.now();
  const judgment = noJudge ? null : await judgeResult(testCase, mode, annotation, structure);
  const judgeElapsedMs = noJudge ? 0 : Math.round(performance.now() - judgeStartedAt);
  output.records.push({
    testCase,
    mode,
    annotation,
    structure,
    judgment,
    timing: { appElapsedMs, judgeElapsedMs },
  });
  output.summary = summarize(output.records);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
}

console.log(JSON.stringify(output.summary, null, 2));
console.log(`Saved ${outputPath}`);

function readOption(name) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : "";
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (process.env[key] == null) process.env[key] = value;
  }
}

function validateBenchmark(data) {
  if (!Array.isArray(data.cases) || data.cases.length !== 32) {
    throw new Error("The benchmark must contain exactly 32 cases.");
  }
  const ids = new Set();
  for (const testCase of data.cases) {
    if (!testCase.id || ids.has(testCase.id)) throw new Error(`Duplicate or missing case id: ${testCase.id}`);
    ids.add(testCase.id);
    if (!data.languages.includes(testCase.language)) throw new Error(`Unsupported language: ${testCase.id}`);
    if (!data.categories.includes(testCase.category)) throw new Error(`Unsupported category: ${testCase.id}`);
    if (!["clear", "context", "contrast", "negative"].includes(testCase.pattern)) {
      throw new Error(`Unsupported pattern: ${testCase.id}`);
    }
    if (!testCase.sourceText || !testCase.expected) throw new Error(`Incomplete case: ${testCase.id}`);
    if (testCase.expected.shouldDetect && !testCase.targetText) {
      throw new Error(`Positive case requires targetText: ${testCase.id}`);
    }
    if (testCase.targetText && !testCase.sourceText.includes(testCase.targetText)) {
      throw new Error(`targetText is not an exact source substring: ${testCase.id}`);
    }
  }
  for (const language of data.languages) {
    const count = data.cases.filter((testCase) => testCase.language === language).length;
    if (count !== 16) throw new Error(`${language} must have exactly 16 cases; found ${count}.`);
  }
  for (const category of data.categories) {
    const cases = data.cases.filter((testCase) => testCase.category === category);
    if (cases.length !== 4) throw new Error(`${category} must have exactly 4 cases; found ${cases.length}.`);
    if (new Set(cases.map((testCase) => testCase.language)).size !== 2) {
      throw new Error(`${category} must include Japanese and English.`);
    }
  }
}

async function assertAppReady() {
  const response = await fetch(`${appUrl}/api/health`);
  if (!response.ok) throw new Error(`App health check failed (${response.status}).`);
  const health = await response.json();
  if (!health.openaiConfigured) throw new Error("The app server does not have an OpenAI API key configured.");
  return health;
}

async function callApp(testCase, mode) {
  const targetStart = testCase.targetText ? testCase.sourceText.indexOf(testCase.targetText) : -1;
  const payload = {
    text: testCase.sourceText,
    sourceLanguage: testCase.language,
    explanationLanguage: "en",
    level: "advanced",
    density: 3,
    focus: "all",
    includeGrammar: true,
    includeSlash: false,
  };
  if (mode === "explanation" && targetStart >= 0) {
    payload.connotationTargets = [{
      text: testCase.targetText,
      start: targetStart,
      end: targetStart + testCase.targetText.length,
    }];
  }

  const response = await fetch(`${appUrl}/api/annotate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`App request failed for ${testCase.id}: ${data.message || data.error || response.status}`);
  }
  return data;
}

function inspectStructure(testCase, annotation) {
  const required = [
    "id", "text", "start", "end", "scope", "category", "secondaryCategories", "subtype", "literalMeaning",
    "suggestedMeaning", "pragmaticEffect", "contextNote", "confidence", "alternatives",
    "evidence", "conventionality",
  ];
  const errors = [];
  const connotations = Array.isArray(annotation.connotations) ? annotation.connotations : [];
  if (!Array.isArray(annotation.connotations)) errors.push("connotations is not an array");

  for (const item of connotations) {
    for (const property of required) {
      if (!Object.hasOwn(item, property)) errors.push(`${item.id || "unknown"}: missing ${property}`);
    }
    if (
      !Number.isInteger(item.start)
      || !Number.isInteger(item.end)
      || annotation.sourceText.slice(item.start, item.end) !== item.text
    ) {
      errors.push(`${item.id || "unknown"}: invalid exact source span`);
    }
    if (!Array.isArray(item.secondaryCategories) || !Array.isArray(item.alternatives) || !Array.isArray(item.evidence)) {
      errors.push(`${item.id || "unknown"}: secondaryCategories, alternatives, and evidence must be arrays`);
    }
  }

  const targetStart = testCase.targetText ? testCase.sourceText.indexOf(testCase.targetText) : -1;
  const targetEnd = targetStart >= 0 ? targetStart + testCase.targetText.length : -1;
  const targetMatches = targetStart < 0 ? [] : connotations.filter((item) => (
    Number.isInteger(item.start)
    && Number.isInteger(item.end)
    && item.start < targetEnd
    && item.end > targetStart
  ));

  return {
    pass: errors.length === 0,
    errors,
    connotationCount: connotations.length,
    targetMatchCount: targetMatches.length,
    targetMatchIds: targetMatches.map((item) => item.id),
  };
}

async function judgeResult(testCase, mode, annotation, structure) {
  const scoreSchema = mode === "discovery"
    ? "discovery:0-2, span:0-1, explanationAccuracy:0-3, contextSensitivity:0-2, restraint:0-2"
    : "explanationAccuracy:0-3, contextSensitivity:0-2, restraint:0-2, learningUsefulness:0-1";
  const maximum = mode === "discovery" ? 10 : 8;
  const system = [
    "Evaluate a language-learning app's connotation and pragmatics analysis.",
    "Return one JSON object only.",
    `Evaluation mode: ${mode}. Maximum score: ${maximum}.`,
    `Score fields: ${scoreSchema}.`,
    "Use the supplied expected required ideas as semantic criteria, not as wording that must be copied.",
    "For discovery, award discovery points only when the app independently finds the target; for shouldDetect=false, award them for appropriate abstention.",
    "Span checks exact renderability and learner-facing highlight quality. Use the supplied structural report.",
    "For discovery span scoring, prefer the smallest useful anchor expression. Lower the span score when the app highlights a whole sentence merely to include contrast or context although a word or phrase can anchor the card.",
    "Do not penalize a narrow highlight when contextNote and evidence correctly explain that the interpretation depends on wider contrast or discourse.",
    "Context sensitivity requires distinguishing conventional meaning from contextual inference and preserving cancellation or contrast.",
    "Restraint requires avoiding the forbidden claims and unsupported hostility, irony, discrimination, emotion, personality, or certainty.",
    "A pattern=negative case is a category-specific negative control. Set negativeControlError true if the app invents the tested category or a forbidden reading, even if another grounded category is acceptable.",
    "Set criticalError true for reversed irony, asserted cancellable implicature, fabricated hostility/discrimination, or another seriously misleading pragmatic claim.",
    `Schema: {scores:{${scoreSchema}},totalScore:number,criticalError:boolean,negativeControlError:boolean,pass:boolean,reason:string,issues:string[]}`,
    `A case passes at 80% of ${maximum} with no critical error.`,
  ].join("\n");
  const { _api, ...judgedAnnotation } = annotation;
  const payload = { testCase, annotation: judgedAnnotation, structure };
  return withRetry(() => callOpenAI([
    { role: "system", content: system },
    { role: "user", content: JSON.stringify(payload) },
  ], 3000));
}

async function callOpenAI(input, maxOutputTokens) {
  const body = {
    model,
    input,
    max_output_tokens: maxOutputTokens,
    text: { verbosity: "low", format: { type: "json_object" } },
  };
  if (model.startsWith("gpt-5")) body.reasoning = { effort: "low" };
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Judge request failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  }
  const data = await response.json();
  const parsed = parseJson(extractText(data));
  parsed._api = {
    model,
    usage: data.usage || null,
  };
  return parsed;
}

async function withRetry(action) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
    }
  }
  throw lastError;
}

function extractText(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  return (data.output || [])
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === "output_text" || part.type === "text")
    .map((part) => part.text || "")
    .join("\n")
    .trim();
}

function parseJson(text) {
  const cleaned = String(text || "").replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("Judge did not return valid JSON.");
  }
}

function summarize(records) {
  const judged = records.filter((record) => record.judgment);
  const discovery = judged.filter((record) => record.mode === "discovery");
  const explanation = judged.filter((record) => record.mode === "explanation");
  return {
    completed: records.length,
    structuralFailures: records.filter((record) => !record.structure.pass).length,
    usage: {
      app: summarizeUsage(records.map((record) => record.annotation?._api?.usage)),
      judge: summarizeUsage(records.map((record) => record.judgment?._api?.usage)),
    },
    timing: {
      app: summarizeTiming(records.map((record) => record.timing?.appElapsedMs)),
      judge: summarizeTiming(records.map((record) => record.timing?.judgeElapsedMs)),
    },
    discovery: summarizeMode(discovery, 10),
    explanation: summarizeMode(explanation, 8),
  };
}

function summarizeTiming(values) {
  const timings = values.filter((value) => Number.isFinite(value) && value >= 0);
  if (!timings.length) return { requests: 0, averageMs: 0, medianMs: 0, totalMs: 0 };
  const sorted = [...timings].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
  const total = timings.reduce((sum, value) => sum + value, 0);
  return {
    requests: timings.length,
    averageMs: Math.round(total / timings.length),
    medianMs: median,
    totalMs: total,
  };
}

function summarizeUsage(usages) {
  return usages.filter(Boolean).reduce((totals, usage) => ({
    requests: totals.requests + 1,
    inputTokens: totals.inputTokens + Number(usage.input_tokens || 0),
    cachedInputTokens: totals.cachedInputTokens + Number(usage.input_tokens_details?.cached_tokens || 0),
    outputTokens: totals.outputTokens + Number(usage.output_tokens || 0),
    reasoningTokens: totals.reasoningTokens + Number(usage.output_tokens_details?.reasoning_tokens || 0),
    totalTokens: totals.totalTokens + Number(usage.total_tokens || 0),
  }), {
    requests: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
  });
}

function summarizeMode(records, maximum) {
  if (!records.length) return null;
  const average = averageOf(records.map((record) => Number(record.judgment.totalScore || 0)));
  const categoryAverages = {};
  for (const category of benchmark.categories) {
    const categoryRecords = records.filter((record) => record.testCase.category === category);
    if (categoryRecords.length) {
      categoryAverages[category] = round(averageOf(categoryRecords.map((record) => Number(record.judgment.totalScore || 0))));
    }
  }
  const criticalErrors = records.filter((record) => record.judgment.criticalError).length;
  const negativeControlErrors = records.filter((record) => (
    record.testCase.pattern === "negative" && record.judgment.negativeControlError
  )).length;
  const threshold = maximum * 0.8;
  const categoryThreshold = maximum * 0.7;
  return {
    cases: records.length,
    maximum,
    average: round(average),
    categoryAverages,
    criticalErrors,
    negativeControlErrors,
    pass: average >= threshold
      && Object.values(categoryAverages).every((value) => value >= categoryThreshold)
      && criticalErrors === 0
      && negativeControlErrors <= 1,
  };
}

function countBy(items, keyFn) {
  return items.reduce((counts, item) => {
    const key = keyFn(item);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function averageOf(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

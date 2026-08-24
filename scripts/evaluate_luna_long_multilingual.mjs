import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
loadDotEnv(path.join(root, ".env"));

if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required.");

const appModel = "gpt-5.6-luna";
const judgeModel = "gpt-5.6-sol";
const port = 4186;
const args = process.argv.slice(2);
const requestedCases = readOption("--cases").split(",").map((value) => value.trim()).filter(Boolean);
const allCases = JSON.parse(
  fs.readFileSync(path.join(root, "tests", "luna-long-multilingual-cases.json"), "utf8"),
).cases;
const cases = requestedCases.length
  ? allCases.filter((testCase) => requestedCases.includes(testCase.id))
  : allCases;
if (!cases.length) throw new Error("No matching long multilingual cases were selected.");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = path.join(root, "tmp", "benchmarks", timestamp);
const outputPath = path.join(outputDir, "luna-long-multilingual.json");
const logPath = path.join(outputDir, "luna-long-multilingual.server.log");
fs.mkdirSync(outputDir, { recursive: true });

const log = fs.openSync(logPath, "a");
const server = spawn(process.execPath, ["server.js"], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    OPENAI_STANDARD_MODEL: appModel,
    OPENAI_PRECISE_MODEL: appModel,
  },
  stdio: ["ignore", log, log],
  windowsHide: true,
});

const result = {
  generatedAt: new Date().toISOString(),
  appModel,
  judgeModel,
  records: [],
  summary: null,
};

try {
  await waitForServer();
  for (let index = 0; index < cases.length; index += 1) {
    const testCase = cases[index];
    console.log(`[${index + 1}/${cases.length}] ${testCase.id}`);

    const appStartedAt = performance.now();
    const annotation = await callApp(testCase);
    const appElapsedMs = Math.round(performance.now() - appStartedAt);
    const structure = inspectStructure(testCase, annotation);

    const judgeStartedAt = performance.now();
    const judgment = await judge(testCase, annotation, structure);
    const judgeElapsedMs = Math.round(performance.now() - judgeStartedAt);

    result.records.push({
      testCase,
      annotation,
      structure,
      judgment,
      timing: { appElapsedMs, judgeElapsedMs },
    });
    result.summary = summarize(result.records);
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  }
  console.log(JSON.stringify(result.summary, null, 2));
  console.log(`Saved ${outputPath}`);
} finally {
  server.kill();
  fs.closeSync(log);
}

async function waitForServer() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://localhost:${port}/api/health`);
      const health = await response.json();
      if (response.ok && health.model === appModel) return;
    } catch {}
    await delay(300);
  }
  throw new Error("Luna evaluation server did not become ready.");
}

async function callApp(testCase) {
  const response = await fetch(`http://localhost:${port}/api/annotate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: testCase.sourceText,
      sourceLanguage: testCase.language,
      explanationLanguage: "ja",
      level: "advanced",
      density: 3,
      focus: "all",
      includeGrammar: true,
      includeSlash: false,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${testCase.id} failed: ${data.message || data.error || response.status}`);
  }
  return data;
}

function inspectStructure(testCase, annotation) {
  const errors = [];
  if (annotation.sourceText !== testCase.sourceText) errors.push("sourceText was not preserved exactly");
  if (!String(annotation.translation || "").trim()) errors.push("translation is empty");
  if (!Array.isArray(annotation.annotations)) errors.push("annotations is not an array");
  if (!Array.isArray(annotation.connotations)) errors.push("connotations is not an array");

  for (const [kind, items] of [
    ["annotation", annotation.annotations || []],
    ["connotation", annotation.connotations || []],
  ]) {
    for (const item of items) {
      if (
        !Number.isInteger(item.start)
        || !Number.isInteger(item.end)
        || testCase.sourceText.slice(item.start, item.end) !== item.text
      ) {
        errors.push(`${kind} ${item.id || "unknown"} has an invalid source span`);
      }
    }
  }

  return {
    pass: errors.length === 0,
    errors,
    sourceCharacters: testCase.sourceText.length,
    translationCharacters: String(annotation.translation || "").length,
    annotationCount: Array.isArray(annotation.annotations) ? annotation.annotations.length : 0,
    connotationCount: Array.isArray(annotation.connotations) ? annotation.connotations.length : 0,
  };
}

async function judge(testCase, annotation, structure) {
  const system = [
    "Evaluate a multilingual language-learning app on one authentic long passage.",
    "Return one JSON object only.",
    "The source passage is authentic and the requested explanation language is Japanese.",
    "Score each dimension from 0 to 4:",
    "sourceHandling: preserves and correctly understands the complete passage without truncation or wrong-language confusion;",
    "translationAccuracy: faithful, complete, natural Japanese translation;",
    "annotationUsefulness: accurate, non-trivial annotations appropriate for an advanced learner without obvious padding;",
    "connotationAccuracy: grounded pragmatic, evaluative, register, metaphorical, or discourse analysis with appropriate restraint;",
    "spanContextSeparation: learner-facing highlights are narrow useful anchors while contextNote/evidence preserve any wider contrast or discourse conditions.",
    "A narrow highlight must not be treated as proof that the full nuance is lexically encoded there.",
    "The expectedSignals are coverage prompts, not claims that every signal must become a separate card.",
    "Set criticalError true for serious mistranslation, fabricated social meaning, reversed stance, systematic truncation, or unusable output.",
    "Pass only if totalScore >= 17, every dimension >= 3, structure.pass is true, and criticalError is false.",
    "Schema: {scores:{sourceHandling,translationAccuracy,annotationUsefulness,connotationAccuracy,spanContextSeparation},totalScore,criticalError,pass,reason,issues:[]}",
  ].join("\n");
  const { _api, ...judgedAnnotation } = annotation;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: judgeModel,
      reasoning: { effort: "low" },
      max_output_tokens: 4000,
      text: { verbosity: "low", format: { type: "json_object" } },
      input: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify({ testCase, annotation: judgedAnnotation, structure }) },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Judge failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  const data = await response.json();
  const parsed = parseJson(extractText(data));
  parsed._api = { model: judgeModel, usage: data.usage || null };
  return parsed;
}

function summarize(records) {
  const scoreNames = [
    "sourceHandling",
    "translationAccuracy",
    "annotationUsefulness",
    "connotationAccuracy",
    "spanContextSeparation",
  ];
  const scoreAverages = Object.fromEntries(scoreNames.map((name) => [
    name,
    round(average(records.map((record) => Number(record.judgment.scores?.[name] || 0)))),
  ]));
  const appUsage = summarizeUsage(records.map((record) => record.annotation?._api?.usage));
  const judgeUsage = summarizeUsage(records.map((record) => record.judgment?._api?.usage));
  return {
    cases: records.length,
    passed: records.filter((record) => record.judgment.pass).length,
    structuralFailures: records.filter((record) => !record.structure.pass).length,
    criticalErrors: records.filter((record) => record.judgment.criticalError).length,
    averageScore: round(average(records.map((record) => Number(record.judgment.totalScore || 0)))),
    scoreAverages,
    timing: {
      app: summarizeTiming(records.map((record) => record.timing.appElapsedMs)),
      judge: summarizeTiming(records.map((record) => record.timing.judgeElapsedMs)),
    },
    usage: { app: appUsage, judge: judgeUsage },
    estimatedCostUsd: round(
      estimateCost(appUsage, { input: 0.2, cachedInput: 0.02, output: 1.2 })
      + estimateCost(judgeUsage, { input: 4, cachedInput: 0.4, output: 20 }),
      6,
    ),
  };
}

function summarizeTiming(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
  return {
    averageMs: Math.round(average(sorted)),
    medianMs: median,
    minimumMs: sorted[0],
    maximumMs: sorted.at(-1),
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

function estimateCost(usage, rates) {
  const cached = Number(usage.cachedInputTokens || 0);
  const uncached = Math.max(0, Number(usage.inputTokens || 0) - cached);
  return (
    uncached * rates.input
    + cached * rates.cachedInput
    + Number(usage.outputTokens || 0) * rates.output
  ) / 1_000_000;
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

function readOption(name) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : "";
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

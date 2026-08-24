import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const node = process.execPath;
const args = process.argv.slice(2);
const requestedMode = readOption("--mode") || "both";
const requestedCase = readOption("--case");
const limit = Number(readOption("--limit") || 0);
const noJudge = args.includes("--no-judge");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = path.join(root, "tmp", "benchmarks", timestamp);
fs.mkdirSync(outputDir, { recursive: true });

const configs = [
  { model: "gpt-5.6-sol", port: 4181 },
  { model: "gpt-5.6-terra", port: 4182 },
  { model: "gpt-5.6-luna", port: 4183 },
];
const judgeModel = noJudge ? null : "gpt-5.6-sol";
const pricing = {
  source: "https://developers.openai.com/api/docs/models",
  capturedAt: new Date().toISOString(),
  "gpt-5.6-sol": { input: 4, cachedInput: 0.4, output: 20 },
  "gpt-5.6-terra": { input: 2, cachedInput: 0.2, output: 12 },
  "gpt-5.6-luna": { input: 0.2, cachedInput: 0.02, output: 1.2 },
};

const servers = [];
try {
  for (const config of configs) {
    const log = fs.openSync(path.join(outputDir, `${config.model}.server.log`), "a");
    const child = spawn(node, ["server.js"], {
      cwd: root,
      env: {
        ...process.env,
        PORT: String(config.port),
        OPENAI_STANDARD_MODEL: config.model,
        OPENAI_PRECISE_MODEL: config.model,
      },
      stdio: ["ignore", log, log],
      windowsHide: true,
    });
    servers.push(child);
  }

  await Promise.all(configs.map(waitForServer));
  console.log("All benchmark servers are ready.");

  const runs = await Promise.all(configs.map(runEvaluation));
  const comparison = {
    generatedAt: new Date().toISOString(),
    judgeModel,
    requestedMode,
    requestedCase: requestedCase || null,
    limit: limit || null,
    pricing,
    models: Object.fromEntries(runs.map(({ config, result, outputPath }) => [config.model, {
      outputPath,
      summary: result.summary,
      estimatedAppCostUsd: estimateCost(result.summary.usage.app, pricing[config.model]),
      estimatedJudgeCostUsd: judgeModel
        ? estimateCost(result.summary.usage.judge, pricing[judgeModel])
        : 0,
    }])),
  };
  const comparisonPath = path.join(outputDir, "comparison.json");
  fs.writeFileSync(comparisonPath, JSON.stringify(comparison, null, 2));
  console.log(JSON.stringify(comparison, null, 2));
  console.log(`Saved ${comparisonPath}`);
} finally {
  for (const child of servers) child.kill();
}

async function waitForServer(config) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://localhost:${config.port}/api/health`);
      const health = await response.json();
      if (response.ok && health.model === config.model) return;
    } catch {}
    await delay(300);
  }
  throw new Error(`${config.model} server did not become ready.`);
}

function runEvaluation(config) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(outputDir, `${config.model}.json`);
    const evaluationArgs = [
      "scripts/evaluate_connotations.mjs",
      "--mode", requestedMode,
      ...(requestedCase ? ["--case", requestedCase] : []),
      ...(limit ? ["--limit", String(limit)] : []),
      ...(noJudge ? ["--no-judge"] : []),
      outputPath,
    ];
    const child = spawn(node, evaluationArgs, {
      cwd: root,
      env: {
        ...process.env,
        CONNOTATION_EVAL_APP_URL: `http://localhost:${config.port}`,
        ...(judgeModel ? { CONNOTATION_EVAL_MODEL: judgeModel } : {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    child.stdout.on("data", (chunk) => process.stdout.write(`[${config.model}] ${chunk}`));
    child.stderr.on("data", (chunk) => process.stderr.write(`[${config.model}] ${chunk}`));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`${config.model} evaluation exited with code ${code}.`));
        return;
      }
      resolve({ config, outputPath, result: JSON.parse(fs.readFileSync(outputPath, "utf8")) });
    });
  });
}

function readOption(name) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : "";
}

function estimateCost(usage, rates) {
  const cached = Number(usage.cachedInputTokens || 0);
  const uncached = Math.max(0, Number(usage.inputTokens || 0) - cached);
  const output = Number(usage.outputTokens || 0);
  return Math.round(((uncached * rates.input + cached * rates.cachedInput + output * rates.output) / 1_000_000) * 1e6) / 1e6;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

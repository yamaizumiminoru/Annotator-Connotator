import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const port = 4187;
const models = {
  standard: "gpt-5.6-luna",
  precise: "gpt-5.6-sol",
};
const server = spawn(process.execPath, ["server.js"], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    OPENAI_STANDARD_MODEL: models.standard,
    OPENAI_PRECISE_MODEL: models.precise,
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

try {
  await waitForServer();
  const results = {};
  for (const mode of ["standard", "precise"]) {
    const startedAt = performance.now();
    const response = await fetch(`http://localhost:${port}/api/annotate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: "This proposal is ambitious, but it may be difficult to implement as written.",
        sourceLanguage: "en",
        explanationLanguage: "ja",
        analysisMode: mode,
        level: "advanced",
        density: 1,
        focus: "all",
        includeGrammar: true,
        includeSlash: false,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${mode} failed: ${data.message || data.error || response.status}`);
    if (data._api?.model !== models[mode]) {
      throw new Error(`${mode} used ${data._api?.model || "no model"}; expected ${models[mode]}`);
    }
    results[mode] = {
      model: data._api.model,
      elapsedMs: Math.round(performance.now() - startedAt),
      annotations: data.annotations?.length || 0,
      connotations: data.connotations?.length || 0,
    };
  }
  console.log(JSON.stringify(results, null, 2));
} finally {
  server.kill();
}

async function waitForServer() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://localhost:${port}/api/health`);
      const health = await response.json();
      if (
        response.ok
        && health.models?.standard === models.standard
        && health.models?.precise === models.precise
      ) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("Model-mode smoke server did not become ready.");
}

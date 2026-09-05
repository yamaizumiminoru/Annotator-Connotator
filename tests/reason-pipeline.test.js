const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const vm = require("node:vm");
const { spawn } = require("node:child_process");

test("production HTTP pipeline preserves independently judged targets across levels and browser redisplay", { timeout: 15000 }, async (t) => {
  const root = path.resolve(__dirname, "..");
  const port = await findFreePort();
  const messages = [];
  const child = spawn(process.execPath, ["tests/helpers/reason-pipeline-server.cjs"], {
    cwd: root,
    env: {
      ...process.env, PORT: String(port), HOST: "127.0.0.1", ALLOW_NETWORK: "", CORS_ORIGINS: "",
      OPENAI_API_KEY: "local-test-placeholder", OPENAI_STANDARD_MODEL: "mock-model",
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  child.on("message", (message) => messages.push(message));
  t.after(() => child.kill());
  await waitForServer(child);

  const source = "When contact intensifies, the basic time construction remains the same. "
    + "This background sentence provides context without introducing another teaching target. ".repeat(9)
    + "Later we take into account the French term phonèmes. The distinction holds in principle, even in a counterfactual example.";
  assert.ok(source.length > 800 && source.length < 1200);
  const browser = {};
  vm.runInNewContext(fs.readFileSync(path.join(root, "lib/reason-selection.js"), "utf8"), browser);
  const expectedTargets = ["When contact intensifies", "intensifies", "take into account", "phonèmes", "in principle", "counterfactual"];

  for (const level of ["beginner", "intermediate", "advanced"]) {
    for (const density of [1, 2, 3]) {
      const response = await fetch(`http://127.0.0.1:${port}/api/annotate`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: source, sourceLanguage: "en", explanationLanguage: "ja", level: "beginner", levels: [level], density,
          includeTranslation: false, includeSlash: false, includeGrammar: true, forceRefresh: true,
        }),
      });
      const result = await response.json();
      assert.equal(response.status, 200, JSON.stringify(result));
      const expected = level === "beginner"
        ? ["When contact intensifies"]
        : level === "intermediate"
          ? ["take into account", ...(density === 3 ? ["in principle"] : [])]
          : [...(density >= 2 ? ["intensifies", "phonèmes"] : []), "counterfactual"];
      assert.deepEqual(result.annotations.map((item) => item.text), expected, `${level}: density ${density}`);
      const pool = result._selection.candidates;
      assert.deepEqual([...pool.map((item) => item.text)].sort(), [...expectedTargets].sort());
      assert.equal(new Set(pool.map((item) => item.id)).size, pool.length, "every target needs its own display identity");
      for (const item of pool) assert.equal(source.slice(item.start, item.end), item.text);
      assert.equal(pool.find((item) => item.text === "When contact intensifies").judgeMeta.annotationValueByBand.beginner, "high");
      assert.equal(pool.find((item) => item.text === "intensifies").judgeMeta.componentLexicalBand, "advanced");
      assert.equal(pool.find((item) => item.text === "take into account").judgeMeta.annotationValueByBand.intermediate, "high");
      const redisplayed = browser.REASON_SELECTION.selectAnnotationsByDensity(pool, density, [level]);
      assert.equal(JSON.stringify(redisplayed.map((item) => item.text)), JSON.stringify(expected));
    }
  }

  const discoveries = messages.filter((message) => message.kind === "discovery");
  const judges = messages.filter((message) => message.kind === "judge");
  assert.equal(discoveries.length, 9, "every forced analysis must traverse installed discovery wrappers");
  assert.equal(judges.length, 9, "every discovered pool must reach the installed contextual judge");
  for (const discovery of discoveries) {
    assert.ok(discovery.regionCounts.length >= 2 && discovery.regionCounts.filter(Boolean).length >= 2);
    assert.doesNotMatch(discovery.prompt, /Do not annotate overlapping spans|preserving the no-overlap rule/i);
    assert.doesNotMatch(discovery.prompt, /Do not pad with ordinary B1-B2 literal vocabulary/i);
  }
  for (const judge of judges) {
    assert.deepEqual([...judge.candidates.map((item) => item.text)].sort(), [...expectedTargets].sort());
    assert.equal(new Set(judge.candidates.map((item) => item.id)).size, expectedTargets.length);
  }
});

function findFreePort() {
  return new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const port = listener.address().port;
      listener.close(() => resolve(port));
    });
  });
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Mocked annotation server did not start")), 8000);
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.stdout.on("data", (chunk) => {
      if (!String(chunk).includes("Annotator-Connotator:")) return;
      clearTimeout(timer);
      resolve();
    });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Mocked annotation server exited with ${code}: ${stderr}`)); });
  });
}

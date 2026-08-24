const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");
const {
  isAllowedOrigin,
  isCostIncurringRequest,
  resolveNetworkConfig,
} = require("../lib/server-security");

test("defaults to loopback and rejects implicit non-loopback binding", () => {
  assert.equal(resolveNetworkConfig({}, 4174).host, "127.0.0.1");
  assert.throws(
    () => resolveNetworkConfig({ HOST: "0.0.0.0" }, 4174),
    /ALLOW_NETWORK=1/,
  );
  assert.equal(resolveNetworkConfig({ ALLOW_NETWORK: "1" }, 4174).host, "0.0.0.0");
});

test("allows local app origins and requires explicit cross-origin access", () => {
  const local = resolveNetworkConfig({}, 4174);
  assert.equal(isAllowedOrigin("", "localhost:4174", local), true);
  assert.equal(isAllowedOrigin("http://localhost:4174", "localhost:4174", local), true);
  assert.equal(isAllowedOrigin("http://127.0.0.1:4174", "127.0.0.1:4174", local), true);
  assert.equal(isAllowedOrigin("https://example.test", "localhost:4174", local), false);

  const explicit = resolveNetworkConfig({ CORS_ORIGINS: "https://example.test" }, 4174);
  assert.equal(isAllowedOrigin("https://example.test", "localhost:4174", explicit), true);
});

test("identifies the local POST endpoints that can incur API usage", () => {
  assert.equal(isCostIncurringRequest("POST", "/api/annotate"), true);
  assert.equal(isCostIncurringRequest("POST", "/api/youtube-transcript?x=1"), true);
  assert.equal(isCostIncurringRequest("POST", "/api/ui-translations"), true);
  assert.equal(isCostIncurringRequest("GET", "/api/health"), false);
});

test("server rejects an arbitrary browser origin without exposing wildcard CORS", async (t) => {
  const port = await findFreePort();
  const root = path.resolve(__dirname, "..");
  const child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "",
      ALLOW_NETWORK: "",
      CORS_ORIGINS: "",
      OPENAI_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill());

  await waitForServer(child, port);
  const health = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(health.status, 200);
  assert.notEqual(health.headers.get("access-control-allow-origin"), "*");

  const rejected = await fetch(`http://127.0.0.1:${port}/api/annotate`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://example.test" },
    body: JSON.stringify({ text: "A local test." }),
  });
  assert.equal(rejected.status, 403);
  assert.equal((await rejected.json()).error, "origin_forbidden");

  const local = await fetch(`http://127.0.0.1:${port}/api/annotate`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: `http://localhost:${port}` },
    body: JSON.stringify({ text: "A local test." }),
  });
  assert.equal(local.status, 400);
  assert.equal((await local.json()).error, "missing_api_key");

  const formerlyRejectedLongText = await fetch(`http://127.0.0.1:${port}/api/annotate`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: `http://localhost:${port}` },
    body: JSON.stringify({ text: "Long lecture sentence. ".repeat(1000) }),
  });
  assert.equal(formerlyRejectedLongText.status, 400);
  assert.equal((await formerlyRejectedLongText.json()).error, "missing_api_key");
});

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function waitForServer(child, port) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`server ${port} did not start`)), 8000);
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.stdout.on("data", (chunk) => {
      if (!String(chunk).includes("Annotator-Connotator:")) return;
      clearTimeout(timeout);
      resolve();
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`server exited with ${code}: ${stderr}`));
    });
  });
}

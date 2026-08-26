const test = require("node:test");
const assert = require("node:assert/strict");
const {
  AnalysisResponseError,
  isCancellation,
  parseEvents,
  readProgressResponse,
  shouldShowTranslation,
} = require("../client-analysis");

test("reads chunk progress and the final streamed result", async () => {
  const progress = [];
  const response = new Response([
    JSON.stringify({ type: "progress", stage: "analyzing", current: 1, total: 2 }),
    JSON.stringify({ type: "progress", stage: "merging", current: 2, total: 2 }),
    JSON.stringify({ type: "result", result: { sourceText: "done" } }),
    "",
  ].join("\n"), { headers: { "content-type": "application/x-ndjson" } });

  const result = await readProgressResponse(response, (event) => progress.push(event.stage));
  assert.deepEqual(progress, ["analyzing", "merging"]);
  assert.equal(result.sourceText, "done");
});

test("distinguishes partial failure and cancellation from an ordinary response", () => {
  assert.throws(() => parseEvents(JSON.stringify({
    type: "error",
    error: "long_form_partial_failure",
    completedChunks: 2,
    totalChunks: 4,
  })), (error) => {
    assert.ok(error instanceof AnalysisResponseError);
    assert.equal(error.completedChunks, 2);
    return true;
  });
  const controller = new AbortController();
  controller.abort();
  assert.equal(isCancellation(new Error("network"), controller.signal), true);
  assert.equal(isCancellation({ error: "analysis_cancelled" }), true);
  assert.equal(isCancellation(new Error("network")), false);
});

test("shows translation only when it is requested and nonempty", () => {
  assert.equal(shouldShowTranslation(false, "翻訳"), false);
  assert.equal(shouldShowTranslation(true, ""), false);
  assert.equal(shouldShowTranslation(true, "   "), false);
  assert.equal(shouldShowTranslation(true, "翻訳"), true);
});

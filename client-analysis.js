(function initClientAnalysis(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CLIENT_ANALYSIS = api;
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  class AnalysisResponseError extends Error {
    constructor(event) {
      super(event.message || event.error || "Analysis failed.");
      this.name = "AnalysisResponseError";
      Object.assign(this, event);
    }
  }

  async function readProgressResponse(response, onProgress = () => {}) {
    if (!response.body?.getReader) return parseEvents(await response.text(), onProgress);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result = null;

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split("\n");
      buffer = done ? "" : lines.pop();
      for (const line of lines) result = processEventLine(line, onProgress, result);
      if (done) break;
    }
    if (buffer.trim()) result = processEventLine(buffer, onProgress, result);
    if (!result) throw new AnalysisResponseError({ error: "missing_result", message: "Analysis returned no result." });
    return result;
  }

  function parseEvents(text, onProgress = () => {}) {
    let result = null;
    for (const line of String(text || "").split(/\r?\n/)) {
      result = processEventLine(line, onProgress, result);
    }
    if (!result) throw new AnalysisResponseError({ error: "missing_result", message: "Analysis returned no result." });
    return result;
  }

  function processEventLine(line, onProgress, currentResult) {
    if (!String(line || "").trim()) return currentResult;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      throw new AnalysisResponseError({ error: "invalid_progress_stream", message: "Invalid progress response." });
    }
    if (event.type === "progress") {
      onProgress(event);
      return currentResult;
    }
    if (event.type === "error") throw new AnalysisResponseError(event);
    if (event.type === "result") return event.result;
    return currentResult;
  }

  function isCancellation(error, signal) {
    return Boolean(
      signal?.aborted
      || error?.name === "AbortError"
      || error?.code === "ABORT_ERR"
      || error?.error === "analysis_cancelled",
    );
  }

  return { AnalysisResponseError, isCancellation, parseEvents, readProgressResponse };
}));

(function prepareReasonSelectionClient(root) {
  if (!root?.document || typeof root.localStorage === "undefined") return;
  const valid = new Set(["beginner", "intermediate", "advanced"]);
  if (!root.localStorage.getItem("annotation.levels")) {
    const legacy = root.localStorage.getItem("annotation.level");
    const initial = valid.has(legacy) ? [legacy] : ["intermediate"];
    root.localStorage.setItem("annotation.levels", JSON.stringify(initial));
  }
  // Keep the legacy single-level pipeline on its broadest setting; real selected bands travel separately.
  root.localStorage.setItem("annotation.level", "beginner");

  root.addEventListener("load", () => {
    loadScript("./lib/reason-selection.js")
      .then(() => loadScript("./reason-selection-client.js"))
      .catch(() => {
        // Optional enhancement: the original app remains usable if these files fail to load.
      });
  });

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = root.document.createElement("script");
      script.src = src;
      script.async = false;
      script.onload = resolve;
      script.onerror = reject;
      root.document.body.appendChild(script);
    });
  }
}(typeof globalThis !== "undefined" ? globalThis : window));

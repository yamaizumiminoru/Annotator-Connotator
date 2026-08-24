(function initClientSession(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && root.document) {
    root.ANNOTATOR_CLIENT_SESSION = api;
    api.install(root);
  }
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const UI_ADDITIONS = {
    ja: {
      usageInput: "入力",
      usageOutput: "出力",
      usageTotal: "合計",
      usageTokens: "tokens",
      usageStandard: "通常",
      usagePrecise: "精密",
      usageChunks: "{count}セクション",
      usageLocalCache: "ローカルキャッシュ",
    },
    en: {
      usageInput: "input",
      usageOutput: "output",
      usageTotal: "total",
      usageTokens: "tokens",
      usageStandard: "standard",
      usagePrecise: "precise",
      usageChunks: "{count} sections",
      usageLocalCache: "local cache",
    },
  };

  function installUiText(root) {
    root.UI_TEXT = root.UI_TEXT || {};
    for (const language of ["ja", "en"]) {
      root.UI_TEXT[language] = {
        ...(root.UI_TEXT[language] || {}),
        ...UI_ADDITIONS[language],
      };
    }
  }

  function shortModelName(model) {
    const value = String(model || "").trim();
    if (!value) return "";
    if (/luna/i.test(value)) return "Luna";
    if (/sol/i.test(value)) return "Sol";
    return value;
  }

  function usageModeLabel(mode, text) {
    return mode === "precise" ? text.usagePrecise : text.usageStandard;
  }

  function interpolate(template, values = {}) {
    let text = String(template || "");
    for (const [key, value] of Object.entries(values)) {
      text = text.replaceAll(`{${key}}`, String(value));
    }
    return text;
  }

  function uiText(root) {
    const language = root.document?.getElementById("uiLangSelect")?.value || "ja";
    return UI_ADDITIONS[language] || UI_ADDITIONS.en;
  }

  function formatUsageMetadata(api, text = UI_ADDITIONS.en, locale = "en") {
    if (!api || typeof api !== "object") return "";
    const usage = api.usage;
    if (!usage || typeof usage !== "object") return "";

    const formatter = new Intl.NumberFormat(locale || "en");
    const parts = [];
    const model = shortModelName(api.model);
    if (model) parts.push(model);
    if (api.analysisMode) parts.push(usageModeLabel(api.analysisMode, text));
    if (Number(api.chunkCount) > 1) {
      parts.push(interpolate(text.usageChunks, { count: formatter.format(Number(api.chunkCount)) }));
    }
    if (api.localCache) parts.push(text.usageLocalCache);

    const input = Number(usage.input_tokens);
    const output = Number(usage.output_tokens);
    const total = Number(usage.total_tokens);
    if (Number.isFinite(input)) parts.push(`${text.usageInput} ${formatter.format(input)}`);
    if (Number.isFinite(output)) parts.push(`${text.usageOutput} ${formatter.format(output)}`);
    if (Number.isFinite(total)) parts.push(`${text.usageTotal} ${formatter.format(total)} ${text.usageTokens}`);
    return parts.join(" · ");
  }

  function extractResultFromNdjson(text) {
    let result = null;
    for (const line of String(text || "").split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (event.type === "result" && event.result) result = event.result;
      } catch {
        // The main stream reader reports malformed progress data; metadata display stays optional.
      }
    }
    return result;
  }

  function install(root) {
    installUiText(root);
    const originalFetch = root.fetch.bind(root);
    let lastApi = null;

    function renderMetadata() {
      const element = root.document.getElementById("analysisMeta");
      if (!element) return;
      const language = root.document.getElementById("uiLangSelect")?.value || "ja";
      const text = uiText(root);
      const rendered = formatUsageMetadata(lastApi, text, language);
      element.textContent = rendered;
      element.hidden = !rendered;
    }

    function publishResult(result) {
      if (!result?._api) return;
      lastApi = result._api;
      renderMetadata();
      root.dispatchEvent(new CustomEvent("annotator:analysis-result", { detail: result }));
    }

    async function captureResponse(response) {
      try {
        if (!response.ok) return;
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/x-ndjson")) {
          publishResult(extractResultFromNdjson(await response.text()));
          return;
        }
        if (contentType.includes("application/json")) {
          publishResult(await response.json());
        }
      } catch {
        // Usage metadata must never interfere with the main analysis path.
      }
    }

    root.fetch = async function sessionAwareFetch(input, init) {
      const response = await originalFetch(input, init);
      try {
        const url = new URL(typeof input === "string" ? input : input.url, root.location.href);
        const method = String(init?.method || (typeof input !== "string" ? input.method : "GET") || "GET").toUpperCase();
        if (method === "POST" && url.pathname === "/api/annotate") {
          void captureResponse(response.clone());
        }
      } catch {
        // Fall through unchanged when request inspection is unavailable.
      }
      return response;
    };

    root.document.getElementById("uiLangSelect")?.addEventListener("change", () => {
      root.setTimeout(renderMetadata, 0);
    });
  }

  return {
    UI_ADDITIONS,
    extractResultFromNdjson,
    formatUsageMetadata,
    install,
    shortModelName,
  };
}));

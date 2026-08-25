(function initClientSession(root, factory) {
  const analysisCore = typeof module === "object" && module.exports
    ? require("./lib/analysis-core.js")
    : root?.ANALYSIS_CORE;
  const api = factory(analysisCore);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && root.document) {
    root.ANNOTATOR_CLIENT_SESSION = api;
    api.install(root);
  }
}(typeof globalThis !== "undefined" ? globalThis : this, (analysisCore) => {
  const DB_NAME = "annotator-connotator";
  const DB_VERSION = 1;
  const STORE_NAME = "analysis-results";
  const MAX_CACHE_ENTRIES = 20;

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
      reanalyzeFresh: "再解析",
      reanalyzeFreshTitle: "保存済み結果を使わず、モデルでもう一度解析する",
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
      reanalyzeFresh: "Re-run",
      reanalyzeFreshTitle: "Run the model again instead of using a saved result",
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
        // The main stream reader reports malformed progress data; metadata/cache stays optional.
      }
    }
    return result;
  }

  function normalizePriority(value) {
    const priority = Math.round(Number(value));
    return Number.isFinite(priority) ? Math.min(5, Math.max(1, priority)) : 3;
  }

  function reliabilityScore(value) {
    return { high: 3, medium: 2, low: 1 }[String(value || "medium").toLowerCase()] || 2;
  }

  function rankCandidates(candidates) {
    return (Array.isArray(candidates) ? candidates : []).map((item, index) => ({
      ...item,
      priority: normalizePriority(item?.priority),
      reliability: ["high", "medium", "low"].includes(String(item?.reliability || "").toLowerCase())
        ? String(item.reliability).toLowerCase()
        : "medium",
      _modelOrder: index,
    })).sort((a, b) => (
      b.priority - a.priority
      || reliabilityScore(b.reliability) - reliabilityScore(a.reliability)
      || a._modelOrder - b._modelOrder
    )).map(({ _modelOrder, ...item }) => item);
  }

  function selectCandidatesByDensity(candidates, density) {
    const ranked = rankCandidates(candidates);
    if (!ranked.length) return [];
    const ratio = Number(density) <= 1 ? 0.4 : Number(density) >= 3 ? 1 : 0.7;
    const count = Math.max(1, Math.ceil(ranked.length * ratio));
    return ranked.slice(0, count)
      .sort((a, b) => Number(a.start || 0) - Number(b.start || 0) || Number(a.end || 0) - Number(b.end || 0));
  }

  function stripSelectionFields(annotation) {
    const { priority, reliability, ...publicAnnotation } = annotation || {};
    return publicAnnotation;
  }

  function densityName(density) {
    return Number(density) <= 1 ? "low" : Number(density) >= 3 ? "high" : "standard";
  }

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function applyDensityToCachedResult(result, density) {
    if (!result || typeof result !== "object") return null;
    const copy = cloneJson(result);
    const candidates = copy._selection?.version === analysisCore?.CACHE_SCHEMA_VERSION
      && Array.isArray(copy._selection?.candidates)
      ? copy._selection.candidates
      : null;

    if (!candidates) {
      if (copy._api?.density && copy._api.density !== densityName(density)) return null;
    } else {
      copy.annotations = selectCandidatesByDensity(candidates, density).map(stripSelectionFields);
      copy._api = {
        ...(copy._api || {}),
        density: densityName(density),
        candidateCount: candidates.length,
        displayedAnnotationCount: copy.annotations.length,
      };
    }

    copy._api = {
      ...(copy._api || {}),
      localCache: true,
    };
    return copy;
  }

  function cacheMaterialString(payload, model) {
    if (!analysisCore?.cacheMaterial || !analysisCore?.stableSerialize) return "";
    return analysisCore.stableSerialize(analysisCore.cacheMaterial({
      ...payload,
      model,
      version: analysisCore.CACHE_SCHEMA_VERSION,
    }));
  }

  async function sha256Hex(root, value) {
    const text = String(value || "");
    if (!root.crypto?.subtle || typeof TextEncoder === "undefined") {
      let hash = 2166136261;
      for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      return `fallback-${text.length}-${(hash >>> 0).toString(16)}`;
    }
    const bytes = new TextEncoder().encode(text);
    const digest = await root.crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function buildCacheKey(root, payload, model) {
    const material = cacheMaterialString(payload, model);
    if (!material) return "";
    return `${analysisCore.CACHE_SCHEMA_VERSION}:${await sha256Hex(root, material)}`;
  }

  function openCacheDb(root) {
    if (!root.indexedDB) return Promise.resolve(null);
    return new Promise((resolve) => {
      const request = root.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
          store.createIndex("savedAt", "savedAt", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
  }

  async function getCacheEntry(root, key) {
    if (!key) return null;
    const db = await openCacheDb(root);
    if (!db) return null;
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  }

  async function putCacheEntry(root, entry) {
    if (!entry?.key) return;
    const db = await openCacheDb(root);
    if (!db) return;
    await new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(entry);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    });
    void pruneCache(root);
  }

  async function pruneCache(root) {
    const db = await openCacheDb(root);
    if (!db) return;
    const entries = await new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
    if (entries.length <= MAX_CACHE_ENTRIES) return;
    const remove = entries.sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0))
      .slice(MAX_CACHE_ENTRIES);
    await new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      for (const entry of remove) store.delete(entry.key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    });
  }

  function parseJsonBody(init) {
    if (typeof init?.body !== "string") return null;
    try {
      return JSON.parse(init.body);
    } catch {
      return null;
    }
  }

  function forceRefreshInit(init, payload) {
    return {
      ...init,
      body: JSON.stringify({ ...payload, forceRefresh: true }),
    };
  }

  function collectUiPayload(root) {
    const text = root.document.getElementById("sourceText")?.value?.trim() || "";
    return {
      text,
      sourceLanguage: root.document.getElementById("sourceLangSelect")?.value || "auto",
      explanationLanguage: root.document.getElementById("explanationLangSelect")?.value || "ja",
      analysisMode: root.document.querySelector(".analysis-mode-segment.active")?.dataset.analysisMode || "standard",
      level: root.document.querySelector(".segment.active[data-level]")?.dataset.level || "intermediate",
      density: Number(root.document.getElementById("densityRange")?.value || 2),
      focus: root.document.getElementById("focusSelect")?.value || "all",
      includeGrammar: root.document.getElementById("includeGrammar")?.checked !== false,
      includeSlash: root.document.getElementById("includeSlash")?.checked !== false,
    };
  }

  function install(root) {
    installUiText(root);
    const originalFetch = root.fetch.bind(root);
    let lastApi = null;
    let models = null;
    let modelPromise = null;
    let forceNextAnalysis = false;

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

    async function captureFreshResponse(response, payload) {
      try {
        if (!response.ok) return;
        const contentType = response.headers.get("content-type") || "";
        let result = null;
        if (contentType.includes("application/x-ndjson")) {
          result = extractResultFromNdjson(await response.text());
        } else if (contentType.includes("application/json")) {
          result = await response.json();
        }
        if (!result?._api) return;
        publishResult(result);
        const model = String(result._api.model || "");
        if (!model) return;
        const key = await buildCacheKey(root, payload, model);
        if (!key) return;
        await putCacheEntry(root, {
          key,
          savedAt: Date.now(),
          version: analysisCore.CACHE_SCHEMA_VERSION,
          model,
          result,
        });
      } catch {
        // Cache/metadata is an optimization and must not break analysis rendering.
      }
    }

    async function ensureModels() {
      if (models?.standard && models?.precise) return models;
      if (modelPromise) return modelPromise;
      modelPromise = (async () => {
        try {
          const response = await originalFetch("/api/health");
          const data = await response.json();
          models = data.models || { standard: data.model, precise: data.model };
          return models;
        } catch {
          return null;
        } finally {
          modelPromise = null;
        }
      })();
      return modelPromise;
    }

    function rememberHealthResponse(response) {
      void (async () => {
        try {
          if (!response.ok) return;
          const data = await response.json();
          models = data.models || { standard: data.model, precise: data.model };
        } catch {
          // Ignore; cache lookup will ask health directly when needed.
        }
      })();
    }

    async function modelForPayload(payload) {
      const current = await ensureModels();
      if (!current) return "";
      return payload.analysisMode === "precise" ? String(current.precise || "") : String(current.standard || "");
    }

    async function cachedResultForPayload(payload) {
      const model = await modelForPayload(payload);
      if (!model) return null;
      const key = await buildCacheKey(root, payload, model);
      const entry = await getCacheEntry(root, key);
      if (!entry || entry.version !== analysisCore.CACHE_SCHEMA_VERSION || entry.model !== model) return null;
      return applyDensityToCachedResult(entry.result, payload.density);
    }

    root.fetch = async function sessionAwareFetch(input, init) {
      let url;
      try {
        url = new URL(typeof input === "string" ? input : input.url, root.location.href);
      } catch {
        return originalFetch(input, init);
      }
      const method = String(init?.method || (typeof input !== "string" ? input.method : "GET") || "GET").toUpperCase();

      if (method === "GET" && url.pathname === "/api/health") {
        const response = await originalFetch(input, init);
        rememberHealthResponse(response.clone());
        return response;
      }

      if (method === "POST" && url.pathname === "/api/annotate") {
        const payload = parseJsonBody(init);
        const bypassCache = forceNextAnalysis;
        forceNextAnalysis = false;
        if (payload && !bypassCache) {
          try {
            const cached = await cachedResultForPayload(payload);
            if (cached) {
              publishResult(cached);
              return new Response(JSON.stringify(cached), {
                status: 200,
                headers: { "content-type": "application/json; charset=utf-8" },
              });
            }
          } catch {
            // A cache failure falls back to the normal paid request.
          }
        }

        const requestInit = bypassCache && payload ? forceRefreshInit(init, payload) : init;
        const response = await originalFetch(input, requestInit);
        if (payload) void captureFreshResponse(response.clone(), payload);
        return response;
      }

      return originalFetch(input, init);
    };

    root.document.getElementById("reanalyzeBtn")?.addEventListener("click", () => {
      const analyzeButton = root.document.getElementById("annotateBtn");
      if (!analyzeButton || analyzeButton.disabled) return;
      forceNextAnalysis = true;
      analyzeButton.click();
    });

    root.document.getElementById("uiLangSelect")?.addEventListener("change", () => {
      root.setTimeout(renderMetadata, 0);
    });
  }

  return {
    UI_ADDITIONS,
    applyDensityToCachedResult,
    cacheMaterialString,
    collectUiPayload,
    densityName,
    extractResultFromNdjson,
    forceRefreshInit,
    formatUsageMetadata,
    install,
    rankCandidates,
    selectCandidatesByDensity,
    shortModelName,
  };
}));

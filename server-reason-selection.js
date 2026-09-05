const http = require("http");
const { AsyncLocalStorage } = require("async_hooks");
const selection = require("./lib/annotation-selection");
const reasonSelection = require("./lib/reason-selection");
const reasonJudge = require("./lib/reason-judge");
const regionalDiscovery = require("./lib/regional-discovery");
const languageRouting = require("./lib/explanation-language-routing");
const intensiveMode = require("./lib/intensive-mode");

const requestContext = new AsyncLocalStorage();
const nativeFetch = global.fetch.bind(global);
const nativeCreateServer = http.createServer.bind(http);
const originalWholePassageSelectionRules = selection.wholePassageSelectionRules;
const originalCoveragePrompt = selection.buildCoverageCompletionPrompt;

http.createServer = function createReasonAwareServer(handler) {
  return nativeCreateServer((req, res) => {
    const context = {
      levels: ["intermediate"],
      density: 2,
      explanationLanguage: "",
      extractionMode: intensiveMode.STANDARD_MODE,
    };
    let bodyText = "";
    req.on("data", (chunk) => {
      bodyText += chunk;
    });
    req.on("end", () => {
      if (!bodyText) return;
      try {
        const payload = JSON.parse(bodyText);
        context.levels = reasonSelection.normalizeSelectedLevels(payload.levels || payload.level || "intermediate");
        context.density = Number(payload.density || 2);
        context.explanationLanguage = String(payload.explanationLanguage || "");
        context.extractionMode = intensiveMode.normalizeMode(payload.extractionMode);
      } catch {
        // The real server will report malformed JSON. Context remains a harmless default.
      }
    });
    return requestContext.run(context, () => handler(req, res));
  });
};

selection.selectAnnotationsByDensity = function selectReasonTaggedAnnotations(candidates, density) {
  const context = requestContext.getStore();
  const levels = context?.levels || ["intermediate"];
  const effectiveDensity = intensiveMode.isIntensive(context?.extractionMode) ? 3 : density;
  return reasonSelection.selectAnnotationsByDensity(candidates, effectiveDensity, levels);
};
selection.stripInternalSelectionFields = reasonSelection.stripInternalSelectionFields;
selection.wholePassageSelectionRules = function broadWholePassageSelectionRules(target) {
  const base = originalWholePassageSelectionRules(target).filter((line) => !/learner-level threshold/i.test(line));
  const rules = [
    ...base,
    "Ordinary candidate discovery is deliberately broad across beginner, intermediate, and advanced learning targets. Learner-band eligibility is decided in a separate contextual judge after discovery.",
    "Do not discard an expression merely because its component words look easy: idioms, phrasal verbs, metaphorical or extended senses, reusable constructions, and technical terms may still be valuable.",
    "Actively look for phrasal verbs, idioms, fixed expressions, and nonliteral or extended uses. Do not omit them merely because their component words are basic or familiar.",
    "These broad-discovery rules apply only to ordinary annotations. Keep connotation discovery sparse, grounded, and precision-first.",
  ];
  if (intensiveMode.isIntensive(requestContext.getStore()?.extractionMode)) {
    rules.push(
      "This request uses intensive close-reading mode. Discover substantially more medium-value teachable candidates than normal mode, preserving overlapping candidates when they teach different things.",
    );
  }
  return rules;
};
selection.buildCoverageCompletionPrompt = function broadCoverageCompletionPrompt(args) {
  return reasonJudge.broadenCoveragePrompt(originalCoveragePrompt(args));
};

global.fetch = async function reasonAwareFetch(input, init = {}) {
  const url = typeof input === "string" ? input : String(input?.url || input || "");
  if (!url.startsWith("https://api.openai.com/v1/responses") || typeof init.body !== "string") {
    return nativeFetch(input, init);
  }

  let body;
  try {
    body = JSON.parse(init.body);
  } catch {
    return nativeFetch(input, init);
  }

  let system = systemPrompt(body);
  const initialUserPayload = parseUserPayload(body);
  const requestedExplanationLanguage = String(
    initialUserPayload.explanationLanguage
      || requestContext.getStore()?.explanationLanguage
      || "",
  );
  const routedSystem = languageRouting.rewriteUiTargetLanguagePrompt(
    languageRouting.rewriteExplanationLanguagePrompt(system, requestedExplanationLanguage),
  );
  let routedBody = false;
  if (routedSystem !== system) {
    body = cloneJson(body);
    rewriteSystemPrompt(body, routedSystem);
    system = routedSystem;
    routedBody = true;
  }

  const isAnnotation = system.includes("You are a multilingual language-learning annotation engine.");
  const isCompletion = system.includes("You are completing candidate discovery for the later portion");
  const isConnotationTargetTest = system.includes("This is an explanation test.")
    || system.includes("Supplied connotation targets:");

  if (!isAnnotation && !isCompletion) {
    return routedBody
      ? nativeFetch(input, { ...init, body: JSON.stringify(body) })
      : nativeFetch(input, init);
  }
  if (isConnotationTargetTest) return nativeFetch(input, { ...init, body: JSON.stringify(body) });

  const modifiedBody = cloneJson(body);
  const originalUserPayload = parseUserPayload(modifiedBody);
  const sourceText = isCompletion
    ? String(originalUserPayload.reviewText || "")
    : String(originalUserPayload.sourceText || "");
  const scanRegions = isAnnotation
    ? regionalDiscovery.buildScanRegions(sourceText)
    : [];
  const context = requestContext.getStore();
  const intensive = isAnnotation
    && intensiveMode.isIntensive(context?.extractionMode)
    && !intensiveMode.isTooLong(sourceText);
  const hardMaximum = intensive
    ? intensiveMode.intensiveCandidateMaximum(sourceText)
    : selection.candidateDiscoveryTarget(sourceText);
  const broadPrompt = isAnnotation
    ? reasonJudge.broadenAnnotationPrompt(system)
    : reasonJudge.broadenCoveragePrompt(system);
  const regionalPrompt = isAnnotation
    ? regionalDiscovery.regionalizeAnnotationPrompt(broadPrompt, {
        regions: scanRegions,
        hardMaximum,
      })
    : broadPrompt;
  rewriteSystemPrompt(
    modifiedBody,
    intensive
      ? intensiveMode.augmentAnnotationPrompt(regionalPrompt, { hardMaximum })
      : regionalPrompt,
  );
  if (isAnnotation) rewriteUserPayload(modifiedBody, {
    ...originalUserPayload,
    scanRegions: scanRegions.map((region) => ({
      regionIndex: region.index + 1,
      start: region.start,
      end: region.end,
      regionText: region.text,
    })),
  });

  const response = await nativeFetch(input, { ...init, body: JSON.stringify(modifiedBody) });
  if (!response.ok) return response;

  let apiData;
  try {
    apiData = await response.clone().json();
  } catch {
    return response;
  }

  let parsed;
  try {
    parsed = parseJsonObject(extractOutputText(apiData));
  } catch {
    return response;
  }
  if (isAnnotation) {
    const flattened = regionalDiscovery.flattenRegionalAnnotations(
      sourceText,
      scanRegions,
      parsed.regions,
    );
    parsed.annotations = flattened.annotations;
    parsed._regionalDiscovery = {
      ...flattened.telemetry,
      extractionMode: intensive ? intensiveMode.INTENSIVE_MODE : intensiveMode.STANDARD_MODE,
      hardMaximum,
    };
    delete parsed.regions;
  }
  if (!Array.isArray(parsed.annotations) || !parsed.annotations.length) {
    setOutputText(apiData, JSON.stringify(parsed));
    return jsonResponseLike(response, apiData);
  }

  const userPayload = parseUserPayload(modifiedBody);
  if (!sourceText) return response;

  const surrounding = isCompletion
    ? { before: String(userPayload.precedingContext || ""), after: "" }
    : reasonJudge.extractChunkContext(system);
  const items = reasonJudge.buildJudgeItems(sourceText, parsed.annotations, surrounding);
  if (!items.length) return response;

  let judgeData;
  try {
    judgeData = await callJudge(modifiedBody, init, items);
  } catch {
    return response;
  }

  let judgeParsed;
  try {
    judgeParsed = parseJsonObject(extractOutputText(judgeData));
  } catch {
    return response;
  }

  const levels = requestContext.getStore()?.levels || ["intermediate"];
  parsed.annotations = reasonJudge.applyJudgments(parsed.annotations, judgeParsed.judgments, levels);
  setOutputText(apiData, JSON.stringify(parsed));
  apiData.usage = mergeUsage(apiData.usage, judgeData.usage);
  return jsonResponseLike(response, apiData);
};

function systemPrompt(body) {
  const input = Array.isArray(body?.input) ? body.input : [];
  const item = input.find((entry) => entry?.role === "system");
  return String(item?.content || "");
}

function rewriteSystemPrompt(body, prompt) {
  const input = Array.isArray(body?.input) ? body.input : [];
  const item = input.find((entry) => entry?.role === "system");
  if (item) item.content = prompt;
}

function parseUserPayload(body) {
  const input = Array.isArray(body?.input) ? body.input : [];
  const item = input.find((entry) => entry?.role === "user");
  if (!item) return {};
  try {
    return JSON.parse(String(item.content || "{}"));
  } catch {
    return {};
  }
}

function rewriteUserPayload(body, payload) {
  const input = Array.isArray(body?.input) ? body.input : [];
  const item = input.find((entry) => entry?.role === "user");
  if (item) item.content = JSON.stringify(payload, null, 2);
}

async function callJudge(parentBody, parentInit, items) {
  const body = {
    model: parentBody.model,
    input: [
      { role: "system", content: reasonJudge.buildJudgePrompt() },
      { role: "user", content: JSON.stringify({ candidates: items }, null, 2) },
    ],
    max_output_tokens: Math.min(10000, Math.max(3500, items.length * 190)),
    text: {
      ...(parentBody.text || {}),
      format: { type: "json_object" },
    },
  };
  if (parentBody.reasoning) body.reasoning = parentBody.reasoning;
  const response = await nativeFetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: parentInit.headers,
    body: JSON.stringify(body),
    signal: parentInit.signal,
  });
  if (!response.ok) throw new Error("contextual judge request failed");
  return response.json();
}

function extractOutputText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  const parts = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if ((content.type === "output_text" || content.type === "text") && content.text) parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

function setOutputText(data, text) {
  if (Object.hasOwn(data, "output_text")) data.output_text = text;
  let replaced = false;
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (content.type !== "output_text" && content.type !== "text") continue;
      if (!replaced) {
        content.text = text;
        replaced = true;
      } else {
        content.text = "";
      }
    }
  }
}

function parseJsonObject(text) {
  const cleaned = String(text || "")
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("invalid JSON");
  }
}

function mergeUsage(first, second) {
  if (!first) return second || null;
  if (!second) return first;
  return {
    ...first,
    input_tokens: Number(first.input_tokens || 0) + Number(second.input_tokens || 0),
    output_tokens: Number(first.output_tokens || 0) + Number(second.output_tokens || 0),
    total_tokens: Number(first.total_tokens || 0) + Number(second.total_tokens || 0),
    input_tokens_details: {
      ...(first.input_tokens_details || {}),
      cached_tokens: Number(first.input_tokens_details?.cached_tokens || 0)
        + Number(second.input_tokens_details?.cached_tokens || 0),
    },
    output_tokens_details: {
      ...(first.output_tokens_details || {}),
      reasoning_tokens: Number(first.output_tokens_details?.reasoning_tokens || 0)
        + Number(second.output_tokens_details?.reasoning_tokens || 0),
    },
  };
}

function jsonResponseLike(original, data) {
  const headers = new Headers(original.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), {
    status: original.status,
    statusText: original.statusText,
    headers,
  });
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

require("./server.js");

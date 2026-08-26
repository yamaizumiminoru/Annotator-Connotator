const http = require("http");
const { URL } = require("url");
const {
  corsHeaders,
  isAllowedOrigin,
  resolveNetworkConfig,
} = require("./server-security");

const DEFAULT_STANDARD_MODEL = "gpt-5.6-luna";
const DEFAULT_PRECISE_MODEL = "gpt-5.6-sol";
const MAX_QUESTION_SOURCE_CHARS = 250_000;
const MAX_QUESTION_CHARS = 4_000;
const MAX_SELECTED_CHARS = 12_000;
const MAX_CONTEXT_SIDE_CHARS = 12_000;
const INITIAL_CONTEXT_SIDE_CHARS = 500;
const MAX_CONTEXT_REQUESTS = 3;
const MAX_OUTPUT_TOKENS = 1_200;

const CONTEXT_TOOL = {
  type: "function",
  name: "get_context",
  description: [
    "Read a wider source-text window immediately before and after the passage the user selected.",
    "A small local context window is already included in the initial request.",
    "Call this when the initial window is not enough for discourse context, reference, ellipsis, tense/aspect,",
    "stance, implicature, irony, register, ambiguity, syntax interacting with nearby text, or author intent.",
    "Request the smallest useful wider window first. You may call again with a larger window if necessary.",
  ].join(" "),
  parameters: {
    type: "object",
    properties: {
      before_chars: {
        type: "integer",
        minimum: 0,
        maximum: MAX_CONTEXT_SIDE_CHARS,
        description: "Number of source characters to read immediately before the selected passage.",
      },
      after_chars: {
        type: "integer",
        minimum: 0,
        maximum: MAX_CONTEXT_SIDE_CHARS,
        description: "Number of source characters to read immediately after the selected passage.",
      },
    },
    required: ["before_chars", "after_chars"],
    additionalProperties: false,
  },
  strict: true,
};

function clampInteger(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function resolveSelectionRange(sourceText, selectedText, selectedStart, selectedEnd) {
  const source = String(sourceText || "");
  const selected = String(selectedText || "");
  if (!selected || !selected.trim()) return null;

  const start = Number.isInteger(Number(selectedStart)) ? Number(selectedStart) : -1;
  const end = Number.isInteger(Number(selectedEnd)) ? Number(selectedEnd) : -1;
  if (
    start >= 0
    && end >= start
    && end <= source.length
    && source.slice(start, end) === selected
  ) {
    return { start, end };
  }

  let best = -1;
  let cursor = 0;
  let bestDistance = Infinity;
  const approximateStart = start >= 0 ? start : 0;
  while (cursor <= source.length) {
    const index = source.indexOf(selected, cursor);
    if (index < 0) break;
    const distance = Math.abs(index - approximateStart);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
    cursor = index + Math.max(1, selected.length);
  }
  return best >= 0 ? { start: best, end: best + selected.length } : null;
}

function buildContextWindow(sourceText, selectionRange, beforeChars, afterChars) {
  const source = String(sourceText || "");
  if (!selectionRange) {
    return {
      available: false,
      message: "The selected passage could not be located in the source text.",
    };
  }

  const before = clampInteger(beforeChars, 0, MAX_CONTEXT_SIDE_CHARS, 1_200);
  const after = clampInteger(afterChars, 0, MAX_CONTEXT_SIDE_CHARS, 1_200);
  const windowStart = Math.max(0, selectionRange.start - before);
  const windowEnd = Math.min(source.length, selectionRange.end + after);

  return {
    available: true,
    before: source.slice(windowStart, selectionRange.start),
    selected: source.slice(selectionRange.start, selectionRange.end),
    after: source.slice(selectionRange.end, windowEnd),
    reachedStart: windowStart === 0,
    reachedEnd: windowEnd === source.length,
    beforeChars: selectionRange.start - windowStart,
    afterChars: windowEnd - selectionRange.end,
  };
}

function buildQuestionInstructions(explanationLanguage = "en") {
  const language = String(explanationLanguage || "en").trim() || "en";
  return [
    "You are the question-answering helper inside Annotator-Connotator, a language-learning application.",
    `Answer in the language identified by this language code: ${language}.`,
    "The user has selected a passage and asked a question about it.",
    "The initial request always includes a small local context window immediately before and after the selection when the selection can be located.",
    "Use that local context when interpreting the selected wording; do not answer as if the selection were isolated.",
    "If the local window is not enough, call get_context for a wider window before answering.",
    "This especially includes reference, ellipsis, discourse relations, tense/aspect, stance, implicature, irony, register, ambiguity, and author intent.",
    "When context is retrieved, distinguish what the text supports from general language knowledge.",
    "Keep the answer focused, clear, and useful to a language learner. Do not rewrite the question into a more advanced style unless needed for accuracy.",
  ].join(" ");
}

function buildInitialQuestionInput({ selectedText, question, context } = {}) {
  const parts = [
    "Selected passage:",
    "<<<SELECTED>>>",
    String(selectedText || ""),
    "<<<END SELECTED>>>",
  ];

  if (context?.available) {
    parts.push(
      "",
      "Local context around the selection:",
      "<<<BEFORE>>>",
      String(context.before || ""),
      "<<<END BEFORE>>>",
      "<<<AFTER>>>",
      String(context.after || ""),
      "<<<END AFTER>>>",
    );
  }

  parts.push("", "User question:", String(question || ""));
  return parts.join("\n");
}

function extractOutputText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  const parts = [];
  for (const item of data?.output || []) {
    if (item?.type !== "message") continue;
    for (const content of item.content || []) {
      if ((content.type === "output_text" || content.type === "text") && content.text) parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

function extractContextCalls(data) {
  return (data?.output || []).filter((item) => item?.type === "function_call" && item.name === "get_context");
}

function usageSummary(responses) {
  return responses.reduce((total, response) => {
    const usage = response?.usage || {};
    total.inputTokens += Number(usage.input_tokens || 0);
    total.outputTokens += Number(usage.output_tokens || 0);
    total.totalTokens += Number(usage.total_tokens || 0);
    return total;
  }, { inputTokens: 0, outputTokens: 0, totalTokens: 0 });
}

function responseRequestBody({ model, instructions, input, previousResponseId, toolChoice = "auto" }) {
  const body = {
    model,
    instructions,
    input,
    tools: [CONTEXT_TOOL],
    tool_choice: toolChoice,
    parallel_tool_calls: false,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    store: true,
  };
  if (previousResponseId) body.previous_response_id = previousResponseId;
  if (String(model || "").startsWith("gpt-5")) {
    body.reasoning = { effort: process.env.OPENAI_REASONING_EFFORT || "low" };
    body.text = { verbosity: process.env.OPENAI_TEXT_VERBOSITY || "low" };
  }
  return body;
}

async function callResponses(body, { fetchImpl = globalThis.fetch, apiKey = process.env.OPENAI_API_KEY } = {}) {
  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 800);
    const error = new Error("OpenAI question request failed.");
    error.status = response.status;
    error.detail = detail;
    throw error;
  }
  return response.json();
}

async function answerQuestion(payload, options = {}) {
  const sourceText = String(payload?.sourceText || "");
  const selectedText = String(payload?.selectedText || "");
  const question = String(payload?.question || "").trim();
  const explanationLanguage = String(payload?.explanationLanguage || "en").trim() || "en";

  if (!selectedText.trim()) throw Object.assign(new Error("selected text required"), { status: 400, code: "question_selection_required" });
  if (!question) throw Object.assign(new Error("question required"), { status: 400, code: "question_required" });
  if (sourceText.length > MAX_QUESTION_SOURCE_CHARS) throw Object.assign(new Error("source too long"), { status: 413, code: "question_source_too_long" });
  if (selectedText.length > MAX_SELECTED_CHARS) throw Object.assign(new Error("selection too long"), { status: 413, code: "question_selection_too_long" });
  if (question.length > MAX_QUESTION_CHARS) throw Object.assign(new Error("question too long"), { status: 413, code: "question_too_long" });

  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) throw Object.assign(new Error("api key required"), { status: 503, code: "api_key_required" });

  const mode = payload?.analysisMode === "precise" ? "precise" : "standard";
  const model = mode === "precise"
    ? (process.env.OPENAI_PRECISE_MODEL || process.env.OPENAI_MODEL || DEFAULT_PRECISE_MODEL)
    : (process.env.OPENAI_STANDARD_MODEL || DEFAULT_STANDARD_MODEL);
  const instructions = buildQuestionInstructions(explanationLanguage);
  const selectionRange = resolveSelectionRange(
    sourceText,
    selectedText,
    payload?.selectedStart,
    payload?.selectedEnd,
  );
  const initialContext = buildContextWindow(
    sourceText,
    selectionRange,
    INITIAL_CONTEXT_SIDE_CHARS,
    INITIAL_CONTEXT_SIDE_CHARS,
  );
  const initialContextChars = initialContext.available
    ? initialContext.before.length + initialContext.selected.length + initialContext.after.length
    : 0;

  const responses = [];
  let response = await callResponses(responseRequestBody({
    model,
    instructions,
    input: buildInitialQuestionInput({ selectedText, question, context: initialContext }),
  }), { ...options, apiKey });
  responses.push(response);

  let contextRequests = 0;
  let contextCharsSent = initialContextChars;

  while (true) {
    const calls = extractContextCalls(response);
    if (!calls.length) break;

    const outputs = [];
    for (const call of calls) {
      let args = {};
      try {
        args = JSON.parse(call.arguments || "{}");
      } catch {
        args = {};
      }

      if (contextRequests >= MAX_CONTEXT_REQUESTS) {
        outputs.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify({ available: false, message: "Context request limit reached. Answer using context already retrieved." }),
        });
        continue;
      }

      const window = buildContextWindow(sourceText, selectionRange, args.before_chars, args.after_chars);
      if (window.available) contextCharsSent += window.before.length + window.selected.length + window.after.length;
      contextRequests += 1;
      outputs.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(window),
      });
    }

    const atLimit = contextRequests >= MAX_CONTEXT_REQUESTS;
    response = await callResponses(responseRequestBody({
      model,
      instructions,
      input: outputs,
      previousResponseId: response.id,
      toolChoice: atLimit ? "none" : "auto",
    }), { ...options, apiKey });
    responses.push(response);
  }

  const answer = extractOutputText(response);
  if (!answer) throw Object.assign(new Error("empty answer"), { status: 502, code: "question_empty_answer" });

  return {
    answer,
    model,
    initialContextChars,
    contextRequests,
    contextCharsSent,
    usage: usageSummary(responses),
  };
}

function readJsonBody(req, maxBytes = 700_000) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        const error = new Error("request body too large");
        error.status = 413;
        reject(error);
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        const error = new Error("invalid json");
        error.status = 400;
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, data, headers = {}) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
  res.end(JSON.stringify(data));
}

async function handleQuestionRequest(req, res) {
  const port = Number(process.env.PORT || 4174);
  const config = resolveNetworkConfig(process.env, port);
  const origin = req.headers.origin || "";
  const requestHost = req.headers.host || "";
  if (!isAllowedOrigin(origin, requestHost, config)) {
    sendJson(res, 403, { error: "origin_not_allowed" });
    return;
  }
  const headers = corsHeaders(origin, requestHost, config);

  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (error) {
    sendJson(res, error.status || 400, { error: "invalid_request" }, headers);
    return;
  }

  try {
    const result = await answerQuestion(payload);
    sendJson(res, 200, result, headers);
  } catch (error) {
    sendJson(res, error.status || 502, {
      error: error.code || "question_request_failed",
      detail: error.detail || undefined,
    }, headers);
  }
}

function installQuestionServerPatch() {
  const nativeCreateServer = http.createServer.bind(http);
  http.createServer = function createQuestionAwareServer(handler) {
    return nativeCreateServer((req, res) => {
      let pathname = "";
      try {
        pathname = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname;
      } catch {
        pathname = String(req.url || "").split("?", 1)[0];
      }
      if (req.method === "POST" && pathname === "/api/question") {
        void handleQuestionRequest(req, res);
        return;
      }
      return handler(req, res);
    });
  };
}

module.exports = {
  CONTEXT_TOOL,
  DEFAULT_PRECISE_MODEL,
  DEFAULT_STANDARD_MODEL,
  INITIAL_CONTEXT_SIDE_CHARS,
  MAX_CONTEXT_REQUESTS,
  MAX_CONTEXT_SIDE_CHARS,
  answerQuestion,
  buildContextWindow,
  buildInitialQuestionInput,
  buildQuestionInstructions,
  extractContextCalls,
  extractOutputText,
  handleQuestionRequest,
  installQuestionServerPatch,
  resolveSelectionRange,
  responseRequestBody,
};

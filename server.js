const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const root = __dirname;
loadDotEnv(path.join(root, ".env"));

const port = Number(process.env.PORT || 4174);
const model = process.env.OPENAI_MODEL || "gpt-5.6-sol";
const reasoningEffort = process.env.OPENAI_REASONING_EFFORT || "low";
const textVerbosity = process.env.OPENAI_TEXT_VERBOSITY || "low";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 180_000) {
        reject(new Error("request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function extractText(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  const parts = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) parts.push(content.text);
      if (content.type === "text" && content.text) parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
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
    throw new Error("model did not return valid json");
  }
}

async function callOpenAI(input, maxOutputTokens, options = {}) {
  const body = {
    model,
    input,
    max_output_tokens: maxOutputTokens,
  };

  if (model.startsWith("gpt-5")) {
    body.reasoning = { effort: reasoningEffort };
    body.text = { verbosity: textVerbosity };
  }

  if (options.jsonObject) {
    body.text = {
      ...(body.text || {}),
      format: { type: "json_object" },
    };
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();
    const error = new Error("OpenAI API request failed.");
    error.status = response.status;
    error.detail = detail.slice(0, 800);
    throw error;
  }

  return response.json();
}

async function parseOrRepairJson(rawText, contextLabel) {
  try {
    return parseJsonObject(rawText);
  } catch (firstError) {
    const repairPrompt = [
      "Repair this into one valid JSON object.",
      "Return only JSON. Do not use markdown fences.",
      "Preserve the original schema and all usable content.",
      "If an array or string is truncated, close it cleanly and keep the valid preceding items.",
      `Context: ${contextLabel}`,
    ].join("\n");

    try {
      const repaired = await callOpenAI([
        { role: "system", content: repairPrompt },
        { role: "user", content: rawText.slice(0, 20000) },
      ], 6000, { jsonObject: true });
      return parseJsonObject(extractText(repaired));
    } catch (repairError) {
      const error = new Error(`The model returned malformed JSON and automatic repair failed: ${firstError.message}`);
      error.cause = repairError;
      throw error;
    }
  }
}

function levelPrompt(level) {
  const table = {
    beginner: "A1-A2 learners. Prefer everyday words, basic verb phrases, and simple grammar that blocks understanding.",
    intermediate: "B1-B2 learners. Prefer reusable collocations, natural phrases, phrasal verbs, discourse markers, and moderately abstract vocabulary.",
    advanced: "C1 learners. Prefer nuance-heavy vocabulary, idioms, register, stance expressions, and compact academic or professional phrasing.",
    academic: "Academic/professional learners. Prefer argument structure, hedging, nominalization, stance, abstraction, and discipline-neutral academic expressions.",
  };
  return table[level] || table.intermediate;
}

function densityTarget(density) {
  if (density <= 1) return "4 to 7";
  if (density >= 3) return "12 to 18";
  return "8 to 12";
}

function focusPrompt(focus) {
  const table = {
    balanced: "Balance vocabulary, phrases, idioms, and grammar.",
    speaking: "Prioritize items the learner can reuse in spoken discussion.",
    academic: "Prioritize academic writing, presentations, argumentation, hedging, and abstract nouns.",
    grammar: "Prioritize grammar patterns, sentence frames, connectors, and phrase structure.",
  };
  return table[focus] || table.balanced;
}

function languageName(code, fallback = "Japanese") {
  const table = {
    auto: "auto-detected source language",
    af: "Afrikaans",
    ar: "Arabic",
    hy: "Armenian",
    az: "Azerbaijani",
    be: "Belarusian",
    bs: "Bosnian",
    bg: "Bulgarian",
    ca: "Catalan",
    zh: "Chinese",
    hr: "Croatian",
    cs: "Czech",
    da: "Danish",
    nl: "Dutch",
    en: "English",
    et: "Estonian",
    fi: "Finnish",
    fr: "French",
    gl: "Galician",
    de: "German",
    el: "Greek",
    he: "Hebrew",
    hi: "Hindi",
    hu: "Hungarian",
    is: "Icelandic",
    id: "Indonesian",
    it: "Italian",
    ja: "Japanese",
    kn: "Kannada",
    kk: "Kazakh",
    ko: "Korean",
    lv: "Latvian",
    lt: "Lithuanian",
    mk: "Macedonian",
    ms: "Malay",
    mi: "Maori",
    mr: "Marathi",
    ne: "Nepali",
    no: "Norwegian",
    fa: "Persian",
    pl: "Polish",
    pt: "Portuguese",
    ro: "Romanian",
    ru: "Russian",
    sr: "Serbian",
    sk: "Slovak",
    sl: "Slovenian",
    es: "Spanish",
    sw: "Swahili",
    sv: "Swedish",
    tl: "Tagalog",
    ta: "Tamil",
    th: "Thai",
    tr: "Turkish",
    uk: "Ukrainian",
    ur: "Urdu",
    vi: "Vietnamese",
    cy: "Welsh",
  };
  return table[code] || fallback;
}

function buildAnnotationPrompt(payload) {
  const maxItems = densityTarget(Number(payload.density || 2));
  const includeGrammar = payload.includeGrammar !== false;
  const includeSlash = payload.includeSlash !== false;
  const sourceLanguage = languageName(payload.sourceLanguage, "auto-detected source language");
  const explanationLanguage = languageName(payload.explanationLanguage, "Japanese");

  return [
    "You are a multilingual language-learning annotation engine.",
    "Return only one valid JSON object. Do not use markdown fences.",
    `Source language: ${sourceLanguage}.`,
    `Explanation language: ${explanationLanguage}.`,
    `Write summaryJa, translation, meaningJa, and noteJa values in natural ${explanationLanguage}.`,
    "Keep the JSON property names exactly as specified even when the explanation language is not Japanese.",
    "",
    `Target level: ${levelPrompt(payload.level)}`,
    `Focus: ${focusPrompt(payload.focus)}`,
    `Annotation count: ${maxItems} items.`,
    includeGrammar
      ? "Include grammar items when they are useful."
      : "Do not include grammar-only items unless essential.",
    includeSlash
      ? "Also split the source into slash-reading chunks."
      : "Set slashReading to an empty array.",
    "",
    "Schema:",
    "{",
    '  "sourceText": "original text",',
    '  "sourceLanguage": "source language code or detected language name",',
    '  "explanationLanguage": "explanation language code or language name",',
    '  "level": "beginner|intermediate|advanced|academic",',
    '  "summaryJa": "one short explanation-language sentence",',
    '  "translation": "full sourceText translation in the selected explanation language",',
    '  "annotations": [',
    "    {",
    '      "id": "a1",',
    '      "text": "exact substring from sourceText",',
    '      "type": "vocab|phrase|idiom|grammar",',
    '      "meaningJa": "meaning in the selected explanation language",',
    '      "noteJa": "why it matters or how to use it",',
    '      "example": "short example in the source language when possible",',
    '      "start": 0,',
    '      "end": 10',
    "    }",
    "  ],",
    '  "slashReading": ["chunk 1", "chunk 2"]',
    "}",
    "",
    "Important rules:",
    "- Every annotation text must be an exact contiguous substring of sourceText.",
    "- start and end must be JavaScript string offsets for that exact substring.",
    "- Prefer useful learning targets over rare trivia.",
    "- Do not annotate overlapping spans.",
    "- Include a faithful full-passage translation in translation.",
    "- Do not let the full translation replace the individual annotations.",
    "- Keep noteJa concise.",
    "- If the source language is auto-detected, set sourceLanguage to the detected language.",
  ].join("\n");
}

function validateAnnotationPayload(payload) {
  const text = String(payload.text || "").trim();
  if (!text) return "text is required";
  if (text.length > 8000) return "text is too long; keep it under 8000 characters for this prototype";
  return "";
}

async function handleAnnotate(req, res) {
  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch {
    sendJson(res, 400, { error: "invalid_json", message: "Invalid JSON request." });
    return;
  }

  const validation = validateAnnotationPayload(payload);
  if (validation) {
    sendJson(res, 400, { error: "invalid_request", message: validation });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    sendJson(res, 400, {
      error: "missing_api_key",
      message: "Add OPENAI_API_KEY to .env, then restart server.js.",
    });
    return;
  }

  const text = String(payload.text).trim();

  try {
    const data = await callOpenAI([
      { role: "system", content: buildAnnotationPrompt(payload) },
      {
        role: "user",
        content: JSON.stringify({
          sourceText: text,
          sourceLanguage: payload.sourceLanguage || "auto",
          explanationLanguage: payload.explanationLanguage || "ja",
        }, null, 2),
      },
    ], 9000, { jsonObject: true });

    const parsed = await parseOrRepairJson(extractText(data), "annotation result");
    parsed.sourceText = parsed.sourceText || text;
    parsed.sourceLanguage = parsed.sourceLanguage || payload.sourceLanguage || "auto";
    parsed.explanationLanguage = parsed.explanationLanguage || payload.explanationLanguage || "ja";
    parsed.translation = parsed.translation || "";
    parsed.level = payload.level || parsed.level || "intermediate";
    sendJson(res, 200, parsed);
  } catch (error) {
    sendJson(res, 502, {
      error: error.status ? "openai_request_failed" : "annotation_failed",
      message: String(error.message || error),
      detail: error.detail,
    });
  }
}

async function handleUiTranslations(req, res) {
  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch {
    sendJson(res, 400, { error: "invalid_json", message: "Invalid JSON request." });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    sendJson(res, 400, {
      error: "missing_api_key",
      message: "Add OPENAI_API_KEY to .env, then restart server.js.",
    });
    return;
  }

  const language = String(payload.language || "en");
  const targetLanguage = languageName(language, language);
  const strings = payload.strings && typeof payload.strings === "object" ? payload.strings : {};

  if (!Object.keys(strings).length) {
    sendJson(res, 400, { error: "invalid_request", message: "strings are required" });
    return;
  }

  const system = [
    "You translate compact UI labels for a language-learning web app.",
    "Return only one valid JSON object. Do not use markdown fences.",
    `Target language: ${targetLanguage}.`,
    "Translate every value naturally for a UI.",
    "Preserve every key exactly.",
    "Preserve placeholders such as {count} and {model}.",
    "Keep labels short enough for buttons and tabs.",
    'Schema: { "strings": { "sameKey": "translated value" } }',
  ].join("\n");

  try {
    const data = await callOpenAI([
      { role: "system", content: system },
      { role: "user", content: JSON.stringify({ strings }, null, 2) },
    ], 3600, { jsonObject: true });
    const parsed = await parseOrRepairJson(extractText(data), "ui translation result");
    const translated = parsed.strings && typeof parsed.strings === "object" ? parsed.strings : parsed;
    sendJson(res, 200, { language, strings: translated });
  } catch (error) {
    sendJson(res, 502, {
      error: error.status ? "openai_request_failed" : "ui_translation_failed",
      message: String(error.message || error),
      detail: error.detail,
    });
  }
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://localhost:${port}`);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const resolvedRoot = path.resolve(root);
  const filePath = path.resolve(root, `.${pathname}`);

  if (filePath !== resolvedRoot && !filePath.startsWith(resolvedRoot + path.sep)) {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end("forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  if (req.url.startsWith("/api/health") && req.method === "GET") {
    sendJson(res, 200, {
      ok: true,
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
      model,
    });
    return;
  }

  if (req.url.startsWith("/api/annotate") && req.method === "POST") {
    await handleAnnotate(req, res);
    return;
  }

  if (req.url.startsWith("/api/ui-translations") && req.method === "POST") {
    await handleUiTranslations(req, res);
    return;
  }

  serveStatic(req, res);
});

server.listen(port, () => {
  console.log(`Annotator-Connotator: http://localhost:${port}`);
  console.log(process.env.OPENAI_API_KEY ? `LLM enabled with ${model}` : "OPENAI_API_KEY is not set.");
});

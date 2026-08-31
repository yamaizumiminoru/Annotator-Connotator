const sourceFormatting = require("./lib/source-formatting");

const nativeFetch = global.fetch.bind(global);

global.fetch = async function sourceFormattingFetch(input, init = {}) {
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

  const entries = Array.isArray(body?.input) ? body.input : [];
  const system = entries.find((entry) => entry?.role === "system");
  const prompt = String(system?.content || "");
  if (!system || !prompt.includes("multilingual language-learning annotation engine")) {
    return nativeFetch(input, init);
  }

  const user = entries.find((entry) => entry?.role === "user");
  let payload = {};
  try {
    payload = JSON.parse(String(user?.content || "{}"));
  } catch {
    payload = {};
  }

  const modified = JSON.parse(JSON.stringify(body));
  const modifiedSystem = modified.input.find((entry) => entry?.role === "system");
  modifiedSystem.content = `${String(modifiedSystem.content || "")}\n${sourceFormatting.buildFormattingPolicy(payload.sourceLanguage)}`;

  const response = await nativeFetch(input, { ...init, body: JSON.stringify(modified) });
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

  const sourceText = String(payload.sourceText || parsed.sourceText || "");
  parsed.formattingSpans = sourceFormatting.normalizeFormattingSpans(sourceText, parsed.formattingSpans);
  setOutputText(apiData, JSON.stringify(parsed));
  return jsonResponseLike(response, apiData);
};

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

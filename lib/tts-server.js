const http = require("http");
const { URL } = require("url");
const {
  corsHeaders,
  isAllowedOrigin,
  resolveNetworkConfig,
} = require("./server-security");

const DEFAULT_TTS_MODEL = "gpt-4o-mini-tts";
const DEFAULT_TTS_VOICE = "marin";
const DEFAULT_TTS_SPEED = 1.0;
const DEFAULT_TTS_MODE = "natural";
const MAX_TTS_INPUT_CHARS = 4096;
const MAX_TTS_CUSTOM_INSTRUCTIONS_CHARS = 3000;
const TTS_MODES = new Set(["clear", "natural", "casual", "custom"]);
const TTS_MODE_INSTRUCTIONS = Object.freeze({
  clear: [
    "Speak clearly and naturally at a slightly relaxed pace.",
    "Keep phrase boundaries easy to perceive and avoid unusually strong reductions or elisions.",
    "Do not sound robotic or exaggeratedly slow.",
  ].join(" "),
  natural: [
    "Use ordinary fluent conversational delivery at a normal pace.",
    "Use the language's natural connected-speech processes and reductions where they normally occur.",
    "Do not over-articulate for a language learner.",
  ].join(" "),
  casual: [
    "Use relaxed, spontaneous conversational delivery between fluent speakers rather than learner-directed speech.",
    "Use the language's natural reductions, linking, assimilation, contractions, and occasional elision where appropriate.",
    "Keep prominent content meaningful and let less prominent material reduce naturally; do not merely read the text faster.",
  ].join(" "),
});
const ENGLISH_TTS_MODE_INSTRUCTIONS = Object.freeze({
  clear: "For English, keep weak forms moderate and make phrase boundaries relatively easy to hear.",
  natural: "For English, use ordinary weak forms, linking, assimilation, contractions, and flapping where they normally occur.",
  casual: [
    "For English, allow strong but natural connected speech, including weak function words, linking, assimilation, flapping, stop-T, H-dropping in unstressed pronouns, and occasional consonant or syllable elision where contextually natural.",
    "Preserve normal English stress and rhythm instead of reducing every word equally.",
  ].join(" "),
});
const BUILT_IN_VOICES = new Set([
  "alloy", "ash", "ballad", "coral", "echo", "fable", "nova",
  "onyx", "sage", "shimmer", "verse", "marin", "cedar",
]);

// OpenAI's documented TTS language set follows Whisper's supported languages.
// The app catalog contains a few additional languages; those remain available
// through device speech but are rejected here before any paid request is made.
const SUPPORTED_TTS_LANGUAGE_CODES = new Set([
  "af", "ar", "hy", "az", "be", "bs", "bg", "ca", "zh", "hr", "cs",
  "da", "nl", "en", "et", "fi", "fr", "gl", "de", "el", "he", "hi",
  "hu", "is", "id", "it", "ja", "kn", "kk", "ko", "lv", "lt", "mk",
  "ms", "mr", "mi", "ne", "no", "fa", "pl", "pt", "ro", "ru", "sr",
  "sk", "sl", "es", "sw", "sv", "tl", "ta", "th", "tr", "uk", "ur",
  "vi", "cy",
]);

function normalizeLanguageCode(value) {
  return String(value || "").trim().toLowerCase().split(/[-_]/, 1)[0];
}

function isSupportedTtsLanguage(value) {
  return SUPPORTED_TTS_LANGUAGE_CODES.has(normalizeLanguageCode(value));
}

function normalizeVoice(value) {
  const voice = String(value || DEFAULT_TTS_VOICE).trim().toLowerCase();
  return BUILT_IN_VOICES.has(voice) ? voice : DEFAULT_TTS_VOICE;
}

function normalizeTtsMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  return TTS_MODES.has(mode) ? mode : DEFAULT_TTS_MODE;
}

function normalizeCustomInstructions(value) {
  return String(value || "").trim().slice(0, MAX_TTS_CUSTOM_INSTRUCTIONS_CHARS);
}

function buildSpeechInstructions({ mode, customInstructions, language } = {}) {
  const normalizedMode = normalizeTtsMode(mode);
  const normalizedLanguage = normalizeLanguageCode(language);
  const custom = normalizeCustomInstructions(customInstructions);
  const isCustom = normalizedMode === "custom";
  const presetInstructions = isCustom ? "" : TTS_MODE_INSTRUCTIONS[normalizedMode];
  const languageSpecific = !isCustom && normalizedLanguage === "en"
    ? ENGLISH_TTS_MODE_INSTRUCTIONS[normalizedMode]
    : "";
  const customBlock = isCustom && custom
    ? `Use these speaking-style instructions from the user instead of any preset delivery style: ${custom}`
    : "";

  return [
    "Read the supplied text exactly as written in its original language.",
    presetInstructions,
    languageSpecific,
    customBlock,
    "The delivery instructions affect pronunciation, rhythm, tempo, accent, and speaking style only.",
    "Keep the lexical content unchanged: do not translate, summarize, explain, add, omit, reorder, or paraphrase words. Natural phonetic reductions are allowed.",
  ].filter(Boolean).join(" ");
}

function buildSpeechPayload({ text, voice, model, speed, mode, customInstructions, language } = {}) {
  return {
    model: String(model || DEFAULT_TTS_MODEL),
    input: String(text || ""),
    voice: normalizeVoice(voice),
    instructions: buildSpeechInstructions({ mode, customInstructions, language }),
    response_format: "mp3",
    speed: Number.isFinite(Number(speed)) ? Number(speed) : DEFAULT_TTS_SPEED,
  };
}

function readJsonBody(req, maxBytes = 48_000) {
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
    ...headers,
  });
  res.end(JSON.stringify(data));
}

async function handleTtsRequest(req, res) {
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

  const text = String(payload.text || "");
  const language = normalizeLanguageCode(payload.language);
  if (!text.trim()) {
    sendJson(res, 400, { error: "tts_text_required" }, headers);
    return;
  }
  if (text.length > MAX_TTS_INPUT_CHARS) {
    sendJson(res, 400, { error: "tts_input_too_long", maxChars: MAX_TTS_INPUT_CHARS }, headers);
    return;
  }
  if (!isSupportedTtsLanguage(language)) {
    sendJson(res, 400, { error: "tts_language_unsupported", language }, headers);
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    sendJson(res, 503, { error: "api_key_required" }, headers);
    return;
  }

  const speechPayload = buildSpeechPayload({
    text,
    voice: payload.voice,
    model: process.env.OPENAI_TTS_MODEL || DEFAULT_TTS_MODEL,
    speed: DEFAULT_TTS_SPEED,
    mode: payload.mode,
    customInstructions: payload.customInstructions,
    language,
  });

  let response;
  try {
    response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(speechPayload),
    });
  } catch {
    sendJson(res, 502, { error: "tts_request_failed" }, headers);
    return;
  }

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 600);
    sendJson(res, response.status, { error: "tts_request_failed", detail }, headers);
    return;
  }

  const audio = Buffer.from(await response.arrayBuffer());
  res.writeHead(200, {
    ...headers,
    "content-type": response.headers.get("content-type") || "audio/mpeg",
    "content-length": audio.length,
    "cache-control": "no-store",
    "x-tts-model": speechPayload.model,
    "x-tts-voice": speechPayload.voice,
    "x-tts-mode": normalizeTtsMode(payload.mode),
  });
  res.end(audio);
}

function installTtsServerPatch() {
  const nativeCreateServer = http.createServer.bind(http);
  http.createServer = function createTtsAwareServer(handler) {
    return nativeCreateServer((req, res) => {
      let pathname = "";
      try {
        pathname = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname;
      } catch {
        pathname = String(req.url || "").split("?", 1)[0];
      }
      if (req.method === "POST" && pathname === "/api/tts") {
        void handleTtsRequest(req, res);
        return;
      }
      return handler(req, res);
    });
  };
}

module.exports = {
  BUILT_IN_VOICES,
  DEFAULT_TTS_MODE,
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_SPEED,
  DEFAULT_TTS_VOICE,
  ENGLISH_TTS_MODE_INSTRUCTIONS,
  MAX_TTS_CUSTOM_INSTRUCTIONS_CHARS,
  MAX_TTS_INPUT_CHARS,
  SUPPORTED_TTS_LANGUAGE_CODES,
  TTS_MODES,
  TTS_MODE_INSTRUCTIONS,
  buildSpeechInstructions,
  buildSpeechPayload,
  handleTtsRequest,
  installTtsServerPatch,
  isSupportedTtsLanguage,
  normalizeCustomInstructions,
  normalizeLanguageCode,
  normalizeTtsMode,
  normalizeVoice,
};
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
let youtubeTranscriptModulePromise;

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
  };
  return table[level] || table.intermediate;
}

function densityTarget(density) {
  if (density <= 1) return 7;
  if (density >= 3) return 18;
  return 12;
}

function focusPrompt(focus) {
  const table = {
    all: "Consider every analytical perspective: vocabulary, reusable phrases, idioms, grammar, register, stance, and pragmatic nuance. This does not mean annotating every word. Include only pedagogically useful targets.",
    speaking: "Prioritize items the learner can reuse in spoken discussion.",
    academic: "Prioritize academic writing, presentations, argumentation, hedging, and abstract nouns.",
  };
  return table[focus] || table.all;
}

function languageName(code, fallback = "Japanese") {
  const table = {
    auto: "auto-detected source language",
    af: "Afrikaans",
    am: "Amharic",
    ar: "Arabic",
    hy: "Armenian",
    az: "Azerbaijani",
    eu: "Basque",
    be: "Belarusian",
    bn: "Bengali",
    bs: "Bosnian",
    bg: "Bulgarian",
    my: "Burmese",
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
    ka: "Georgian",
    de: "German",
    el: "Greek",
    gu: "Gujarati",
    ha: "Hausa",
    he: "Hebrew",
    hi: "Hindi",
    hu: "Hungarian",
    is: "Icelandic",
    id: "Indonesian",
    it: "Italian",
    ja: "Japanese",
    kn: "Kannada",
    kk: "Kazakh",
    km: "Khmer",
    ko: "Korean",
    lo: "Lao",
    lv: "Latvian",
    lt: "Lithuanian",
    mk: "Macedonian",
    ms: "Malay",
    ml: "Malayalam",
    mt: "Maltese",
    mr: "Marathi",
    ne: "Nepali",
    no: "Norwegian",
    fa: "Persian",
    pl: "Polish",
    pt: "Portuguese",
    pa: "Punjabi",
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
    te: "Telugu",
    th: "Thai",
    tr: "Turkish",
    uk: "Ukrainian",
    uz: "Uzbek",
    vi: "Vietnamese",
    cy: "Welsh",
    yo: "Yoruba",
    zu: "Zulu",
  };
  return table[code] || fallback;
}

function buildAnnotationPrompt(payload) {
  const maxItems = densityTarget(Number(payload.density || 2));
  const includeGrammar = payload.includeGrammar !== false;
  const includeSlash = payload.includeSlash !== false;
  const sourceLanguage = languageName(payload.sourceLanguage, "auto-detected source language");
  const explanationLanguage = languageName(payload.explanationLanguage, "Japanese");
  const connotationTargets = Array.isArray(payload.connotationTargets)
    ? payload.connotationTargets.filter((target) => target && typeof target.text === "string")
    : [];

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
    `Annotation budget: up to ${maxItems} items. Return fewer when the text does not contain that many useful targets.`,
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
    '  "level": "beginner|intermediate|advanced",',
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
    '  "connotations": [',
    "    {",
    '      "id": "c1",',
    '      "text": "exact contiguous substring from sourceText",',
    '      "start": 0,',
    '      "end": 10,',
    '      "scope": "span|sentence|utterance|passage",',
    '      "category": "evaluative|stance|politeness|implicature|presupposition|register|irony|euphemism",',
    '      "secondaryCategories": ["another applicable top-level category"],',
    '      "subtype": "specific subtype or unspecified",',
    '      "literalMeaning": "surface or dictionary meaning in the explanation language",',
    '      "suggestedMeaning": "meaning a listener may infer in the explanation language",',
    '      "pragmaticEffect": "social or discourse effect in the explanation language",',
    '      "contextNote": "conditions, uncertainty, or competing readings in the explanation language",',
    '      "confidence": "high|medium|low",',
    '      "alternatives": ["another plausible interpretation in the explanation language"],',
    '      "evidence": ["source or contextual clue supporting the interpretation"],',
    '      "conventionality": "conventional|contextual|mixed"',
    "    }",
    "  ],",
    '  "slashReading": ["chunk 1", "chunk 2"]',
    "}",
    "",
    "Important rules:",
    "- Every annotation text must be an exact contiguous substring of sourceText.",
    "- start and end must be JavaScript string offsets for that exact substring.",
    "- Prefer useful learning targets over rare trivia.",
    "- Never pad the annotation list to reach the budget.",
    "- Treat the target level as a knowledge floor. Assume the learner already knows words and structures comfortably below that level, and omit them.",
    "- Each annotation must offer a concrete learning benefit at the selected target level. If noteJa cannot explain that benefit without stating an elementary dictionary fact, omit the annotation.",
    "- Do not annotate an elementary pronoun, article, simple copula, punctuation mark, or isolated function word unless it is genuinely difficult at the target level or participates in a larger construction worth explaining.",
    "- Prefer the complete reusable phrase or construction over a trivial single word contained inside it.",
    "- Do not annotate overlapping spans.",
    "- Connotations may overlap annotations and may use a whole sentence, utterance, or passage as their exact source span.",
    "- Add only connotations that are useful to a learner and supported by the wording or context.",
    "- Return an empty connotations array when there is no grounded nuance to explain.",
    "- Do not relabel ordinary dictionary meaning, lexical entailment, or a routine real-world association as connotation.",
    "- A merely possible association is not enough. Prefer an empty array unless the wording creates a meaningful evaluative, social, interpersonal, stance, presuppositional, ironic, euphemistic, or inferential contrast for a learner.",
    "- Distinguish dictionary meaning, conventional nuance, and context-dependent inference.",
    "- Choose category as the primary pragmatic function. Use secondaryCategories only for genuinely overlapping top-level categories, and do not repeat the primary category there.",
    "- For a rhetorical question that mainly asserts an evaluation or position, prefer stance or evaluative as the primary category and implicature as a secondary category when useful.",
    "- Never present a cancellable conversational implicature as a logically entailed meaning.",
    "- When context is insufficient, explain the uncertainty or alternatives instead of selecting one reading as certain.",
    "- Do not invent hostility, discrimination, irony, emotion, personality, or political position.",
    "- For politeness, use subtype positive, negative, mitigation, honorific, or other. These are practical labels, not universal cultural claims.",
    "- Every connotation property shown in the schema is required. Use an empty alternatives array when no useful alternative exists.",
    "- Include a faithful full-passage translation in translation.",
    "- Do not let the full translation replace the individual annotations.",
    "- Keep noteJa concise.",
    "- If the source language is auto-detected, set sourceLanguage to the detected language.",
    ...(connotationTargets.length
      ? [
          "- This is an explanation test. Analyze every supplied connotation target even if it would not normally be selected.",
          `- Supplied connotation targets: ${JSON.stringify(connotationTargets)}`,
        ]
      : []),
  ].join("\n");
}

function loadYouTubeTranscriptModule() {
  if (!youtubeTranscriptModulePromise) {
    youtubeTranscriptModulePromise = import("@hallelx/youtube-transcript");
  }
  return youtubeTranscriptModulePromise;
}

function validateAnnotationPayload(payload) {
  const text = String(payload.text || "").trim();
  if (!text) return "text is required";
  if (text.length > 20000) return "text is too long; keep it under 20000 characters";
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
    ], 13000, { jsonObject: true });

    const parsed = await parseOrRepairJson(extractText(data), "annotation result");
    parsed.sourceText = parsed.sourceText || text;
    parsed.annotations = filterLowValueAnnotations(
      repairAnnotationOffsets(parsed.sourceText, parsed.annotations),
      payload.level,
      parsed.sourceLanguage || payload.sourceLanguage,
    );
    parsed.connotations = normalizeConnotations(parsed.sourceText, parsed.connotations);
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

async function handleYouTubeTranscript(req, res) {
  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch {
    sendJson(res, 400, { error: "invalid_json", message: "Invalid JSON request." });
    return;
  }

  const videoId = extractYouTubeVideoId(payload.url);
  if (!videoId) {
    sendJson(res, 400, { error: "invalid_youtube_url", message: "Invalid YouTube URL." });
    return;
  }

  try {
    const { YouTubeTranscriptApi } = await loadYouTubeTranscriptModule();
    const transcriptList = await new YouTubeTranscriptApi().list(videoId);
    const tracks = [...transcriptList];
    if (!tracks.length) {
      sendJson(res, 422, { error: "youtube_no_captions", message: "No captions are available." });
      return;
    }

    const track = chooseYouTubeTranscript(tracks, payload.sourceLanguage);
    const fetched = await track.fetch();
    const rawTranscript = transcriptSnippetsToText(fetched.snippets, fetched.languageCode);
    if (!rawTranscript) {
      sendJson(res, 422, { error: "youtube_no_captions", message: "The caption track was empty." });
      return;
    }

    let transcript = rawTranscript;
    let correctionStatus = "skipped";
    if (payload.correctWithAi === true && process.env.OPENAI_API_KEY) {
      try {
        transcript = await correctTranscriptWithOpenAI(rawTranscript, fetched.language || track.language);
        correctionStatus = "applied";
      } catch {
        correctionStatus = "failed";
      }
    }

    sendJson(res, 200, {
      videoId,
      title: await fetchYouTubeTitle(videoId),
      transcript,
      rawTranscript,
      language: fetched.language || track.language || "",
      languageCode: fetched.languageCode || track.languageCode || "",
      isGenerated: Boolean(fetched.isGenerated ?? track.isGenerated),
      correctionStatus,
      snippetCount: fetched.snippets.length,
    });
  } catch (error) {
    const errorName = String(error?.name || error?.constructor?.name || "");
    if (/TranscriptsDisabled|NoTranscriptFound/.test(errorName)) {
      sendJson(res, 422, { error: "youtube_no_captions", message: String(error.message || error) });
      return;
    }
    if (/RequestBlocked|IpBlocked|PoTokenRequired|FailedToCreateConsentCookie/.test(errorName)) {
      sendJson(res, 502, { error: "youtube_blocked", message: String(error.message || error) });
      return;
    }
    if (/VideoUnavailable|VideoUnplayable|AgeRestricted/.test(errorName)) {
      sendJson(res, 404, { error: "youtube_unavailable", message: String(error.message || error) });
      return;
    }
    sendJson(res, 502, {
      error: "youtube_transcript_failed",
      message: String(error.message || error),
    });
  }
}

function extractYouTubeVideoId(value) {
  const input = String(value || "").trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;

  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    return "";
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  let videoId = "";
  if (host === "youtu.be") {
    videoId = parsed.pathname.split("/").filter(Boolean)[0] || "";
  } else if (["youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com"].includes(host)) {
    videoId = parsed.searchParams.get("v") || "";
    if (!videoId) {
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (["shorts", "embed", "live"].includes(parts[0])) videoId = parts[1] || "";
    }
  }
  return /^[A-Za-z0-9_-]{11}$/.test(videoId) ? videoId : "";
}

function chooseYouTubeTranscript(tracks, requestedLanguage) {
  const requested = String(requestedLanguage || "auto").toLowerCase();
  const generated = tracks.find((track) => track.isGenerated);
  if (requested === "auto") return generated || tracks[0];

  const requestedBase = requested.split("-")[0];
  const matching = tracks.filter((track) => {
    const code = String(track.languageCode || "").toLowerCase();
    return code === requested || code.split("-")[0] === requestedBase;
  });
  return matching.find((track) => !track.isGenerated) || matching[0] || generated || tracks[0];
}

function transcriptSnippetsToText(snippets, languageCode) {
  const compactLanguage = /^(ja|zh|ko|th|lo|my|km)(-|$)/i.test(String(languageCode || ""));
  const separator = compactLanguage ? "" : " ";
  return (Array.isArray(snippets) ? snippets : [])
    .map((snippet) => String(snippet?.text || "").trim())
    .filter(Boolean)
    .join(separator)
    .replace(/\[(?:music|applause|laughter|音楽|拍手|笑い)\]/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

async function correctTranscriptWithOpenAI(transcript, language) {
  const chunks = splitTranscriptChunks(transcript, 6000);
  const corrected = [];
  for (const chunk of chunks) {
    const result = await callOpenAI([
      {
        role: "system",
        content: [
          "You correct a YouTube caption transcript for language-learning use.",
          `Transcript language: ${language || "auto-detected"}.`,
          "Correct only likely speech-recognition errors, broken word boundaries, punctuation, capitalization, and paragraph breaks.",
          "Preserve every claim, example, repetition, hesitation, and degree of certainty.",
          "Do not summarize, translate, explain, censor, fact-check, or add information.",
          "When a proper name is uncertain, keep the source wording rather than inventing one.",
          "Return only the corrected transcript text.",
        ].join("\n"),
      },
      { role: "user", content: chunk },
    ], 7000);
    const text = extractText(result).trim();
    if (!text) throw new Error("Transcript correction returned no text.");
    corrected.push(text);
  }
  return corrected.join("\n\n");
}

function splitTranscriptChunks(text, maxLength) {
  const chunks = [];
  let remaining = String(text || "").trim();
  while (remaining.length > maxLength) {
    const window = remaining.slice(0, maxLength + 1);
    const minimum = Math.floor(maxLength * 0.55);
    const sentenceBreaks = [...window.matchAll(/[。！？.!?](?:[\"'”’」』】）)]*)\s*/g)]
      .map((match) => match.index + match[0].length)
      .filter((index) => index >= minimum && index <= maxLength);
    const whitespace = window.lastIndexOf(" ", maxLength);
    const cut = sentenceBreaks.at(-1) || (whitespace >= minimum ? whitespace + 1 : maxLength);
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function fetchYouTubeTitle(videoId) {
  try {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const response = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`,
      { signal: AbortSignal.timeout(10000) },
    );
    if (!response.ok) return "YouTube";
    const data = await response.json();
    return String(data.title || "YouTube");
  } catch {
    return "YouTube";
  }
}

const connotationCategories = new Set([
  "evaluative",
  "stance",
  "politeness",
  "implicature",
  "presupposition",
  "register",
  "irony",
  "euphemism",
]);

const connotationScopes = new Set(["span", "sentence", "utterance", "passage"]);
const connotationConfidence = new Set(["high", "medium", "low"]);
const connotationConventionality = new Set(["conventional", "contextual", "mixed"]);

function normalizeConnotations(sourceText, connotations) {
  if (!Array.isArray(connotations)) return [];

  return connotations
    .map((item, index) => {
      const text = String(item?.text || "");
      if (!text) return null;
      const located = locateConnotation(sourceText, text, item.start, item.end);
      if (!located) return null;

      const alternatives = Array.isArray(item.alternatives)
        ? item.alternatives.map((value) => String(value || "").trim()).filter(Boolean)
        : [];
      const evidence = Array.isArray(item.evidence)
        ? item.evidence.map((value) => String(value || "").trim()).filter(Boolean)
        : [];
      const category = connotationCategories.has(item.category) ? item.category : "stance";

      return {
        id: String(item.id || `c${index + 1}`),
        text: sourceText.slice(located.start, located.end),
        start: located.start,
        end: located.end,
        scope: connotationScopes.has(item.scope) ? item.scope : "span",
        category,
        secondaryCategories: [...new Set(
          (Array.isArray(item.secondaryCategories) ? item.secondaryCategories : [])
            .filter((secondary) => connotationCategories.has(secondary) && secondary !== category),
        )],
        subtype: String(item.subtype || "unspecified").trim() || "unspecified",
        literalMeaning: String(item.literalMeaning || "").trim(),
        suggestedMeaning: String(item.suggestedMeaning || "").trim(),
        pragmaticEffect: String(item.pragmaticEffect || "").trim(),
        contextNote: String(item.contextNote || "").trim(),
        confidence: connotationConfidence.has(item.confidence) ? item.confidence : "medium",
        alternatives,
        evidence,
        conventionality: connotationConventionality.has(item.conventionality)
          ? item.conventionality
          : "contextual",
      };
    })
    .filter((item) => item && item.suggestedMeaning && item.contextNote);
}

function locateConnotation(sourceText, text, start, end) {
  if (
    Number.isInteger(start)
    && Number.isInteger(end)
    && start >= 0
    && end > start
    && end <= sourceText.length
    && sourceText.slice(start, end) === text
  ) {
    return { start, end };
  }

  const index = sourceText.indexOf(text);
  return index >= 0 ? { start: index, end: index + text.length } : null;
}

const elementaryEnglishSingleWords = new Set([
  "a", "an", "the",
  "i", "you", "he", "she", "it", "we", "they",
  "am", "is", "are", "was", "were", "be", "been", "being",
]);

function filterLowValueAnnotations(annotations, level, sourceLanguage) {
  if (level === "beginner") return annotations;
  const language = String(sourceLanguage || "").toLowerCase();
  if (language !== "en" && language !== "english") return annotations;

  return annotations.filter((item) => {
    const target = String(item?.text || "").trim().toLowerCase();
    return !elementaryEnglishSingleWords.has(target);
  });
}

function repairAnnotationOffsets(sourceText, annotations) {
  if (!Array.isArray(annotations)) return [];
  const occupied = [];

  return annotations.map((item) => {
    const annotationText = String(item?.text || "");
    if (!annotationText) return item;

    const candidates = [];
    if (Number.isInteger(item.start) && Number.isInteger(item.end)) {
      candidates.push([item.start, item.end]);
    }
    let index = sourceText.indexOf(annotationText);
    while (index >= 0) {
      candidates.push([index, index + annotationText.length]);
      index = sourceText.indexOf(annotationText, index + 1);
    }

    for (const [start, end] of candidates) {
      if (start < 0 || end <= start || end > sourceText.length) continue;
      if (sourceText.slice(start, end) !== annotationText) continue;
      if (occupied.some((range) => start < range.end && end > range.start)) continue;
      occupied.push({ start, end });
      return { ...item, start, end };
    }
    return item;
  });
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

  if (req.url.startsWith("/api/youtube-transcript") && req.method === "POST") {
    await handleYouTubeTranscript(req, res);
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

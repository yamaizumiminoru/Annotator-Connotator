const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const packageJson = require("./package.json");
const {
  buildCoverageCompletionPrompt,
  candidateDiscoveryTarget,
  completionLimit,
  findLaterCoverageReview,
  mergeUniqueNonOverlappingAnnotations,
  selectAnnotationsByDensity,
  stripInternalSelectionFields,
  wholePassageSelectionRules,
} = require("./lib/annotation-selection");

const root = __dirname;
loadDotEnv(path.join(root, ".env"));

const port = Number(process.env.PORT || 4174);
const standardModel = process.env.OPENAI_STANDARD_MODEL || "gpt-5.6-luna";
const preciseModel = process.env.OPENAI_PRECISE_MODEL || process.env.OPENAI_MODEL || "gpt-5.6-sol";
const reasoningEffort = process.env.OPENAI_REASONING_EFFORT || "low";
const textVerbosity = process.env.OPENAI_TEXT_VERBOSITY || "low";
let youtubeTranscriptModulePromise;
const annotationCandidateCache = new Map();
const candidateCacheTtlMs = 20 * 60 * 1000;
const candidateCacheMaxEntries = 12;

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
  const requestModel = options.model || standardModel;
  const body = {
    model: requestModel,
    input,
    max_output_tokens: maxOutputTokens,
  };

  if (requestModel.startsWith("gpt-5")) {
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

const unexpectedJapaneseTranslationScript = /[\p{Script=Armenian}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Hangul}\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Gurmukhi}\p{Script=Gujarati}\p{Script=Oriya}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Kannada}\p{Script=Malayalam}\p{Script=Sinhala}\p{Script=Thai}\p{Script=Lao}\p{Script=Georgian}\p{Script=Ethiopic}\p{Script=Khmer}\p{Script=Myanmar}\p{Script=Mongolian}]/u;

function needsJapaneseTranslationRepair(explanationLanguage, translation) {
  const language = String(explanationLanguage || "ja").toLowerCase();
  if (!new Set(["ja", "japanese", "日本語"]).has(language)) return false;
  return unexpectedJapaneseTranslationScript.test(String(translation || ""));
}

async function repairJapaneseTranslation(sourceText, candidate, requestModel) {
  let translation = String(candidate || "");
  const usages = [];
  for (let attempt = 0; attempt < 2 && needsJapaneseTranslationRepair("ja", translation); attempt += 1) {
    const repaired = await callOpenAI([
      {
        role: "system",
        content: [
          "Return one JSON object with a translation property only.",
          "Rewrite the candidate as a complete, faithful, natural Japanese translation of the source.",
          "Remove accidental words or script from unrelated languages, including Cyrillic, Armenian, or Arabic-script substitutions.",
          "Transliterate proper names naturally when needed. Do not omit any source content.",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({ sourceText, candidateTranslation: translation }),
      },
    ], 6000, { jsonObject: true, model: requestModel });
    usages.push(repaired.usage || null);
    const parsed = await parseOrRepairJson(extractText(repaired), "Japanese translation repair");
    translation = String(parsed.translation || "").trim();
  }
  return { translation, usage: mergeUsage(usages) };
}

function mergeUsage(usages) {
  return usages.filter(Boolean).reduce((totals, usage) => ({
    input_tokens: totals.input_tokens + Number(usage.input_tokens || 0),
    output_tokens: totals.output_tokens + Number(usage.output_tokens || 0),
    total_tokens: totals.total_tokens + Number(usage.total_tokens || 0),
    input_tokens_details: {
      cached_tokens: totals.input_tokens_details.cached_tokens
        + Number(usage.input_tokens_details?.cached_tokens || 0),
    },
    output_tokens_details: {
      reasoning_tokens: totals.output_tokens_details.reasoning_tokens
        + Number(usage.output_tokens_details?.reasoning_tokens || 0),
    },
  }), {
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens_details: { reasoning_tokens: 0 },
  });
}

function levelPrompt(level) {
  const table = {
    beginner: "A1-A2 learners. Prefer everyday words, basic verb phrases, and simple grammar that blocks understanding.",
    intermediate: "B1-B2 learners. Prefer reusable collocations, natural phrases, phrasal verbs, discourse markers, and moderately abstract vocabulary.",
    advanced: "C1 learners. Prefer nuance-heavy vocabulary, idioms, register, stance expressions, and compact academic or professional phrasing.",
  };
  return table[level] || table.intermediate;
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
  const discoveryTarget = candidateDiscoveryTarget(payload.text);
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
    `Use only ${explanationLanguage} in explanatory prose. Quote source-language wording only when needed to identify or discuss it; never substitute an accidental word from an unrelated third language or script.`,
    "Keep the JSON property names exactly as specified even when the explanation language is not Japanese.",
    "",
    `Target level: ${levelPrompt(payload.level)}`,
    `Focus: ${focusPrompt(payload.focus)}`,
    ...wholePassageSelectionRules(discoveryTarget),
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
    '      "type": "word|collocation|formula|construction|idiom|term",',
    '      "meaningJa": "meaning in the selected explanation language",',
    '      "noteJa": "why it matters or how to use it",',
    '      "example": "short example in the source language when possible",',
    '      "pattern": "generalized reusable pattern such as not only A, but also B, or an empty string",',
    '      "coreRanges": [{"start": 0, "end": 8}],',
    '      "start": 0,',
    '      "end": 10,',
    '      "priority": 5,',
    '      "reliability": "high|medium|low"',
    "    }",
    "  ],",
    '  "connotations": [',
    "    {",
    '      "id": "c1",',
    '      "text": "smallest exact contiguous substring suitable as the learner-facing highlight anchor",',
    '      "start": 0,',
    '      "end": 10,',
    '      "scope": "span|sentence|utterance|passage; extent of the pragmatic effect, which may be wider than text",',
    '      "category": "evaluative|stance|politeness|implicature|presupposition|register|irony|euphemism",',
    '      "secondaryCategories": ["another applicable top-level category"],',
    '      "subtype": "specific subtype or unspecified",',
    '      "literalMeaning": "surface or dictionary meaning in the explanation language",',
    '      "suggestedMeaning": "meaning a listener may infer in the explanation language",',
    '      "pragmaticEffect": "social or discourse effect in the explanation language",',
    '      "contextNote": "genuine learner-relevant ambiguity, warning, or qualification in the explanation language, or an empty string",',
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
    "- priority is an integer from 5 (essential/highest learner benefit) to 1 (supplementary but still level-appropriate). Assign it by pedagogical usefulness, reusability, and relevance to the selected focus.",
    "- reliability expresses confidence that the span and explanation are correct. It is secondary to pedagogical priority and must not promote obvious but low-value dictionary items.",
    "- Return ordinary annotation candidates in descending priority order, using reliability only as a secondary ordering consideration.",
    "- Never pad the ordinary candidate list to reach the discovery target.",
    "- Treat the target level as a knowledge floor. Assume the learner already knows words and structures comfortably below that level, and omit them.",
    "- Display density is applied by the server after candidate discovery. Do not lower the difficulty threshold or change candidate eligibility based on density.",
    "- Each annotation must offer a concrete learning benefit at the selected target level. If noteJa cannot explain that benefit without stating an elementary dictionary fact, omit the annotation.",
    "- Use ordinary type word for a standalone lexical item, collocation for words that characteristically occur together, formula for a conventional reusable expression, construction for a grammatical frame, idiom for a non-compositional expression, and term for domain-specific terminology.",
    "- Keep meaningJa to a short independent gloss. Keep noteJa compact and reference-like. When writing Japanese, use concise plain style and avoid desu/masu endings.",
    "- For a reusable construction inside a longer annotation span, set pattern to its generalized frame and coreRanges to the non-overlapping JavaScript offsets within annotation text that mark the structural core. Use an empty pattern and empty coreRanges when no such display is useful.",
    "- Do not annotate an elementary pronoun, article, simple copula, punctuation mark, or isolated function word unless it is genuinely difficult at the target level or participates in a larger construction worth explaining.",
    "- Prefer the complete reusable phrase or construction over a trivial single word contained inside it.",
    "- Do not annotate overlapping spans.",
    "- Connotations may overlap ordinary annotations.",
    "- For each connotation, text/start/end identify the smallest contiguous wording that gives the learner a useful place to focus. Treat this as a UI highlight anchor, not as a context window or a claim that the nuance is encoded by that substring alone.",
    "- Each connotation card must have one primary learner-facing anchor. If a word or short phrase supplies the evaluative, register, stance, presuppositional, euphemistic, polite, or ironic cue, highlight that word or phrase even when the complete interpretation is constructed by later context, contrast, cancellation, or clarification.",
    "- Before returning a connotation, test whether removing words from either edge would still identify the same linguistic trigger. If so, shorten the span.",
    "- Do not enlarge text merely to include evidence, contrast, consequences, or explanatory context. Put those clues in evidence and explain their role in contextNote.",
    "- When the nuance depends on a contrast or wider discourse, explicitly say so in contextNote and set conventionality to contextual or mixed as appropriate. A narrow highlight must not be described as semantically sufficient on its own.",
    "- When non-contiguous wording creates a contrast, never bridge the intervening text to make one large highlight. Return separate narrow connotations for independently useful triggers, or select the single most informative trigger and describe the contrast as evidence.",
    "- Use scope to record how widely the pragmatic effect operates. A short trigger may therefore have sentence, utterance, or passage scope.",
    "- Use a whole sentence, utterance, or passage as text only when no shorter contiguous expression anchors the effect, such as a genuinely construction-wide or discourse-wide phenomenon.",
    "- When separate expressions independently contribute distinct useful nuances, return separate connotations instead of combining them into one broad span.",
    "- For contextual irony, highlight the ironic expression itself and cite the conflicting context in evidence; do not include the setup merely to make the irony visible.",
    "- Examples of span selection: highlight 'childish' rather than the full sentence that positively reframes it; highlight 'kids' and optionally 'children' rather than the full sentence contrasting their registers; highlight 'Great job' rather than the preceding failure that makes it ironic.",
    "- Add only connotations that are useful to a learner and supported by the wording or context.",
    "- Ordinary annotations and connotations may overlap in expression and supporting explanation when that helps each card stand independently; do not force a rigid theoretical separation between the two card types.",
    "- Ordinary-annotation distribution rules do not apply to connotations. Keep connotation selection sparse and precision-first; never add one merely to cover a passage region.",
    "- Return an empty connotations array when there is no grounded nuance to explain.",
    "- Do not relabel ordinary dictionary meaning, lexical entailment, or a routine real-world association as connotation.",
    "- A merely possible association is not enough. Prefer an empty array unless the wording creates a meaningful evaluative, social, interpersonal, stance, presuppositional, ironic, euphemistic, or inferential contrast for a learner.",
    "- Distinguish dictionary meaning, conventional nuance, and context-dependent inference.",
    "- Choose category as the primary pragmatic function. Use secondaryCategories only for genuinely overlapping top-level categories, and do not repeat the primary category there.",
    "- For a rhetorical question that mainly asserts an evaluation or position, prefer stance or evaluative as the primary category and implicature as a secondary category when useful.",
    "- Never present a cancellable conversational implicature as a logically entailed meaning.",
    "- When context is insufficient, explain the uncertainty or alternatives instead of selecting one reading as certain.",
    "- Keep evidence concise and genuinely evidential. Do not restate the whole passage.",
    "- Set contextNote to an empty string unless there is a genuine learner-relevant ambiguity, likely misunderstanding, or important qualification. Do not use it merely to repeat literal versus figurative wording.",
    "- Keep alternatives empty unless there are genuinely competing plausible interpretations; synonyms or paraphrases of the main reading are not alternatives.",
    "- Do not invent hostility, discrimination, irony, emotion, personality, or political position.",
    "- For politeness, use subtype positive, negative, mitigation, honorific, or other. These are practical labels, not universal cultural claims.",
    "- Every connotation property shown in the schema is required. Use an empty alternatives array when no useful alternative exists.",
    "- Include a faithful full-passage translation in translation.",
    "- Do not let the full translation replace the individual annotations.",
    "- Keep noteJa concise.",
    `- Before returning, check translation, summaryJa, meaningJa, noteJa, and all connotation explanations for accidental words or script from a language other than ${explanationLanguage}.`,
    "- If the source language is auto-detected, set sourceLanguage to the detected language.",
    ...(connotationTargets.length
      ? [
          "- This is an explanation test. Analyze every supplied connotation target even if it would not normally be selected.",
          "- For each supplied target, preserve its exact text/start/end as the connotation highlight. Use surrounding wording only as evidence or context.",
          `- Supplied connotation targets: ${JSON.stringify(connotationTargets)}`,
        ]
      : []),
  ].join("\n");
}

async function completeLaterAnnotations({
  text,
  payload,
  annotations,
  sourceLanguage,
  annotationModel,
}) {
  const review = findLaterCoverageReview(text, annotations);
  if (!review) {
    return {
      annotations,
      usage: null,
      telemetry: { attempted: false, added: 0 },
    };
  }

  const reviewText = text.slice(review.start, review.end);
  const limit = completionLimit(candidateDiscoveryTarget(text));
  const data = await callOpenAI([
    {
      role: "system",
      content: buildCoverageCompletionPrompt({
        sourceLanguage: languageName(sourceLanguage, sourceLanguage || "auto-detected source language"),
        explanationLanguage: languageName(payload.explanationLanguage, "Japanese"),
        targetLevel: levelPrompt(payload.level),
        focus: focusPrompt(payload.focus),
        limit,
      }),
    },
    {
      role: "user",
      content: JSON.stringify({
        precedingContext: text.slice(Math.max(0, review.start - 300), review.start),
        reviewText,
        existingTargets: annotations.map((item) => item.text),
      }, null, 2),
    },
  ], 5000, { jsonObject: true, model: annotationModel });
  const parsed = await parseOrRepairJson(extractText(data), "later annotation coverage review");
  const localAnnotations = filterLowValueAnnotations(
    repairAnnotationOffsets(reviewText, parsed.annotations),
    payload.level,
    sourceLanguage,
  );
  const shiftedAnnotations = repairAnnotationOffsets(text, localAnnotations.map((item) => ({
    ...item,
    start: item.start + review.start,
    end: item.end + review.start,
  })));
  const merged = mergeUniqueNonOverlappingAnnotations(annotations, shiftedAnnotations);
  const existingRanges = new Set(annotations.map((item) => `${item.start}:${item.end}:${item.text}`));
  const added = merged.filter((item) => !existingRanges.has(`${item.start}:${item.end}:${item.text}`)).length;

  return {
    annotations: merged,
    usage: data.usage || null,
    telemetry: {
      attempted: true,
      completed: true,
      reviewStart: review.start,
      reviewStartPosition: Number((review.start / text.length).toFixed(3)),
      latestInitialAnnotationPosition: Number(review.latestAnnotationPosition.toFixed(3)),
      candidates: shiftedAnnotations.length,
      added,
    },
  };
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

function annotationCacheKey(text, payload, annotationModel) {
  return crypto.createHash("sha256").update(JSON.stringify({
    text,
    sourceLanguage: payload.sourceLanguage || "auto",
    explanationLanguage: payload.explanationLanguage || "ja",
    level: payload.level || "intermediate",
    focus: payload.focus || "all",
    includeGrammar: payload.includeGrammar !== false,
    includeSlash: payload.includeSlash !== false,
    connotationTargets: payload.connotationTargets || [],
    annotationModel,
  })).digest("hex");
}

function getCachedCandidateResult(key) {
  const cached = annotationCandidateCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.createdAt > candidateCacheTtlMs) {
    annotationCandidateCache.delete(key);
    return null;
  }
  annotationCandidateCache.delete(key);
  annotationCandidateCache.set(key, cached);
  return cached;
}

function setCachedCandidateResult(key, value) {
  annotationCandidateCache.set(key, { createdAt: Date.now(), ...value });
  while (annotationCandidateCache.size > candidateCacheMaxEntries) {
    annotationCandidateCache.delete(annotationCandidateCache.keys().next().value);
  }
}

function finalizeAnnotationResponse(candidateResult, payload, api) {
  const result = JSON.parse(JSON.stringify(candidateResult));
  const candidates = Array.isArray(result.annotations) ? result.annotations : [];
  const displayed = selectAnnotationsByDensity(candidates, payload.density)
    .map(stripInternalSelectionFields);
  result.annotations = displayed;
  result._api = {
    ...api,
    density: Number(payload.density) <= 1 ? "low" : Number(payload.density) >= 3 ? "high" : "standard",
    candidateCount: candidates.length,
    displayedAnnotationCount: displayed.length,
  };
  return result;
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
  const analysisMode = payload.analysisMode === "precise" ? "precise" : "standard";
  const annotationModel = analysisMode === "precise" ? preciseModel : standardModel;
  const hasConnotationTargets = Array.isArray(payload.connotationTargets)
    && payload.connotationTargets.length > 0;
  const cacheKey = annotationCacheKey(text, payload, annotationModel);
  if (!hasConnotationTargets) {
    const cached = getCachedCandidateResult(cacheKey);
    if (cached) {
      sendJson(res, 200, finalizeAnnotationResponse(cached.result, payload, {
        model: annotationModel,
        analysisMode,
        usage: null,
        candidateCacheHit: true,
        coverageCompletion: cached.coverageCompletion,
      }));
      return;
    }
  }

  try {
    const data = await callOpenAI([
      { role: "system", content: buildAnnotationPrompt({ ...payload, text }) },
      {
        role: "user",
        content: JSON.stringify({
          sourceText: text,
          sourceLanguage: payload.sourceLanguage || "auto",
          explanationLanguage: payload.explanationLanguage || "ja",
        }, null, 2),
      },
    ], 13000, { jsonObject: true, model: annotationModel });

    const parsed = await parseOrRepairJson(extractText(data), "annotation result");
    parsed.sourceText = text;
    parsed.annotations = mergeUniqueNonOverlappingAnnotations(
      [],
      filterLowValueAnnotations(
        repairAnnotationOffsets(text, parsed.annotations),
        payload.level,
        parsed.sourceLanguage || payload.sourceLanguage,
      ),
    );
    parsed.connotations = normalizeConnotations(text, parsed.connotations);
    parsed.sourceLanguage = parsed.sourceLanguage || payload.sourceLanguage || "auto";
    parsed.explanationLanguage = parsed.explanationLanguage || payload.explanationLanguage || "ja";
    parsed.translation = parsed.translation || "";
    parsed.level = payload.level || parsed.level || "intermediate";
    let usage = data.usage || null;
    let coverageCompletion = { attempted: false, added: 0 };
    if (!hasConnotationTargets) {
      try {
        const completion = await completeLaterAnnotations({
          text,
          payload,
          annotations: parsed.annotations,
          sourceLanguage: parsed.sourceLanguage,
          annotationModel,
        });
        parsed.annotations = completion.annotations;
        coverageCompletion = completion.telemetry;
        if (completion.usage) usage = mergeUsage([usage, completion.usage]);
      } catch {
        coverageCompletion = { attempted: true, completed: false, added: 0 };
      }
    }
    if (needsJapaneseTranslationRepair(parsed.explanationLanguage, parsed.translation)) {
      const repaired = await repairJapaneseTranslation(text, parsed.translation, annotationModel);
      parsed.translation = repaired.translation;
      usage = mergeUsage([usage, repaired.usage]);
    }
    if (!hasConnotationTargets) {
      setCachedCandidateResult(cacheKey, { result: parsed, coverageCompletion });
    }
    sendJson(res, 200, finalizeAnnotationResponse(parsed, payload, {
      model: annotationModel,
      analysisMode,
      usage,
      candidateCacheHit: false,
      coverageCompletion,
    }));
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
    if (!annotationText) return null;

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
    return null;
  }).filter(Boolean);
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
      app: packageJson.name,
      version: packageJson.version,
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
      model: standardModel,
      models: {
        standard: standardModel,
        precise: preciseModel,
      },
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
  console.log(
    process.env.OPENAI_API_KEY
      ? `LLM enabled: standard=${standardModel}, precise=${preciseModel}`
      : "OPENAI_API_KEY is not set.",
  );
});

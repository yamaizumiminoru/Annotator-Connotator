import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
loadDotEnv(path.join(root, ".env"));

const appUrl = process.env.LANGUAGE_EVAL_APP_URL || "http://localhost:4174";
const model = process.env.LANGUAGE_EVAL_MODEL || process.env.OPENAI_MODEL || "gpt-5.6-sol";
const args = process.argv.slice(2);
const rejudge = args.includes("--rejudge");
const evaluateExplanations = args.includes("--explanations");
const legacyMode = args.includes("--legacy");
const requestedOutput = args.find((arg) => !arg.startsWith("--"));
const outputPath = path.resolve(
  root,
  requestedOutput || `language-evaluation-${new Date().toISOString().slice(0, 10)}.json`,
);
const casesPath = outputPath.replace(/\.json$/i, ".cases.json");

const candidates = [
  { code: "am", name: "Amharic", native: "አማርኛ", speech: "am-ET" },
  { code: "bn", name: "Bengali", native: "বাংলা", speech: "bn-BD" },
  { code: "my", name: "Burmese", native: "မြန်မာဘာသာ", speech: "my-MM" },
  { code: "eu", name: "Basque", native: "Euskara", speech: "eu-ES" },
  { code: "ka", name: "Georgian", native: "ქართული", speech: "ka-GE" },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી", speech: "gu-IN" },
  { code: "ha", name: "Hausa", native: "Hausa", speech: "ha-NG" },
  { code: "ga", name: "Irish", native: "Gaeilge", speech: "ga-IE" },
  { code: "km", name: "Khmer", native: "ខ្មែរ", speech: "km-KH" },
  { code: "lo", name: "Lao", native: "ລາວ", speech: "lo-LA" },
  { code: "ml", name: "Malayalam", native: "മലയാളം", speech: "ml-IN" },
  { code: "mt", name: "Maltese", native: "Malti", speech: "mt-MT" },
  { code: "mn", name: "Mongolian", native: "Монгол", speech: "mn-MN" },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ", speech: "pa-IN" },
  { code: "si", name: "Sinhala", native: "සිංහල", speech: "si-LK" },
  { code: "so", name: "Somali", native: "Soomaali", speech: "so-SO" },
  { code: "te", name: "Telugu", native: "తెలుగు", speech: "te-IN" },
  { code: "uz", name: "Uzbek", native: "Oʻzbekcha", speech: "uz-UZ" },
  { code: "yo", name: "Yoruba", native: "Yorùbá", speech: "yo-NG" },
  { code: "zu", name: "Zulu", native: "isiZulu", speech: "zu-ZA" },
];

const evaluatedAdditionCodes = new Set([
  "am", "bn", "my", "eu", "ka", "gu", "ha", "km",
  "lo", "ml", "mt", "pa", "te", "uz", "yo", "zu",
]);
const currentCatalog = loadCurrentCatalog();
const withdrawnLegacyLanguages = [
  { code: "mi", name: "Maori", native: "Māori", speech: "mi-NZ" },
  { code: "ur", name: "Urdu", native: "اردو", speech: "ur-PK" },
];
const legacyLanguageCodes = [
  "af", "ar", "hy", "az", "be", "bs", "bg", "ca", "zh", "hr", "cs", "da", "nl", "en", "et", "fi",
  "fr", "gl", "de", "el", "he", "hi", "hu", "is", "id", "it", "ja", "kn", "kk", "ko", "lv", "lt",
  "mk", "ms", "mi", "mr", "ne", "no", "fa", "pl", "pt", "ro", "ru", "sr", "sk", "sl", "es", "sw",
  "sv", "tl", "ta", "th", "tr", "uk", "ur", "vi", "cy",
];
const legacyMetadata = new Map([
  ...currentCatalog.filter((language) => !evaluatedAdditionCodes.has(language.code)),
  ...withdrawnLegacyLanguages,
].map((language) => [language.code, language]));
const legacyLanguages = legacyLanguageCodes.map((code) => legacyMetadata.get(code));
const targetLanguages = legacyMode ? legacyLanguages : candidates;

if (legacyMode && (legacyLanguages.length !== 57 || legacyLanguages.some((language) => !language))) {
  throw new Error("Could not reconstruct the original 57-language catalog.");
}

function loadCurrentCatalog() {
  const source = fs.readFileSync(path.join(root, "languages.js"), "utf8");
  const match = source.match(/window\.LANGUAGE_CATALOG\s*=\s*(\[[\s\S]*?\n\]);/);
  if (!match) throw new Error("Could not read LANGUAGE_CATALOG from languages.js.");
  return vm.runInNewContext(match[1]);
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (process.env[key] == null) process.env[key] = value;
  }
}

function extractText(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }
  return (data.output || [])
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === "output_text" || part.type === "text")
    .map((part) => part.text || "")
    .join("\n")
    .trim();
}

function parseJson(text) {
  const cleaned = String(text || "")
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = Math.min(
      ...[cleaned.indexOf("{"), cleaned.indexOf("[")].filter((index) => index >= 0),
    );
    const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (Number.isFinite(start) && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("Model output was not valid JSON.");
  }
}

async function callOpenAI(input, maxOutputTokens = 12000) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      input,
      max_output_tokens: maxOutputTokens,
      reasoning: { effort: "low" },
      text: { verbosity: "low", format: { type: "json_object" } },
    }),
  });
  if (!response.ok) {
    throw new Error(`OpenAI request failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  }
  return parseJson(extractText(await response.json()));
}

async function generateCases() {
  let savedCases = [];
  if (fs.existsSync(casesPath)) {
    const saved = JSON.parse(fs.readFileSync(casesPath, "utf8"));
    if (Array.isArray(saved.cases)) savedCases = saved.cases;
  }

  const system = [
    "Create a compact multilingual evaluation set for a language-learning annotation app.",
    "Return one JSON object with a cases array and no other text.",
    "Create exactly two cases for every requested language: informational and pragmatic.",
    "Each sourceText must be natural contemporary writing by an educated native speaker, 25-55 words.",
    "The informational case should contain one moderately complex grammatical construction.",
    "The pragmatic case should contain a natural idiom, stance marker, politeness choice, or implication.",
    "Do not translate an English idiom literally. Use an expression natural in the target language.",
    "Provide a faithful English referenceTranslation and briefly name the targetFeature in English.",
    "Schema: {cases:[{id,code,name,kind,sourceText,referenceTranslation,targetFeature}]}",
  ].join("\n");
  const completeCodes = new Set(targetLanguages
    .filter((language) => {
      const cases = savedCases.filter((testCase) => testCase.code === language.code);
      return cases.length === 2 && new Set(cases.map((testCase) => testCase.kind)).size === 2;
    })
    .map((language) => language.code));
  const missing = targetLanguages.filter((language) => !completeCodes.has(language.code));

  if (completeCodes.size) console.log(`Reusing ${completeCodes.size} languages from ${casesPath}`);

  const generationBatchSize = 8;
  for (let index = 0; index < missing.length; index += generationBatchSize) {
    const batch = missing.slice(index, index + generationBatchSize);
    console.log(`Generating cases for ${batch.map((language) => language.name).join(", ")}.`);
    const result = await withRetry(
      `Case generation batch ${index + 1}-${index + batch.length}`,
      () => callOpenAI([
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(batch) },
      ], 14000),
    );
    if (!Array.isArray(result.cases) || result.cases.length !== batch.length * 2) {
      throw new Error(`Expected ${batch.length * 2} generated cases, received ${result.cases?.length || 0}.`);
    }
    const batchCodes = new Set(batch.map((language) => language.code));
    savedCases = savedCases.filter((testCase) => !batchCodes.has(testCase.code));
    savedCases.push(...result.cases);
    fs.writeFileSync(casesPath, `${JSON.stringify({ model, mode: legacyMode ? "legacy" : "candidate", cases: savedCases }, null, 2)}\n`, "utf8");
  }

  const orderedCases = targetLanguages.flatMap((language) => savedCases
    .filter((testCase) => testCase.code === language.code)
    .sort((a, b) => String(a.kind).localeCompare(String(b.kind))));
  if (orderedCases.length !== targetLanguages.length * 2) {
    throw new Error(`Expected ${targetLanguages.length * 2} total cases, found ${orderedCases.length}.`);
  }
  console.log(`Prepared ${orderedCases.length} cases in ${casesPath}`);
  return orderedCases;
}

async function withRetry(label, action, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      console.warn(`${label} failed (attempt ${attempt}/${attempts}); retrying.`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }
  throw lastError;
}

async function annotateCase(testCase) {
  const response = await fetch(`${appUrl}/api/annotate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: testCase.sourceText,
      sourceLanguage: "auto",
      explanationLanguage: "en",
      level: "intermediate",
      density: 1,
      focus: "balanced",
      includeGrammar: true,
      includeSlash: true,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || `Annotation failed (${response.status}).`);
  return result;
}

function validateStructure(testCase, annotation) {
  const errors = [];
  const warnings = [];
  if (annotation.sourceText !== testCase.sourceText) errors.push("sourceText was not preserved exactly");
  if (!String(annotation.translation || "").trim()) errors.push("translation is empty");
  if (!Array.isArray(annotation.annotations) || annotation.annotations.length < 3) {
    errors.push("fewer than three annotations");
  }

  const occupied = [];
  for (const item of annotation.annotations || []) {
    const candidates = [];
    const suppliedStart = Number(item.start);
    const suppliedEnd = Number(item.end);
    if (Number.isInteger(suppliedStart) && Number.isInteger(suppliedEnd)) {
      candidates.push([suppliedStart, suppliedEnd, "supplied"]);
    }

    const exact = testCase.sourceText.indexOf(item.text);
    if (exact >= 0) candidates.push([exact, exact + item.text.length, "exact-text fallback"]);
    const lowerExact = testCase.sourceText.toLowerCase().indexOf(String(item.text).toLowerCase());
    if (lowerExact >= 0) candidates.push([lowerExact, lowerExact + item.text.length, "case-insensitive fallback"]);

    let resolved = null;
    for (const [start, end, source] of candidates) {
      if (start < 0 || end <= start || end > testCase.sourceText.length) continue;
      const actual = testCase.sourceText.slice(start, end);
      if (actual !== item.text && actual.toLowerCase() !== String(item.text).toLowerCase()) continue;
      if (occupied.some((range) => start < range.end && end > range.start)) continue;
      resolved = { start, end, source };
      break;
    }

    if (!resolved) {
      errors.push(`cannot locate ${JSON.stringify(item.text)} without overlap`);
      continue;
    }
    occupied.push({ start: resolved.start, end: resolved.end });
    if (resolved.source !== "supplied") {
      warnings.push(`recovered ${JSON.stringify(item.text)} with ${resolved.source}`);
    }
  }
  return {
    pass: errors.length === 0,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
}

async function judgeBatch(records) {
  const system = [
    "You are an exacting multilingual evaluator for a language-learning application.",
    "Evaluate each record independently. Return one JSON object with a judgments array and no other text.",
    "Score each dimension from 0 (unusable) to 4 (excellent):",
    "sourceNaturalness: natural and correctly identified source language;",
    "translationFaithfulness: complete meaning preservation against source and reference;",
    "annotationAccuracy: meanings, grammar, spans, and examples are correct;",
    "learningUsefulness: selected items and notes help an intermediate learner;",
    "connotationRegister: the target feature, implication, idiom, politeness, or register is explained when relevant.",
    "This evaluation requested English explanations. meaningJa, noteJa, and summaryJa are legacy JSON property names; their values should be English and must not be penalized for not being Japanese.",
    "The structure field reports whether the app can locate every annotation after its exact-text recovery. Do not penalize recovered raw offsets when structure.pass is true.",
    "Set criticalError true for wrong-language output, serious mistranslation, invented meaning, or systematically bad annotation.",
    "A case passes only if totalScore >= 16, sourceNaturalness >= 3, translationFaithfulness >= 3, annotationAccuracy >= 3, learningUsefulness >= 3, connotationRegister >= 2, and criticalError is false.",
    "Give a concise English reason and list specific issues.",
    "Schema: {judgments:[{id,scores:{sourceNaturalness,translationFaithfulness,annotationAccuracy,learningUsefulness,connotationRegister},totalScore,criticalError,pass,reason,issues:[]}]}",
  ].join("\n");
  const compactRecords = records.map(({ testCase, annotation, structure }) => ({
    id: testCase.id,
    requestedLanguage: testCase.name,
    kind: testCase.kind,
    sourceText: testCase.sourceText,
    referenceTranslation: testCase.referenceTranslation,
    targetFeature: testCase.targetFeature,
    structure: { pass: structure.pass, errors: structure.errors },
    appResult: {
      detectedLanguage: annotation.sourceLanguage,
      summary: annotation.summaryJa,
      translation: annotation.translation,
      annotations: annotation.annotations,
      slashReading: annotation.slashReading,
    },
  }));
  const result = await callOpenAI([
    { role: "system", content: system },
    { role: "user", content: JSON.stringify(compactRecords) },
  ], 7000);
  if (!Array.isArray(result.judgments) || result.judgments.length !== records.length) {
    throw new Error(`Expected ${records.length} judgments, received ${result.judgments?.length || 0}.`);
  }
  return result.judgments;
}

async function annotateExplanationLanguage(language) {
  const sourceText = "The committee's reply was technically polite, but the phrase 'we will keep it in mind' gently suggested that no action was likely.";
  const response = await fetch(`${appUrl}/api/annotate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: sourceText,
      sourceLanguage: "en",
      explanationLanguage: language.code,
      level: "advanced",
      density: 1,
      focus: "balanced",
      includeGrammar: true,
      includeSlash: false,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || `Explanation-language annotation failed (${response.status}).`);
  return { sourceText, result };
}

function validateExplanationResult(sourceText, result) {
  const errors = [];
  if (result.sourceText !== sourceText) errors.push("sourceText was not preserved exactly");
  if (!String(result.translation || "").trim()) errors.push("translation is empty");
  if (!String(result.summaryJa || "").trim()) errors.push("summary is empty");
  if (!Array.isArray(result.annotations) || result.annotations.length < 3) {
    errors.push("fewer than three annotations");
  }
  for (const item of result.annotations || []) {
    if (!String(item.meaningJa || "").trim()) errors.push(`empty meaning for ${JSON.stringify(item.text)}`);
    if (!String(item.noteJa || "").trim()) errors.push(`empty note for ${JSON.stringify(item.text)}`);
  }
  return { pass: errors.length === 0, errors: [...new Set(errors)] };
}

async function judgeExplanationBatch(records) {
  const system = [
    "Evaluate whether a language-learning app can use each requested explanation language naturally and accurately.",
    "Return one JSON object with a judgments array and no other text.",
    "meaningJa, noteJa, and summaryJa are legacy property names. Their values must be in the requested explanation language, not Japanese.",
    "Score 0-4 for languageNaturalness, translationFaithfulness, explanationAccuracy, and connotationExplanation.",
    "Set criticalError true for wrong-language output, serious mistranslation, invented meaning, or unusable grammar.",
    "A record passes only if totalScore >= 13, languageNaturalness >= 3, translationFaithfulness >= 3, explanationAccuracy >= 3, connotationExplanation >= 3, and criticalError is false.",
    "The phrase 'we will keep it in mind' is literally polite but pragmatically suggests that action is unlikely. The explanation should convey that implication.",
    "Schema: {judgments:[{code,scores:{languageNaturalness,translationFaithfulness,explanationAccuracy,connotationExplanation},totalScore,criticalError,pass,reason,issues:[]}]}",
  ].join("\n");
  const payload = records.map(({ language, sourceText, result, structure }) => ({
    code: language.code,
    requestedLanguage: language.name,
    sourceText,
    structure,
    appResult: {
      reportedExplanationLanguage: result.explanationLanguage,
      summary: result.summaryJa,
      translation: result.translation,
      annotations: result.annotations,
    },
  }));
  const judged = await callOpenAI([
    { role: "system", content: system },
    { role: "user", content: JSON.stringify(payload) },
  ], 7000);
  if (!Array.isArray(judged.judgments) || judged.judgments.length !== records.length) {
    throw new Error(`Expected ${records.length} explanation judgments, received ${judged.judgments?.length || 0}.`);
  }
  return judged.judgments;
}

async function runExplanationEvaluation() {
  if (!fs.existsSync(outputPath)) throw new Error(`Missing source-language evaluation: ${outputPath}`);
  const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  const eligible = report.languages.filter((language) => language.pass);
  const records = [];
  const concurrency = 4;

  console.log(`Evaluating ${eligible.length} source-language passes as explanation languages.`);
  for (let index = 0; index < eligible.length; index += concurrency) {
    const batch = eligible.slice(index, index + concurrency);
    console.log(`[${index + 1}-${index + batch.length}/${eligible.length}] Explaining in ${batch.map((item) => item.name).join(", ")}`);
    const completed = await Promise.all(batch.map(async (language) => {
      const { sourceText, result } = await withRetry(
        `${language.name} explanation output`,
        () => annotateExplanationLanguage(language),
      );
      return { language, sourceText, result, structure: validateExplanationResult(sourceText, result) };
    }));
    records.push(...completed);
  }

  const batchSize = 5;
  for (let index = 0; index < records.length; index += batchSize) {
    const batch = records.slice(index, index + batchSize);
    console.log(`Judging explanation languages ${index + 1}-${index + batch.length}.`);
    const judgments = await withRetry(
      `Explanation judgment batch ${index + 1}-${index + batch.length}`,
      () => judgeExplanationBatch(batch),
    );
    for (const record of batch) {
      record.judgment = judgments.find((judgment) => judgment.code === record.language.code);
      if (!record.judgment) throw new Error(`Missing explanation judgment for ${record.language.code}.`);
    }
  }

  report.explanationLanguageEvaluation = records.map((record) => ({
    code: record.language.code,
    name: record.language.name,
    pass: record.structure.pass && record.judgment.pass,
    structure: record.structure,
    judgment: record.judgment,
  }));
  report.finalAcceptedLanguages = report.languages
    .filter((language) => language.pass)
    .filter((language) => report.explanationLanguageEvaluation.some((item) => item.code === language.code && item.pass))
    .map(({ code, name, native, speech }) => ({ code, name, native, speech }));
  report.explanationLanguageEvaluatedAt = new Date().toISOString();
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Final accepted: ${report.finalAcceptedLanguages.map((language) => language.name).join(", ") || "none"}`);
  console.log(`Explanation-language failures: ${report.explanationLanguageEvaluation.filter((item) => !item.pass).map((item) => item.name).join(", ") || "none"}`);
}

function calculateLanguageResults(records) {
  return targetLanguages.map((candidate) => {
    const cases = records.filter((record) => record.testCase.code === candidate.code);
    const pass = cases.length === 2 && cases.every((record) => record.structure.pass && record.judgment.pass);
    const averageScore = cases.length
      ? cases.reduce((sum, record) => sum + Number(record.judgment.totalScore || 0), 0) / cases.length
      : 0;
    return {
      ...candidate,
      pass,
      averageScore: Number(averageScore.toFixed(1)),
      cases: cases.map((record) => ({
        id: record.testCase.id,
        kind: record.testCase.kind,
        structure: record.structure,
        judgment: record.judgment,
      })),
    };
  });
}

async function main() {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is missing from .env.");

  console.log(`Evaluating ${targetLanguages.length} ${legacyMode ? "legacy" : "candidate"} languages with ${model}.`);
  if (evaluateExplanations) {
    await runExplanationEvaluation();
    return;
  }
  let records;
  if (rejudge) {
    if (!fs.existsSync(outputPath)) throw new Error(`Cannot rejudge missing file: ${outputPath}`);
    const saved = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    records = saved.records.map((record) => ({
      testCase: record.testCase,
      annotation: record.annotation,
      structure: validateStructure(record.testCase, record.annotation),
    }));
    console.log(`Rejudging ${records.length} saved annotation results.`);
  } else {
    const testCases = await generateCases();
    records = [];
    const annotationConcurrency = 4;
    for (let index = 0; index < testCases.length; index += annotationConcurrency) {
      const batch = testCases.slice(index, index + annotationConcurrency);
      console.log(`[${index + 1}-${index + batch.length}/${testCases.length}] Annotating ${batch.map((item) => item.name).join(", ")}`);
      const batchRecords = await Promise.all(batch.map(async (testCase) => {
        const annotation = await withRetry(
          `${testCase.name} ${testCase.kind}`,
          () => annotateCase(testCase),
        );
        return { testCase, annotation, structure: validateStructure(testCase, annotation) };
      }));
      records.push(...batchRecords);
    }
  }

  const batchSize = 5;
  for (let index = 0; index < records.length; index += batchSize) {
    const batch = records.slice(index, index + batchSize);
    console.log(`Judging cases ${index + 1}-${index + batch.length}.`);
    const judgments = await withRetry(
      `Judgment batch ${index + 1}-${index + batch.length}`,
      () => judgeBatch(batch),
    );
    for (const record of batch) {
      record.judgment = judgments.find((judgment) => judgment.id === record.testCase.id);
      if (!record.judgment) throw new Error(`Missing judgment for ${record.testCase.id}.`);
    }
  }

  const languages = calculateLanguageResults(records);
  const report = {
    generatedAt: new Date().toISOString(),
    model,
    appUrl,
    mode: legacyMode ? "legacy" : "candidate",
    criteria: "Both informational and pragmatic cases must pass structural checks and the AI quality threshold.",
    summary: {
      candidates: languages.length,
      passed: languages.filter((language) => language.pass).length,
      failed: languages.filter((language) => !language.pass).length,
    },
    languages,
    records,
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Saved ${outputPath}`);
  console.log(`Passed: ${languages.filter((language) => language.pass).map((language) => language.name).join(", ") || "none"}`);
  console.log(`Failed: ${languages.filter((language) => !language.pass).map((language) => language.name).join(", ") || "none"}`);
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});

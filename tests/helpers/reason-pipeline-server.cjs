const targets = [
  {
    text: "When contact intensifies", type: "construction", pattern: "when + subject + present verb",
    primary: "beginner", lexical: "advanced", contextual: "beginner", meaningType: "reusable_construction",
    values: { beginner: "high", intermediate: "low", advanced: "low" },
  },
  { text: "intensifies", type: "word", primary: "advanced", lexical: "advanced" },
  {
    text: "take into account", type: "collocation", primary: "intermediate", lexical: "beginner", contextual: "intermediate",
    meaningType: "idiom", values: { beginner: "low", intermediate: "high", advanced: "low" },
  },
  { text: "phonèmes", type: "term", primary: "advanced", domain: true, meaningType: "domain_term" },
  {
    text: "in principle", type: "formula", primary: "intermediate", lexical: "beginner", meaningType: "discourse_marker",
    values: { beginner: "low", intermediate: "medium", advanced: "low" },
  },
  {
    text: "counterfactual", type: "word", primary: "advanced", lexical: "advanced",
    values: { beginner: "low", intermediate: "low", advanced: "high" },
  },
];

function apiResponse(value) {
  return new Response(JSON.stringify({
    status: "completed",
    output_text: JSON.stringify(value),
    usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
  }), { headers: { "content-type": "application/json" } });
}

// Intercept the transport before the production wrappers capture it. An
// unexpected request fails locally; this fixture never forwards to a network API.
global.fetch = async (url, init) => {
  if (url !== "https://api.openai.com/v1/responses") throw new Error("Unexpected mock transport URL");
  const body = JSON.parse(init.body);
  const prompt = body.input.find((item) => item.role === "system").content;
  const payload = JSON.parse(body.input.find((item) => item.role === "user").content);
  if (prompt.includes("multilingual language-learning annotation engine")) {
    if (!Array.isArray(payload.scanRegions)) throw new Error("Regional discovery was not installed");
    const regions = payload.scanRegions.map((region) => ({
      regionIndex: region.regionIndex,
      annotations: targets.filter((target) => region.regionText.includes(target.text)).map((target) => {
        const start = region.regionText.indexOf(target.text);
        return {
          // Discovery models can reuse IDs within or across regions.
          id: "a1", text: target.text, type: target.type,
          meaningJa: `${target.text}の説明`, noteJa: "", example: "",
          pattern: target.pattern || "", coreRanges: [],
          // Deliberately imperfect model offsets exercise actual span repair.
          start: start + 1, end: start + target.text.length + 1,
          priority: 3, reliability: "high",
        };
      }),
    }));
    process.send?.({ kind: "discovery", prompt, regionCounts: regions.map((region) => region.annotations.length) });
    return apiResponse({
      sourceText: payload.sourceText, sourceLanguage: "en", explanationLanguage: "ja",
      summaryJa: "テスト文章", translation: "", regions, connotations: [], slashReading: [],
    });
  }
  if (prompt.includes("second-stage contextual judge")) {
    process.send?.({ kind: "judge", candidates: payload.candidates });
    return apiResponse({ judgments: payload.candidates.map((candidate) => {
      const target = targets.find((item) => item.text === candidate.text);
      if (!target) throw new Error("Unexpected candidate in mocked judge");
      return {
        id: candidate.id,
        primaryLearnerBand: target.primary || "intermediate",
        componentLexicalBand: target.lexical || "intermediate",
        contextualMeaningBand: target.contextual || "intermediate",
        lexicalTriggerWords: [], domainTerm: target.domain === true, domainTermConfidence: "high",
        annotationValueByBand: target.values || { beginner: "low", intermediate: "low", advanced: "low" },
        meaningType: target.meaningType || "literal_lexical", confidence: "high", reason: "Independent target judgment",
      };
    }) });
  }
  throw new Error("Unexpected mock transport operation");
};

require("../../server-tts.js");

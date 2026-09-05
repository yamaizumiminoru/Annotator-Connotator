const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const reasonSelection = require("../lib/reason-selection");
const advancedRecall = require("../server-advanced-recall");

function judgedCandidate(id, text, type, overrides = {}) {
  return {
    id,
    text,
    type,
    start: overrides.start ?? Number(id.replace(/\D/g, "")) * 20,
    end: overrides.end ?? Number(id.replace(/\D/g, "")) * 20 + text.length,
    judgeMeta: {
      primaryLearnerBand: overrides.primary || "intermediate",
      componentLexicalBand: overrides.lexical || "intermediate",
      lexicalTriggerWords: overrides.triggers || [],
      contextualMeaningBand: overrides.contextual || "intermediate",
      domainTerm: overrides.domain === true,
      domainTermConfidence: overrides.domainConfidence || "high",
      annotationValueByBand: overrides.values || {
        beginner: "low",
        intermediate: "low",
        advanced: "low",
      },
      meaningType: overrides.meaningType || "literal_lexical",
      confidence: overrides.confidence || "high",
      reason: "fixture",
    },
  };
}

test("judge prompt protects advanced literal words and introduced domain terms", () => {
  const prompt = advancedRecall.strengthenJudgePrompt("base prompt");
  assert.match(prompt, /genuinely C1-C2\+ lexical burden/i);
  assert.match(prompt, /primaryLearnerBand should normally be advanced/i);
  assert.match(prompt, /domain term that is explicitly introduced, named, defined, contrasted/i);
  assert.match(prompt, /cues in the source language/);
  assert.match(prompt, /not a prerequisite for term eligibility/);
  assert.match(prompt, /not to basic constructions, collocations, or formulas/i);
});

test("discovery prompt explicitly scans for missed advanced words and named terms", () => {
  const prompt = advancedRecall.strengthenDiscoveryPrompt("base prompt");
  assert.match(prompt, /standalone advanced lexical items/i);
  assert.match(prompt, /rare, formal, academic, historical, technical/i);
  assert.match(prompt, /terms used without an explicit definition/);
  assert.match(prompt, /technical concept remains eligible when it includes a proper name/);
  assert.match(prompt, /incidental names of people or places/);
  assert.match(prompt, /quotations, historical passages/i);
  assert.match(prompt, /Preserve useful beginner and intermediate words and expressions/);
  assert.match(prompt, /assigns one primary learner band/i);
  assert.doesNotMatch(prompt, /Do not pad with ordinary B1-B2 literal vocabulary|called X|linguists call X/);
});

test("advanced lexical words are rescued at standard density even if judge value is too low", () => {
  const philologer = judgedCandidate("a1", "philologer", "word", {
    primary: "advanced",
    lexical: "advanced",
    triggers: ["philologer"],
  });
  assert.equal(reasonSelection.selectAnnotationsByDensity([philologer], 2, ["advanced"]).length, 1);
  assert.equal(reasonSelection.selectAnnotationsByDensity([philologer], 1, ["advanced"]).length, 0);
  assert.equal(reasonSelection.selectAnnotationsByDensity([philologer], 2, ["intermediate"]).length, 0);
});

test("useful advanced-primary domain terms are rescued without reviving lower-band multiword patterns", () => {
  const phoneme = judgedCandidate("a1", "phoneme", "term", {
    primary: "advanced",
    lexical: "intermediate",
    contextual: "intermediate",
    domain: true,
    meaningType: "domain_term",
  });
  const whenConstruction = judgedCandidate("a2", "when contact intensifies", "construction", {
    primary: "beginner",
    lexical: "advanced",
    triggers: ["intensifies"],
    contextual: "beginner",
    values: { beginner: "high", intermediate: "low", advanced: "low" },
    meaningType: "reusable_construction",
  });
  const collocation = judgedCandidate("a3", "more prestigious language", "collocation", {
    primary: "intermediate",
    lexical: "advanced",
    triggers: ["prestigious"],
    contextual: "intermediate",
    values: { beginner: "low", intermediate: "medium", advanced: "low" },
    meaningType: "compositional_phrase",
  });

  assert.deepEqual(
    reasonSelection.selectAnnotationsByDensity([phoneme, whenConstruction, collocation], 2, ["advanced"])
      .map((item) => item.text),
    ["phoneme"],
  );
});

test("shared selection restores only advanced-primary lexical/term misses and preserves source order", () => {
  const kept = judgedCandidate("a1", "duality of patterning", "term", {
    primary: "advanced",
    domain: true,
    values: { beginner: "low", intermediate: "medium", advanced: "high" },
    start: 100,
    end: 120,
  });
  const missedWord = judgedCandidate("a2", "philologer", "word", {
    primary: "advanced",
    lexical: "advanced",
    triggers: ["philologer"],
    start: 40,
    end: 50,
  });
  const basicConstruction = judgedCandidate("a3", "when contact intensifies", "construction", {
    primary: "beginner",
    lexical: "advanced",
    triggers: ["intensifies"],
    contextual: "beginner",
    meaningType: "reusable_construction",
    start: 60,
    end: 85,
  });

  const selected = reasonSelection.selectAnnotationsByDensity([kept, missedWord, basicConstruction], 2, ["advanced"]);
  assert.deepEqual(selected.map((item) => item.id), ["a2", "a1"]);
});

test("server prompt patch installation is idempotent and does not replace shared selection", () => {
  const select = reasonSelection.selectAnnotationsByDensity;
  assert.doesNotThrow(() => advancedRecall.installAdvancedRecallPatch());
  assert.doesNotThrow(() => advancedRecall.installAdvancedRecallPatch());
  assert.equal(reasonSelection.selectAnnotationsByDensity, select);
});

test("browser redisplay and server agree for every learner-band combination and density", () => {
  const browser = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../lib/reason-selection.js"), "utf8"), browser);
  const candidates = [
    judgedCandidate("a1", "初心者の学習対象", "word", {
      primary: "beginner",
      lexical: "beginner",
      values: { beginner: "high", intermediate: "low", advanced: "low" },
    }),
    judgedCandidate("a2", "cible intermédiaire", "idiom", {
      primary: "intermediate",
      meaningType: "idiom",
      values: { beginner: "low", intermediate: "high", advanced: "low" },
    }),
    judgedCandidate("a3", "Fachwort", "word", { primary: "advanced", lexical: "advanced" }),
    judgedCandidate("a4", "形態素", "term", { primary: "advanced", domain: true, meaningType: "domain_term" }),
    judgedCandidate("a5", "when contact intensifies", "construction", {
      primary: "beginner",
      lexical: "advanced", contextual: "beginner", meaningType: "reusable_construction",
      values: { beginner: "high", intermediate: "low", advanced: "low" },
    }),
    judgedCandidate("a6", "more prestigious language", "collocation", {
      primary: "intermediate",
      lexical: "advanced", meaningType: "compositional_phrase",
      values: { beginner: "low", intermediate: "medium", advanced: "low" },
    }),
    judgedCandidate("a7", "advanced target", "formula", {
      primary: "advanced",
      contextual: "advanced", meaningType: "metaphorical_or_extended_sense",
      values: { beginner: "low", intermediate: "low", advanced: "high" },
    }),
    judgedCandidate("a8", "uncertain lexical target", "word", {
      primary: "advanced", lexical: "advanced", confidence: "low",
    }),
    judgedCandidate("a9", "uncertain domain target", "term", {
      primary: "advanced", domain: true, domainConfidence: "low",
    }),
    judgedCandidate("a10", "familiar discourse marker", "formula", {
      primary: "beginner",
      lexical: "beginner", contextual: "beginner", meaningType: "discourse_marker",
      values: { beginner: "low", intermediate: "low", advanced: "medium" },
    }),
  ];
  const original = JSON.stringify(candidates);
  for (let mask = 1; mask < 8; mask += 1) {
    const levels = ["beginner", "intermediate", "advanced"].filter((_, index) => mask & (1 << index));
    for (const density of [1, 2, 3]) {
      const expected = candidates.filter((item) => (
        (levels.includes("beginner") && ["a1", "a5"].includes(item.id))
        || (levels.includes("intermediate") && (item.id === "a2" || (density >= 2 && item.id === "a6")))
        || (levels.includes("advanced") && (
          item.id === "a7"
          || (density >= 2 && ["a3", "a4"].includes(item.id))
        ))
      )).map((item) => item.id);
      const serverResult = reasonSelection.selectAnnotationsByDensity(candidates, density, levels);
      // This is the browser's actual path: prepare and reselect the server's full pool.
      const browserPool = candidates.map((item) => browser.REASON_SELECTION.prepareCandidate(item, levels));
      const browserResult = browser.REASON_SELECTION.selectAnnotationsByDensity(browserPool, density, levels);
      assert.deepEqual(serverResult.map((item) => item.id), expected, `${levels}: density ${density}`);
      assert.equal(JSON.stringify(browserResult), JSON.stringify(serverResult), `${levels}: density ${density}`);
    }
  }
  assert.equal(JSON.stringify(candidates), original, "display eligibility must not rewrite judge metadata");
});

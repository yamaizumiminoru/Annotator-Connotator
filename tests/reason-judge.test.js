const test = require("node:test");
const assert = require("node:assert/strict");
const {
  applyJudgments,
  broadenAnnotationPrompt,
  buildJudgeItems,
  buildJudgePrompt,
  contextForCandidate,
} = require("../lib/reason-judge");

test("judge prompt explicitly decomposes lexical, contextual, domain, and per-band value", () => {
  const prompt = buildJudgePrompt();
  assert.match(prompt, /componentLexicalBand/);
  assert.match(prompt, /contextualMeaningBand/);
  assert.match(prompt, /domainTerm/);
  assert.match(prompt, /annotationValueByBand/);
  assert.match(prompt, /High frequency or reusability alone must not promote/);
});

test("candidate context includes the target sentence and its immediate neighbors", () => {
  const source = "First sentence. Some mistakes stay with you for years. Final sentence.";
  const start = source.indexOf("stay with you");
  const context = contextForCandidate(source, { text: "stay with you", start, end: start + 13 });
  assert.equal(context, source);
});

test("chunk-edge context can borrow a neighboring sentence from supplied context", () => {
  const source = "Brain plasticity matters. Another point follows.";
  const context = contextForCandidate(source, { text: "Brain plasticity", start: 0, end: 16 }, {
    before: "Previous section ends here.",
  });
  assert.match(context, /^Previous section ends here\. Brain plasticity matters\./);
});

test("broad discovery prompt removes the hard learner floor but protects connotation precision", () => {
  const source = [
    "Target level: C1 learners. Prefer nuance-heavy vocabulary.",
    "- Treat the target level as a knowledge floor. Assume the learner already knows easy words.",
    "- Display density is applied by the server after candidate discovery. Do not lower the difficulty threshold or change candidate eligibility based on density.",
    "- Each annotation must offer a concrete learning benefit at the selected target level. If noteJa cannot explain it, omit the annotation.",
    "- Connotations may overlap ordinary annotations.",
  ].join("\n");
  const broadened = broadenAnnotationPrompt(source);
  assert.match(broadened, /discover plausible learning targets broadly across beginner/);
  assert.match(broadened, /do not use the selected learner level as a discovery floor/i);
  assert.match(broadened, /Broad ordinary discovery does not change connotation selection/);
  assert.doesNotMatch(broadened, /Treat the target level as a knowledge floor/);
});

test("discovery enumeration removes candidate quotas and ranking-based exclusion", () => {
  const source = [
    "Candidate discovery target: aim for about 24 eligible ordinary annotations when the passage supports them. This target scales with source length and is not the displayed density count.",
    "Rank every eligible ordinary annotation by pedagogical priority across the whole passage, not first-come-first-served reading order.",
    "When suitable targets occur in the beginning, middle, and end, include strong candidates from those regions in the globally ranked set.",
    "Return fewer candidates when there are genuinely fewer suitable targets. Never pad the set to reach the target, and never lower the learner-level threshold.",
    "- Prefer useful learning targets over rare trivia.",
    "- Return ordinary annotation candidates in descending priority order, using reliability only as a secondary ordering consideration.",
    "- Never pad the ordinary candidate list to reach the discovery target.",
  ].join("\n");
  const broadened = broadenAnnotationPrompt(source);
  assert.match(broadened, /Enumerate every plausible ordinary annotation candidate/);
  assert.match(broadened, /Do not target a particular number/);
  assert.match(broadened, /Do not rank or exclude plausible ordinary candidates by pedagogical priority/);
  assert.match(broadened, /There is no ordinary discovery quota/);
  assert.doesNotMatch(broadened, /aim for about 24/);
  assert.doesNotMatch(broadened, /descending priority order/);
  assert.doesNotMatch(broadened, /globally ranked set/);
});

test("applies judgments to already-discovered candidates without changing their spans", () => {
  const annotations = [{ id: "a1", text: "brain plasticity", type: "term", start: 10, end: 26, priority: 3 }];
  const judgments = [{
    id: "a1",
    componentLexicalBand: "advanced",
    lexicalTriggerWords: ["plasticity"],
    contextualMeaningBand: "advanced",
    domainTerm: true,
    domainTermConfidence: "high",
    annotationValueByBand: { beginner: "low", intermediate: "medium", advanced: "high" },
    meaningType: "domain_term",
    confidence: "high",
    reason: "A technical term with advanced lexical burden.",
  }];
  const applied = applyJudgments(annotations, judgments, ["advanced"]);
  assert.equal(applied[0].start, 10);
  assert.equal(applied[0].end, 26);
  assert.deepEqual(applied[0].reasonTags, ["難語", "術語"]);
  assert.equal(applied[0].priority, 5);
});

test("judge items contain context but not the first-pass gloss or note", () => {
  const source = "A rule of thumb is useful in practice.";
  const start = source.indexOf("rule of thumb");
  const items = buildJudgeItems(source, [{
    id: "a1",
    text: "rule of thumb",
    start,
    end: start + 13,
    meaningJa: "経験則",
    noteJa: "first-pass opinion",
  }]);
  assert.deepEqual(Object.keys(items[0]).sort(), ["context", "id", "text"]);
});
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  applyJudgments,
  broadenAnnotationPrompt,
  buildJudgeItems,
  buildJudgePrompt,
  contextForCandidate,
} = require("../lib/reason-judge");

test("judge prompt explicitly decomposes lexical, target, domain, and per-band value", () => {
  const prompt = buildJudgePrompt();
  assert.match(prompt, /componentLexicalBand/);
  assert.match(prompt, /contextualMeaningBand/);
  assert.match(prompt, /domainTerm/);
  assert.match(prompt, /annotationValueByBand/);
  assert.match(prompt, /learning target the annotation actually teaches/);
  assert.match(prompt, /basic construction remains basic even when one of its slots is filled by advanced vocabulary/i);
  assert.match(prompt, /collocations, formulas, idioms, and other multiword candidates/i);
  assert.match(prompt, /Never promote a construction, collocation, formula, idiom, or other multiword annotation/i);
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

test("applies judgments without changing spans and hides redundant display reasons", () => {
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
  assert.deepEqual(applied[0].reasonTags, ["難語"]);
  assert.ok(applied[0].selectionReasonCodes.includes("technical-term"));
  assert.equal(applied[0].priority, 5);
});

test("judge items expose the intended teaching target, not only the surface span", () => {
  const source = "When contact intensifies, grammar may be borrowed. The family may reach all the way back to Latin.";
  const constructionStart = source.indexOf("When contact intensifies");
  const collocationStart = source.indexOf("reach all the way back");
  const items = buildJudgeItems(source, [
    {
      id: "a1",
      text: "When contact intensifies",
      type: "construction",
      start: constructionStart,
      end: constructionStart + "When contact intensifies".length,
      pattern: "when + subject + verb, main clause",
      meaningJa: "接触が強まるとき",
      noteJa: "when + 現在形で一般的な条件や時点を表す。",
    },
    {
      id: "a2",
      text: "reach all the way back",
      type: "collocation",
      start: collocationStart,
      end: collocationStart + "reach all the way back".length,
      pattern: "reach all the way back (to ...)",
      meaningJa: "ずっと遡る",
      noteJa: "起源や歴史が遠い過去まで遡ることを表す。",
    },
  ]);

  assert.deepEqual(Object.keys(items[0]).sort(), [
    "annotationType",
    "context",
    "id",
    "meaning",
    "note",
    "pattern",
    "text",
  ]);
  assert.equal(items[0].annotationType, "construction");
  assert.equal(items[0].pattern, "when + subject + verb, main clause");
  assert.match(items[0].note, /when \+ 現在形/);
  assert.equal(items[1].annotationType, "collocation");
  assert.equal(items[1].meaning, "ずっと遡る");
});

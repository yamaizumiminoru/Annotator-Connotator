const {
  normalizeJudgeMeta,
  normalizeSelectedLevels,
  prepareCandidate,
  priorityFromJudge,
} = require("./reason-selection");

const SENTENCE_END = new Set([".", "!", "?", "。", "！", "？"]);
const CLOSERS = new Set(['"', "'", "”", "’", "」", "』", "】", ")", "]", "}"]);

function splitSentenceRanges(text) {
  const source = String(text || "");
  if (!source) return [];
  const ranges = [];
  let start = 0;
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (SENTENCE_END.has(char)) {
      let end = index + 1;
      while (end < source.length && CLOSERS.has(source[end])) end += 1;
      while (end < source.length && /\s/u.test(source[end])) end += 1;
      ranges.push({ start, end, text: source.slice(start, end).trim() });
      start = end;
      index = end;
      continue;
    }
    if (char === "\n") {
      let end = index + 1;
      while (end < source.length && source[end] === "\n") end += 1;
      const piece = source.slice(start, end).trim();
      if (piece) ranges.push({ start, end, text: piece });
      start = end;
      index = end;
      continue;
    }
    index += 1;
  }
  if (start < source.length) {
    const piece = source.slice(start).trim();
    if (piece) ranges.push({ start, end: source.length, text: piece });
  }
  return ranges.filter((range) => range.text);
}

function contextForCandidate(sourceText, candidate, surrounding = {}) {
  const source = String(sourceText || "");
  const start = Number(candidate?.start);
  const end = Number(candidate?.end);
  const ranges = splitSentenceRanges(source);
  let index = ranges.findIndex((range) => (
    Number.isInteger(start)
    && Number.isInteger(end)
    && start < range.end
    && end > range.start
  ));
  if (index < 0) {
    const needle = String(candidate?.text || "");
    const located = needle ? source.indexOf(needle) : -1;
    if (located >= 0) {
      index = ranges.findIndex((range) => located >= range.start && located < range.end);
    }
  }

  const pieces = [];
  if (index > 0) {
    pieces.push(ranges[index - 1].text);
  } else if (surrounding.before) {
    const beforeRanges = splitSentenceRanges(String(surrounding.before));
    if (beforeRanges.length) pieces.push(beforeRanges.at(-1).text);
  }

  if (index >= 0) {
    pieces.push(ranges[index].text);
  } else {
    const needle = String(candidate?.text || "").trim();
    pieces.push(needle || source.slice(Math.max(0, start - 160), Math.min(source.length, end + 160)).trim());
  }

  if (index >= 0 && index < ranges.length - 1) {
    pieces.push(ranges[index + 1].text);
  } else if (surrounding.after) {
    const afterRanges = splitSentenceRanges(String(surrounding.after));
    if (afterRanges.length) pieces.push(afterRanges[0].text);
  }

  return pieces.filter(Boolean).join(" ").replace(/\s+/gu, " ").trim();
}

function buildJudgePrompt() {
  return [
    "You are the second-stage contextual judge in a language-learning annotation system.",
    "Candidate discovery has already happened. Do not discover, add, merge, or delete candidates.",
    "Judge every supplied candidate independently in the exact context supplied for that candidate.",
    "Return each supplied candidate id exactly once, copying it unchanged into the corresponding judgment.",
    "Candidate fields include the surface text and context plus first-pass annotation metadata: annotationType, pattern, meaning, and note.",
    "Use that metadata to identify what the annotation is actually trying to teach. The metadata may be imperfect, so do not blindly trust its factual correctness or wording.",
    "Return only one valid JSON object. Do not use markdown fences.",
    "",
    "Learner bands:",
    "- beginner = A1-A2",
    "- intermediate = B1-B2",
    "- advanced = C1-C2+",
    "",
    "For each candidate, distinguish these dimensions:",
    "1. primaryLearnerBand: assign exactly one learner band. This is the band at which the annotation target itself would normally be taught, noticed, or become a salient learning target. It is not the lowest band that could benefit from an explanation, and it is not every band that might still find the item useful.",
    "2. componentLexicalBand: the lowest learner band that reasonably captures the lexical burden of the component words as used here.",
    "3. contextualMeaningBand: the lowest learner band at which the expression, sense, idiomatic meaning, construction, or contextual use itself becomes a meaningful learning target, assuming the component words are known.",
    "4. domainTerm: whether the expression is a conventional or useful domain-specific concept/name in this context. Judge this independently of CEFR difficulty.",
    "5. annotationValueByBand: for beginner, intermediate, and advanced learners separately, rate the educational value of showing this specific annotation target here as high, medium, or low. These values are supporting diagnostics; primaryLearnerBand is the exclusive display classification.",
    "6. meaningType: choose one of literal_lexical, idiom, phrasal_verb, metaphorical_or_extended_sense, reusable_construction, discourse_marker, domain_term, compositional_phrase, other.",
    "",
    "Primary-band principles:",
    "- Choose exactly one primaryLearnerBand even when the annotation could help learners in more than one band.",
    "- Classify the learning target taught by pattern/meaning/note, not the overall difficulty of the whole surface span.",
    "- Do not put an intermediate or advanced grammar/usage target into beginner merely because a beginner might need an explanation to understand the sentence.",
    "- Do not put an ordinary beginner or intermediate target into advanced merely because an advanced learner could still benefit from it.",
    "- For a familiar lower-band expression with subtle discourse or pragmatic behavior, choose the band at which that subtle behavior itself is normally worth teaching, not the band of the component words.",
    "- For technical terms, choose the band at which the term is pedagogically most appropriate in this context. Domain specificity is separate from general-language CEFR difficulty.",
    "- Aim for meaningful separation among beginner, intermediate, and advanced targets rather than assigning the same candidate broadly across bands.",
    "",
    "Other important principles:",
    "- Judge the expression or sense as used in context, not the isolated spelling alone.",
    "- Evaluate annotationValueByBand for the learning target the annotation actually teaches, not for the overall difficulty of the surface span.",
    "- Do not classify only from component-word difficulty, but do not ignore component-word difficulty either.",
    "- Basic component words can form a harder idiom, phrasal verb, metaphorical sense, construction, or technical term.",
    "- A technical term may be valuable even when its component words are simple.",
    "- For construction candidates, judge the construction described by pattern/meaning/note. A basic construction remains basic even when one of its slots is filled by advanced vocabulary.",
    "- For collocations, formulas, idioms, and other multiword candidates, likewise judge the reusable expression or relationship being taught rather than incidental difficult vocabulary inside the example span.",
    "- Never promote a construction, collocation, formula, idiom, or other multiword annotation to advanced merely because the surface span contains an advanced lexical item. If that lexical item is itself worth teaching, it should be handled as a lexical candidate separately.",
    "- High frequency or reusability alone must not promote a familiar lower-band discourse marker into advanced.",
    "- A phrase that is merely compositional should not receive advanced primary classification just because one content word is somewhat formal; lexical burden and expression-level learning value are separate.",
    "- Use the supplied context to resolve the relevant sense.",
    "",
    "Schema:",
    '{"judgments":[{"id":"judge-1","primaryLearnerBand":"beginner|intermediate|advanced","componentLexicalBand":"beginner|intermediate|advanced","lexicalTriggerWords":["word"],"contextualMeaningBand":"beginner|intermediate|advanced","domainTerm":false,"domainTermConfidence":"high|medium|low","annotationValueByBand":{"beginner":"high|medium|low","intermediate":"high|medium|low","advanced":"high|medium|low"},"meaningType":"literal_lexical|idiom|phrasal_verb|metaphorical_or_extended_sense|reusable_construction|discourse_marker|domain_term|compositional_phrase|other","confidence":"high|medium|low","reason":"at most two concise sentences"}]}',
  ].join("\n");
}

function judgeTransportId(index) {
  // Region-local model IDs may repeat. Judge association uses only this batch's order.
  return `judge-${index + 1}`;
}

function uniqueCandidateIds(annotations) {
  const reserved = new Set(annotations.map((candidate) => String(candidate?.id || "")).filter(Boolean));
  const assigned = new Set();
  let nextId = 1;
  return annotations.map((candidate) => {
    let id = String(candidate?.id || "");
    if (!id || assigned.has(id)) {
      while (reserved.has(`a${nextId}`) || assigned.has(`a${nextId}`)) nextId += 1;
      id = `a${nextId}`;
      nextId += 1;
    }
    assigned.add(id);
    return id;
  });
}

function buildJudgeItems(sourceText, annotations, surrounding = {}) {
  return (Array.isArray(annotations) ? annotations : []).map((candidate, index) => ({
    id: judgeTransportId(index),
    text: String(candidate?.text || ""),
    annotationType: String(candidate?.type || ""),
    pattern: String(candidate?.pattern || ""),
    meaning: String(candidate?.meaningJa || candidate?.meaning || ""),
    note: String(candidate?.noteJa || candidate?.note || ""),
    context: contextForCandidate(sourceText, candidate, surrounding),
  }));
}

function applyJudgments(annotations, judgments, selectedLevels) {
  const byId = new Map((Array.isArray(judgments) ? judgments : []).map((item) => [String(item?.id || ""), item]));
  const levels = normalizeSelectedLevels(selectedLevels);
  const candidates = Array.isArray(annotations) ? annotations : [];
  const ids = uniqueCandidateIds(candidates);
  return candidates.map((candidate, index) => {
    const id = ids[index];
    const meta = normalizeJudgeMeta(byId.get(judgeTransportId(index)));
    if (!meta) return candidate?.id === id ? candidate : { ...candidate, id };
    return prepareCandidate({
      ...candidate,
      id,
      judgeMeta: meta,
      priority: priorityFromJudge(meta, candidate?.priority),
      reliability: meta.confidence || candidate?.reliability || "medium",
    }, levels);
  });
}

function broadenAnnotationPrompt(prompt) {
  let text = String(prompt || "");
  text = text.replace(
    /Target level: .*$/m,
    "Ordinary-candidate discovery policy: discover plausible learning targets broadly across beginner (A1-A2), intermediate (B1-B2), and advanced (C1-C2+) learners. Do not filter ordinary candidates by the user's selected learner bands; a separate contextual judge will assign one primary learner band and decide display eligibility.",
  );
  text = text.replace(
    /- Treat the target level as a knowledge floor\.[^\n]*/g,
    "- For ordinary annotations, do not use the selected learner level as a discovery floor. Include plausible lexical, idiomatic, constructional, and domain candidates even when their eventual primary learner band is uncertain.",
  );
  text = text.replace(
    /- Each annotation must offer a concrete learning benefit at the selected target level\.[^\n]*/g,
    "- Each ordinary candidate should have a plausible learning benefit for at least one learner band. Defer the exclusive primary-band classification to the second-stage contextual judge.",
  );
  text = text.replace(
    /- Display density is applied by the server after candidate discovery\.[^\n]*/g,
    "- Display density is applied only after the second-stage judge. Do not change ordinary candidate eligibility based on density during discovery.",
  );
  const marker = "- Connotations may overlap ordinary annotations.";
  if (text.includes(marker) && !text.includes("Broad ordinary discovery does not change connotation selection")) {
    text = text.replace(
      marker,
      "- Broad ordinary discovery does not change connotation selection: keep connotations sparse, grounded, and precision-first exactly as specified below.\n" + marker,
    );
  }
  return text;
}

function broadenCoveragePrompt(prompt) {
  return String(prompt || "")
    .replace(
      /Apply exactly the same learner-level knowledge floor as the first pass\.[^\n]*/g,
      "Review broadly for plausible missed ordinary candidates across learner bands. Do not use a learner-level floor here; the second-stage contextual judge will assign one primary learner band and filter later.",
    )
    .replace(
      /Do not fill a quota, annotate elementary material, repeat an existing target, or create overlapping targets\./g,
      "Do not fill a quota, repeat an existing target, or create overlapping targets. Elementary-looking component words may still form a useful idiom, extended sense, construction, or technical term.",
    );
}

function extractChunkContext(systemPrompt) {
  const text = String(systemPrompt || "");
  return {
    before: parseJsonLine(text, "Preceding context:"),
    after: parseJsonLine(text, "Following context:"),
  };
}

function parseJsonLine(text, label) {
  const index = text.indexOf(label);
  if (index < 0) return "";
  const line = text.slice(index + label.length).split("\n", 1)[0].trim();
  try {
    return JSON.parse(line);
  } catch {
    return line.replace(/^['"]|['"]$/g, "");
  }
}

module.exports = {
  applyJudgments,
  broadenAnnotationPrompt,
  broadenCoveragePrompt,
  buildJudgeItems,
  buildJudgePrompt,
  contextForCandidate,
  extractChunkContext,
  splitSentenceRanges,
};

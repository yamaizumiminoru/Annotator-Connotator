const reasonJudge = require("./lib/reason-judge");

const PATCH_MARKER = "Advanced-recall safeguards:";
const DISCOVERY_MARKER = "Advanced-recall discovery safeguards:";
const COVERAGE_MARKER = "Advanced-recall coverage safeguards:";

function appendBlock(prompt, marker, lines) {
  const text = String(prompt || "");
  if (text.includes(marker)) return text;
  return `${text}\n\n${marker}\n${lines.join("\n")}`;
}

function strengthenJudgePrompt(prompt) {
  return appendBlock(prompt, PATCH_MARKER, [
    "- Preserve recall for genuinely advanced lexical targets. If a word or term has a genuinely C1-C2+ lexical burden in this context, advanced annotationValueByBand should normally be at least medium even when its meaning is literal rather than idiomatic.",
    "- Preserve recall for domain terminology. A conventional domain term that is explicitly introduced, named, defined, contrasted, or needed to follow the source should normally have at least medium advanced-learner value when domainTermConfidence is not low. Do not downgrade it merely because it is foundational or familiar to specialists in that field.",
    "- Interpret naming, definition, and contrast cues in the source language as evidence of a useful domain concept. Such cues are supporting evidence, not a prerequisite for term eligibility.",
    "- Literalness is not a reason to discard a genuinely advanced standalone word. Rare, formal, academic, historical, or discipline-specific vocabulary can be useful precisely because the learner may not know the lexical item itself.",
    "- These recall safeguards apply to standalone lexical/term targets, not to basic constructions, collocations, or formulas that merely contain an advanced word. Keep the earlier rule that incidental difficult slot vocabulary must not promote a simple multiword pattern.",
  ]);
}

function strengthenDiscoveryPrompt(prompt) {
  return appendBlock(prompt, DISCOVERY_MARKER, [
    "- In every scan region, explicitly check for standalone advanced lexical items: rare, formal, academic, historical, technical, or otherwise C1-C2+ words whose contextual sense would merit a gloss even when the use is fully literal.",
    "- Check for domain concepts throughout the source, including named concepts, established technical senses, and terms used without an explicit definition. Interpret supporting cues in the source language. Prefer the exact conventional term span rather than a longer explanatory clause.",
    "- A conventional name for a technical concept remains eligible when it includes a proper name. Distinguish concepts needed to understand the passage from incidental names of people or places, and judge their learning value independently of whether their component words are difficult.",
    "- Do not let a longer collocation, construction, or explanatory phrase crowd out a separately useful advanced word or domain term in the same passage. They teach different things and may both be candidates when the source supports them.",
    "- Apply the same lexical scan inside quotations, historical passages, examples, and parenthetical explanations; advanced vocabulary there is still a learning target.",
    "- These additional lexical checks supplement discovery across all learner bands. Preserve useful beginner and intermediate words and expressions too; literalness alone is not a reason to exclude them. Do not pad with trivial material or promote lower-band targets to advanced; the contextual judge decides each band's learning value separately.",
  ]);
}

function strengthenCoveragePrompt(prompt) {
  return appendBlock(prompt, COVERAGE_MARKER, [
    "- During missed-target review, actively look for standalone C1-C2+ lexical items and useful domain terms that the first pass skipped, including terms introduced by naming/definition cues.",
    "- Do not use this recall pass to restore basic constructions or compositional multiword phrases merely because they contain one difficult word.",
  ]);
}

function installAdvancedRecallPatch() {
  if (reasonJudge.__advancedRecallPatched) return;

  const originalJudgePrompt = reasonJudge.buildJudgePrompt.bind(reasonJudge);
  const originalAnnotationPrompt = reasonJudge.broadenAnnotationPrompt.bind(reasonJudge);
  const originalCoveragePrompt = reasonJudge.broadenCoveragePrompt.bind(reasonJudge);

  reasonJudge.buildJudgePrompt = () => strengthenJudgePrompt(originalJudgePrompt());
  reasonJudge.broadenAnnotationPrompt = (prompt) => strengthenDiscoveryPrompt(originalAnnotationPrompt(prompt));
  reasonJudge.broadenCoveragePrompt = (prompt) => strengthenCoveragePrompt(originalCoveragePrompt(prompt));
  reasonJudge.__advancedRecallPatched = true;
}

module.exports = {
  DISCOVERY_MARKER,
  PATCH_MARKER,
  COVERAGE_MARKER,
  installAdvancedRecallPatch,
  strengthenCoveragePrompt,
  strengthenDiscoveryPrompt,
  strengthenJudgePrompt,
};

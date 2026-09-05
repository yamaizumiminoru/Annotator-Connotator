const reasonSelection = require("./lib/reason-selection");
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
    "- Definition and naming cues such as 'called X', 'linguists call X', 'a term for X', 'known as X', and 'so-called X' are strong evidence that X may be a useful domain-term annotation.",
    "- Literalness is not a reason to discard a genuinely advanced standalone word. Rare, formal, academic, historical, or discipline-specific vocabulary can be useful precisely because the learner may not know the lexical item itself.",
    "- These recall safeguards apply to standalone lexical/term targets, not to basic constructions, collocations, or formulas that merely contain an advanced word. Keep the earlier rule that incidental difficult slot vocabulary must not promote a simple multiword pattern.",
  ]);
}

function strengthenDiscoveryPrompt(prompt) {
  return appendBlock(prompt, DISCOVERY_MARKER, [
    "- In every scan region, explicitly check for standalone advanced lexical items: rare, formal, academic, historical, technical, or otherwise C1-C2+ words whose contextual sense would merit a gloss even when the use is fully literal.",
    "- Explicitly check for domain terms introduced by naming or definition cues such as 'called X', 'linguists call X', 'a term for X', 'known as X', and 'so-called X'. Prefer the exact conventional term span rather than a longer explanatory clause.",
    "- Do not let a longer collocation, construction, or explanatory phrase crowd out a separately useful advanced word or domain term in the same passage. They teach different things and may both be candidates when the source supports them.",
    "- Apply the same lexical scan inside quotations, historical passages, examples, and parenthetical explanations; advanced vocabulary there is still a learning target.",
    "- Do not pad with ordinary B1-B2 literal vocabulary. This safeguard is for plausible C1-C2+ lexical items and useful domain terminology, while the contextual judge still decides final learner-band visibility.",
  ]);
}

function strengthenCoveragePrompt(prompt) {
  return appendBlock(prompt, COVERAGE_MARKER, [
    "- During missed-target review, actively look for standalone C1-C2+ lexical items and useful domain terms that the first pass skipped, including terms introduced by naming/definition cues.",
    "- Do not use this recall pass to restore basic constructions or compositional multiword phrases merely because they contain one difficult word.",
  ]);
}

function isAdvancedRecallCandidate(candidate, density, selectedLevels) {
  if (Number(density) < 2) return false;
  const levels = reasonSelection.normalizeSelectedLevels(selectedLevels);
  if (!levels.includes("advanced")) return false;

  const meta = reasonSelection.normalizeJudgeMeta(candidate?.judgeMeta);
  if (!meta || meta.confidence === "low") return false;
  const type = String(candidate?.type || "");

  if (type === "word") {
    return meta.componentLexicalBand === "advanced";
  }

  if (type === "term") {
    return (
      (meta.domainTerm && meta.domainTermConfidence !== "low")
      || meta.componentLexicalBand === "advanced"
      || meta.contextualMeaningBand === "advanced"
    );
  }

  return false;
}

function mergeAdvancedRecall(selected, candidates, density, selectedLevels) {
  const output = Array.isArray(selected) ? [...selected] : [];
  const seen = new Set(output.map(candidateKey));

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    if (!isAdvancedRecallCandidate(candidate, density, selectedLevels)) continue;
    const prepared = reasonSelection.prepareCandidate(candidate, selectedLevels);
    const key = candidateKey(prepared);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(prepared);
  }

  return output.sort((a, b) => (
    Number(a?.start || 0) - Number(b?.start || 0)
    || Number(a?.end || 0) - Number(b?.end || 0)
  ));
}

function candidateKey(candidate) {
  const id = String(candidate?.id || "");
  if (id) return `id:${id}`;
  return `${Number(candidate?.start || 0)}:${Number(candidate?.end || 0)}:${String(candidate?.type || "")}:${String(candidate?.text || "")}`;
}

function installAdvancedRecallPatch() {
  if (reasonJudge.__advancedRecallPatched || reasonSelection.__advancedRecallPatched) return;

  const originalJudgePrompt = reasonJudge.buildJudgePrompt.bind(reasonJudge);
  const originalAnnotationPrompt = reasonJudge.broadenAnnotationPrompt.bind(reasonJudge);
  const originalCoveragePrompt = reasonJudge.broadenCoveragePrompt.bind(reasonJudge);
  const originalSelection = reasonSelection.selectAnnotationsByDensity.bind(reasonSelection);

  reasonJudge.buildJudgePrompt = () => strengthenJudgePrompt(originalJudgePrompt());
  reasonJudge.broadenAnnotationPrompt = (prompt) => strengthenDiscoveryPrompt(originalAnnotationPrompt(prompt));
  reasonJudge.broadenCoveragePrompt = (prompt) => strengthenCoveragePrompt(originalCoveragePrompt(prompt));
  reasonSelection.selectAnnotationsByDensity = (candidates, density, levels) => mergeAdvancedRecall(
    originalSelection(candidates, density, levels),
    candidates,
    density,
    levels,
  );

  reasonJudge.__advancedRecallPatched = true;
  reasonSelection.__advancedRecallPatched = true;
}

module.exports = {
  DISCOVERY_MARKER,
  PATCH_MARKER,
  COVERAGE_MARKER,
  installAdvancedRecallPatch,
  isAdvancedRecallCandidate,
  mergeAdvancedRecall,
  strengthenCoveragePrompt,
  strengthenDiscoveryPrompt,
  strengthenJudgePrompt,
};

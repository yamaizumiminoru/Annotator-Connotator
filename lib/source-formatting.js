const ALLOWED_STYLES = new Set(["italic"]);
const ALLOWED_REASONS = new Set(["metalinguistic", "title", "conventional"]);

function normalizeLanguage(value) {
  return String(value || "").trim().toLowerCase();
}

function isEnglishLanguage(value) {
  const language = normalizeLanguage(value);
  return language === "en" || language === "english" || language.startsWith("english (");
}

function buildFormattingPolicy(sourceLanguage) {
  const selected = normalizeLanguage(sourceLanguage);
  const englishExplicit = isEnglishLanguage(selected);
  const auto = !selected || selected === "auto" || selected.includes("auto-detected");
  const languageInstruction = englishExplicit
    ? "The source language is English. Apply the explicit English rules below."
    : auto
      ? "Infer the actual source language from sourceText. If it is English, apply the explicit English rules below; otherwise use the conservative non-English fallback."
      : "The source language is not English. Use only the conservative non-English fallback below.";

  return [
    "",
    "Source-text formatting layer:",
    languageInstruction,
    "- Add a top-level formattingSpans array. Formatting is independent of pedagogical annotations and must not change sourceText.",
    '- Each item must be {"text":"exact source substring","start":0,"end":4,"style":"italic","reason":"metalinguistic|title|conventional"}.',
    "- start and end are JavaScript string offsets into the full sourceText. text must exactly equal sourceText.slice(start, end).",
    "- Never insert quotation marks, brackets, punctuation, capitalization, or other characters. The formatting layer may style existing characters only.",
    "- Do not use formatting for mere semantic emphasis or simply because wording is in a foreign language.",
    "- Be conservative. If conventional typography is uncertain, omit the span.",
    "",
    "Explicit English rules:",
    "- Italicize metalinguistic mention: a word, expression, morpheme, affix, letter-string, or construction being discussed as linguistic material rather than used normally in the sentence.",
    "- Italicize titles conventionally set in italics in ordinary English typography, such as books, films, journals, magazines, and newspapers. Do not italicize article or chapter titles merely because they are titles.",
    "- Italicize technical names that conventionally require italics, especially biological binomials such as Homo sapiens.",
    "- Do not invent authorial emphasis. Do not italicize a word merely because it seems important.",
    "",
    "Conservative non-English fallback:",
    "- Apply italic styling only when you are highly confident that the source language's ordinary or specialist typography conventionally uses italics for that exact span.",
    "- Prefer no formatting over importing English typographic conventions into another language.",
    "- Do not synthesize language-specific quotation marks, brackets, corner brackets, or other punctuation; preserving the exact source is mandatory.",
  ].join("\n");
}

function normalizeFormattingSpans(sourceText, rawSpans) {
  const source = String(sourceText || "");
  const spans = Array.isArray(rawSpans) ? rawSpans : [];
  const normalized = [];
  const seen = new Set();

  for (const raw of spans) {
    if (!raw || typeof raw !== "object") continue;
    const start = Number(raw.start);
    const end = Number(raw.end);
    const style = String(raw.style || "").toLowerCase();
    const reason = String(raw.reason || "").toLowerCase();
    if (!Number.isInteger(start) || !Number.isInteger(end)) continue;
    if (start < 0 || end <= start || end > source.length) continue;
    if (!ALLOWED_STYLES.has(style)) continue;
    if (!ALLOWED_REASONS.has(reason)) continue;
    const text = source.slice(start, end);
    if (!text || String(raw.text || "") !== text) continue;
    const key = `${start}:${end}:${style}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ text, start, end, style, reason });
  }

  return normalized.sort((a, b) => a.start - b.start || a.end - b.end);
}

module.exports = {
  ALLOWED_REASONS,
  ALLOWED_STYLES,
  buildFormattingPolicy,
  isEnglishLanguage,
  normalizeFormattingSpans,
  normalizeLanguage,
};

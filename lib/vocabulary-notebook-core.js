(function initVocabularyNotebookCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.VOCABULARY_NOTEBOOK_CORE = api;
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  function normalizeText(value) {
    return String(value ?? "").replace(/\r\n?/g, "\n");
  }

  function hashString(value) {
    const text = normalizeText(value);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function makeSourceId(source = {}) {
    const material = [
      normalizeText(source.sourceLanguage || "auto"),
      normalizeText(source.inputMode || "text"),
      normalizeText(source.youtubeUrl || ""),
      normalizeText(source.text || ""),
    ].join("\u241f");
    return `s-${material.length.toString(36)}-${hashString(material)}`;
  }

  function makeCardId(card = {}) {
    const material = [
      normalizeText(card.sourceId || ""),
      normalizeText(card.text || ""),
      normalizeText(card.type || "word"),
      Number.isInteger(card.start) ? card.start : "",
      Number.isInteger(card.end) ? card.end : "",
      normalizeText(card.meaningJa || ""),
      normalizeText(card.example || ""),
    ].join("\u241f");
    return `c-${material.length.toString(36)}-${hashString(material)}`;
  }

  function locateSpan(sourceText, item = {}) {
    const text = normalizeText(sourceText);
    let start = Number.isInteger(item.start) ? item.start : -1;
    let end = Number.isInteger(item.end) ? item.end : -1;
    const target = normalizeText(item.text || "");

    if (start >= 0 && end > start && end <= text.length) {
      const actual = text.slice(start, end);
      if (!target || actual === target || actual.toLowerCase() === target.toLowerCase()) {
        return { start, end };
      }
    }

    if (target) {
      start = text.indexOf(target);
      if (start < 0) start = text.toLowerCase().indexOf(target.toLowerCase());
      if (start >= 0) return { start, end: start + target.length };
    }
    return { start: -1, end: -1 };
  }

  function contextWindow(sourceText, item = {}, radius = 180) {
    const text = normalizeText(sourceText);
    const located = locateSpan(text, item);
    if (located.start < 0) {
      const clipped = text.length > radius * 2
        ? `${text.slice(0, radius * 2).trimEnd()}…`
        : text;
      return { before: clipped, target: "", after: "", start: -1, end: -1 };
    }

    const safeRadius = Math.max(20, Number(radius) || 180);
    const contextStart = Math.max(0, located.start - safeRadius);
    const contextEnd = Math.min(text.length, located.end + safeRadius);
    const before = `${contextStart > 0 ? "…" : ""}${text.slice(contextStart, located.start)}`;
    const target = text.slice(located.start, located.end);
    const after = `${text.slice(located.end, contextEnd)}${contextEnd < text.length ? "…" : ""}`;
    return { before, target, after, start: located.start, end: located.end };
  }

  function csvEscape(value) {
    const text = normalizeText(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function rowsToCsv(headers, rows) {
    const lines = [headers.map(csvEscape).join(",")];
    for (const row of rows) {
      lines.push(headers.map((header) => csvEscape(row[header] ?? "")).join(","));
    }
    return lines.join("\n");
  }

  function sourceMap(sources = []) {
    return new Map((Array.isArray(sources) ? sources : []).map((source) => [source.id, source]));
  }

  function nuanceText(card = {}) {
    return (Array.isArray(card.nuances) ? card.nuances : [])
      .map((item) => item?.suggestedMeaning || item?.pragmaticEffect || "")
      .filter(Boolean)
      .join(" / ");
  }

  function buildCsv(cards = [], sources = []) {
    const byId = sourceMap(sources);
    const headers = [
      "text",
      "type",
      "meaning",
      "note",
      "example",
      "pattern",
      "nuance",
      "sourceLanguage",
      "sourceContext",
      "sourceText",
      "sourceUrl",
      "addedAt",
    ];
    const rows = (Array.isArray(cards) ? cards : []).map((card) => {
      const source = byId.get(card.sourceId) || {};
      const context = contextWindow(source.text || "", card);
      return {
        text: card.text,
        type: card.type,
        meaning: card.meaningJa,
        note: card.noteJa,
        example: card.example,
        pattern: card.pattern,
        nuance: nuanceText(card),
        sourceLanguage: source.sourceLanguage || card.sourceLanguage || "",
        sourceContext: `${context.before}${context.target}${context.after}`,
        sourceText: source.text || "",
        sourceUrl: source.youtubeUrl || "",
        addedAt: card.addedAt || "",
      };
    });
    return rowsToCsv(headers, rows);
  }

  function escapeHtml(value) {
    return normalizeText(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function buildAnkiCsv(cards = [], sources = []) {
    const byId = sourceMap(sources);
    const lines = [
      "#separator:Comma",
      "#html:true",
      "#columns:Front,Back,Tags,Source",
    ];
    for (const card of Array.isArray(cards) ? cards : []) {
      const source = byId.get(card.sourceId) || {};
      const context = contextWindow(source.text || "", card);
      const backParts = [
        card.meaningJa ? escapeHtml(card.meaningJa) : "",
        card.noteJa ? `<br><br>${escapeHtml(card.noteJa)}` : "",
        card.example ? `<br><br><b>Example:</b> ${escapeHtml(card.example)}` : "",
        card.pattern ? `<br><b>Pattern:</b> ${escapeHtml(card.pattern)}` : "",
        nuanceText(card) ? `<br><b>Nuance:</b> ${escapeHtml(nuanceText(card))}` : "",
      ].filter(Boolean);
      const tags = ["annotator-connotator", card.type, source.sourceLanguage || card.sourceLanguage]
        .filter(Boolean)
        .join(" ");
      const contextText = `${context.before}${context.target}${context.after}`;
      lines.push([
        csvEscape(card.text || ""),
        csvEscape(backParts.join("")),
        csvEscape(tags),
        csvEscape(contextText),
      ].join(","));
    }
    return lines.join("\n");
  }

  function buildExportBundle(cards = [], sources = [], exportedAt = new Date().toISOString()) {
    const usedIds = new Set((Array.isArray(cards) ? cards : []).map((card) => card.sourceId));
    return {
      format: "annotator-connotator-vocabulary-notebook",
      version: 1,
      exportedAt,
      cards: Array.isArray(cards) ? cards : [],
      sources: (Array.isArray(sources) ? sources : []).filter((source) => usedIds.has(source.id)),
    };
  }

  return {
    buildAnkiCsv,
    buildCsv,
    buildExportBundle,
    contextWindow,
    csvEscape,
    hashString,
    locateSpan,
    makeCardId,
    makeSourceId,
    normalizeText,
    rowsToCsv,
  };
}));

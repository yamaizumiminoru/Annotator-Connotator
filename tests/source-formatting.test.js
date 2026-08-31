const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const formatting = require("../lib/source-formatting");
const { mergeChunkResults } = require("../lib/long-form");

const root = path.join(__dirname, "..");

test("English formatting policy is explicit but conservative", () => {
  const prompt = formatting.buildFormattingPolicy("en");
  assert.match(prompt, /metalinguistic mention/i);
  assert.match(prompt, /books, films, journals, magazines, and newspapers/i);
  assert.match(prompt, /Homo sapiens/);
  assert.match(prompt, /Do not invent authorial emphasis/i);
  assert.match(prompt, /Do not use formatting.*foreign language/i);
});

test("non-English formatting policy is a high-confidence fallback", () => {
  const prompt = formatting.buildFormattingPolicy("ja");
  assert.match(prompt, /source language is not English/i);
  assert.match(prompt, /highly confident/i);
  assert.match(prompt, /Prefer no formatting over importing English typographic conventions/i);
  assert.match(prompt, /Never insert quotation marks, brackets, punctuation/i);
});

test("formatting spans preserve exact source offsets and reject invented text", () => {
  const source = "The verb do is useful.";
  const spans = formatting.normalizeFormattingSpans(source, [
    { text: "do", start: 9, end: 11, style: "italic", reason: "metalinguistic" },
    { text: "verb", start: 4, end: 8, style: "bold", reason: "metalinguistic" },
    { text: "DO", start: 9, end: 11, style: "italic", reason: "metalinguistic" },
  ]);
  assert.deepEqual(spans, [
    { text: "do", start: 9, end: 11, style: "italic", reason: "metalinguistic" },
  ]);
});

test("long-form merge shifts and preserves formatting spans", () => {
  const source = "doHomo sapiens";
  const merged = mergeChunkResults(source, [
    {
      chunk: { index: 0, start: 0, end: 2 },
      result: {
        sourceLanguage: "English",
        annotations: [],
        connotations: [],
        formattingSpans: [
          { text: "do", start: 0, end: 2, style: "italic", reason: "metalinguistic" },
        ],
      },
    },
    {
      chunk: { index: 1, start: 2, end: source.length },
      result: {
        sourceLanguage: "English",
        annotations: [],
        connotations: [],
        formattingSpans: [
          { text: "Homo sapiens", start: 0, end: 12, style: "italic", reason: "conventional" },
        ],
      },
    },
  ], { sourceLanguage: "auto", explanationLanguage: "ja", level: "intermediate" });

  assert.deepEqual(merged.result.formattingSpans, [
    { text: "do", start: 0, end: 2, style: "italic", reason: "metalinguistic" },
    { text: "Homo sapiens", start: 2, end: 14, style: "italic", reason: "conventional" },
  ]);
});

test("server and client install the independent source formatting layer", () => {
  const serverEntry = fs.readFileSync(path.join(root, "server-tts.js"), "utf8");
  const serverPatch = fs.readFileSync(path.join(root, "server-source-formatting.js"), "utf8");
  const clientEntry = fs.readFileSync(path.join(root, "client-analysis.js"), "utf8");
  const client = fs.readFileSync(path.join(root, "source-formatting-client.js"), "utf8");

  assert.match(serverEntry, /server-source-formatting/);
  assert.ok(serverEntry.indexOf("server-source-formatting") < serverEntry.indexOf("server-reason-selection"));
  assert.match(serverPatch, /formattingSpans/);
  assert.match(clientEntry, /source-formatting-client\.js/);
  assert.match(client, /em\.className = "source-format-italic"/);
  assert.match(client, /current\.__overlapAware/);
  assert.match(client, /result\?\.formattingSpans/);
});

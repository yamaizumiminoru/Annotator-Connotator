const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  MATERIAL_FORMAT,
  MATERIAL_SCHEMA_VERSION,
  buildMaterialEnvelope,
  materialResultFromFullResult,
  safeFilenameStem,
  unwrapMaterial,
  validateResult,
} = require("../material-io.js");

const root = path.join(__dirname, "..");

function candidate(id, band) {
  return {
    id,
    text: id,
    type: "word",
    meaningJa: id,
    noteJa: "",
    example: "",
    pattern: "",
    coreRanges: [],
    start: 0,
    end: id.length,
    judgeMeta: {
      primaryLearnerBand: band,
      componentLexicalBand: band,
      contextualMeaningBand: band,
      annotationValueByBand: { beginner: "low", intermediate: "low", advanced: "low" },
      lexicalTriggerWords: [],
      domainTerm: false,
      domainTermConfidence: "high",
      meaningType: "literal_lexical",
      confidence: "high",
      reason: "fixture",
    },
  };
}

function fullResult() {
  const beginner = candidate("basic", "beginner");
  const intermediate = candidate("middle", "intermediate");
  const advanced = candidate("hard", "advanced");
  return {
    sourceText: "basic middle hard",
    sourceLanguage: "en",
    explanationLanguage: "ja",
    uiLanguage: "ja",
    level: "advanced",
    levels: ["advanced"],
    translation: "",
    annotations: [advanced],
    connotations: [],
    slashReading: [],
    _selection: {
      version: 2,
      candidates: [beginner, intermediate, advanced],
    },
    _api: { selectedLevels: ["advanced"] },
  };
}

test("material envelope stores the complete candidate pool, not only displayed annotations", () => {
  const result = fullResult();
  const envelope = buildMaterialEnvelope(
    result,
    { levels: ["advanced"], density: "4" },
    "2026-09-05T00:00:00.000Z",
  );
  assert.equal(envelope.format, MATERIAL_FORMAT);
  assert.equal(envelope.schemaVersion, 2);
  assert.equal(MATERIAL_SCHEMA_VERSION, 2);
  assert.equal(envelope.exportedAt, "2026-09-05T00:00:00.000Z");
  assert.deepEqual(envelope.result.annotations.map((item) => item.id), ["basic", "middle", "hard"]);
  assert.deepEqual(envelope.result.annotations.map((item) => item.judgeMeta.primaryLearnerBand), ["beginner", "intermediate", "advanced"]);
  assert.deepEqual(envelope.settings.levels, ["advanced"]);
  assert.equal(Object.hasOwn(envelope.settings, "level"), false);
  assert.equal(Object.hasOwn(envelope.result, "_selection"), false);
  assert.equal(Object.hasOwn(envelope.result, "_api"), false);
});

test("material result conversion requires a full candidate pool", () => {
  assert.throws(
    () => materialResultFromFullResult({ ...fullResult(), _selection: undefined }),
    /missing_candidate_pool/,
  );
});

test("current material loader accepts schema 2", () => {
  const envelope = buildMaterialEnvelope(fullResult(), { levels: ["beginner", "advanced"] });
  const loaded = unwrapMaterial(envelope);
  assert.equal(loaded.schemaVersion, 2);
  assert.deepEqual(loaded.settings.levels, ["beginner", "advanced"]);
  assert.equal(validateResult(loaded.result), true);
});

test("old schema 1 and raw result JSON are intentionally rejected", () => {
  const current = buildMaterialEnvelope(fullResult(), { levels: ["intermediate"] });
  assert.throws(
    () => unwrapMaterial({ ...current, schemaVersion: 1 }),
    /unsupported_schema/,
  );
  assert.throws(
    () => unwrapMaterial(current.result),
    /unsupported_schema/,
  );
});

test("material validation requires a primary learner band on every saved candidate", () => {
  const result = materialResultFromFullResult(fullResult(), { levels: ["intermediate"] });
  assert.equal(validateResult(result), true);
  delete result.annotations[1].judgeMeta.primaryLearnerBand;
  assert.equal(validateResult(result), false);
});

test("material filename is safe and based on the first line", () => {
  assert.equal(safeFilenameStem('Lesson: pragmatics?\nSecond line'), "Lesson_ pragmatics_");
});

test("the app loads material I/O and keeps legacy Markdown controls out of sight", () => {
  const ui = fs.readFileSync(path.join(root, "vocabulary-notebook-ui.js"), "utf8");
  const material = fs.readFileSync(path.join(root, "material-io.js"), "utf8");
  assert.match(ui, /material-io\.js/);
  assert.match(material, /legacyGrid\.style\.display = "none"/);
  assert.match(material, /materialJsonImportBtn/);
  assert.match(material, /materialJsonSaveBtn/);
  assert.match(material, /tab\.dataset\.i18n = "ioTab"/);
});

test("material I/O reload resynchronizes the currently selected UI language", () => {
  const ui = fs.readFileSync(path.join(root, "vocabulary-notebook-ui.js"), "utf8");
  assert.match(ui, /script\.async = false/);
  assert.match(ui, /resyncSelectedUiLanguage/);
  assert.match(ui, /dispatchEvent\(new Event\("change"/);
  assert.match(ui, /script\.addEventListener\("load", resyncUiAfterPageLoad/);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  MATERIAL_FORMAT,
  MATERIAL_SCHEMA_VERSION,
  buildMaterialEnvelope,
  safeFilenameStem,
  unwrapMaterial,
  validateResult,
} = require("../material-io.js");

const root = path.join(__dirname, "..");

function sampleResult() {
  return {
    sourceText: "This is a test.",
    sourceLanguage: "en",
    explanationLanguage: "ja",
    uiLanguage: "ja",
    level: "intermediate",
    translation: "これはテストです。",
    annotations: [
      {
        id: "a1",
        text: "a test",
        type: "word",
        meaningJa: "テスト",
        noteJa: "",
        example: "",
        pattern: "",
        coreRanges: [],
        start: 8,
        end: 14,
      },
    ],
    connotations: [],
    slashReading: [],
  };
}

test("material envelope has a versioned reusable format", () => {
  const result = sampleResult();
  const envelope = buildMaterialEnvelope(
    result,
    { includeTranslation: true, nuanceDetail: "3" },
    "2026-08-30T00:00:00.000Z",
  );
  assert.equal(envelope.format, MATERIAL_FORMAT);
  assert.equal(envelope.schemaVersion, MATERIAL_SCHEMA_VERSION);
  assert.equal(envelope.exportedAt, "2026-08-30T00:00:00.000Z");
  assert.deepEqual(envelope.result, result);
  assert.equal(envelope.settings.includeTranslation, true);
  assert.notEqual(envelope.result, result, "saved result should be a JSON-safe clone");
});

test("material loader accepts the versioned envelope", () => {
  const result = sampleResult();
  const envelope = buildMaterialEnvelope(result, { level: "intermediate" });
  const loaded = unwrapMaterial(envelope);
  assert.equal(loaded.legacy, false);
  assert.equal(loaded.schemaVersion, 1);
  assert.deepEqual(loaded.result, result);
  assert.equal(validateResult(loaded.result), true);
});

test("material loader accepts legacy raw result JSON", () => {
  const result = sampleResult();
  const loaded = unwrapMaterial(result);
  assert.equal(loaded.legacy, true);
  assert.equal(loaded.schemaVersion, 0);
  assert.deepEqual(loaded.result, result);
});

test("material loader rejects a newer unsupported schema", () => {
  assert.throws(
    () => unwrapMaterial({
      format: MATERIAL_FORMAT,
      schemaVersion: MATERIAL_SCHEMA_VERSION + 1,
      result: sampleResult(),
    }),
    /newer_schema/,
  );
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

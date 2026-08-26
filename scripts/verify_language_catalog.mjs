import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const languageSource = fs.readFileSync(path.join(root, "languages.js"), "utf8");
const clientAnalysisSource = fs.readFileSync(path.join(root, "client-analysis.js"), "utf8");
const sandbox = {};
sandbox.window = sandbox;
const context = vm.createContext(sandbox);
vm.runInContext(languageSource, context, { filename: "languages.js" });
vm.runInContext(clientAnalysisSource, context, { filename: "client-analysis.js" });

const catalog = context.LANGUAGE_CATALOG;
assert.ok(Array.isArray(catalog), "LANGUAGE_CATALOG must be an array");
assert.equal(catalog.length, 74, "The public catalog must contain 74 languages");
assert.equal(new Set(catalog.map((item) => item.code)).size, catalog.length, "Language codes must be unique");

for (const language of catalog) {
  assert.match(language.code, /^[a-z]{2,3}$/, `Invalid language code: ${language.code}`);
  assert.ok(language.name && language.native && language.speech, `Incomplete language entry: ${language.code}`);
}

const serverSource = fs.readFileSync(path.join(root, "server.js"), "utf8");
const tableMatch = serverSource.match(/function languageName\([\s\S]*?const table = (\{[\s\S]*?\n  \});/);
assert.ok(tableMatch, "Could not find the server language-name table");
const baseServerLanguages = vm.runInNewContext(`(${tableMatch[1]})`);
const require = createRequire(import.meta.url);
const { VALIDATED_LANGUAGE_NAMES } = require("../lib/explanation-language-routing.js");
const serverLanguages = { ...baseServerLanguages, ...VALIDATED_LANGUAGE_NAMES };
const catalogCodes = Array.from(catalog, (language) => language.code).sort();
const serverCodes = Object.keys(serverLanguages).filter((code) => code !== "auto").sort();
assert.deepEqual(serverCodes, catalogCodes, "The effective server language routing must exactly match the public catalog");

for (const language of catalog) {
  assert.equal(serverLanguages[language.code], language.name, `Server name mismatch for ${language.code}`);
}

const accepted = [
  "am", "bn", "my", "eu", "ka", "gu", "ha", "km", "lo", "ml", "mt", "pa", "te", "uz", "yo", "zu",
  "mn", "mi", "ur",
];
const withheld = ["ga", "si", "so"];
for (const code of accepted) assert.ok(catalog.some((language) => language.code === code), `Missing accepted language: ${code}`);
for (const code of withheld) assert.ok(!catalog.some((language) => language.code === code), `Withheld language was added: ${code}`);

console.log("Language catalog verified: 74 entries; all passed source and explanation screening.");

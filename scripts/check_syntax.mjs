import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const files = [
  "server.js",
  "server-reason-selection.js",
  "script.js",
  "client-analysis.js",
  "client-session.js",
  "reason-selection-client.js",
  "reason-ui-localization.js",
  "card-presentation.js",
  "vocabulary-notebook.js",
  "vocabulary-notebook-ui.js",
  ...fs.readdirSync(path.join(root, "lib"))
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join("lib", name)),
];

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status === 0) continue;
  process.stderr.write(result.stderr || result.stdout || `Syntax check failed: ${file}\n`);
  process.exit(result.status || 1);
}

console.log(`Syntax OK: ${files.length} files`);

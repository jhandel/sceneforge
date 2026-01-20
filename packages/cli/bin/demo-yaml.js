#!/usr/bin/env node
import { spawnSync } from "child_process";
import { fileURLToPath, pathToFileURL } from "url";
import path from "path";
import { createRequire } from "module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliPath = path.join(__dirname, "..", "src", "cli.js");

const nodeMajor = Number(process.versions.node.split(".")[0]);
const nodeArgs = [];
const require = createRequire(import.meta.url);
const tsxImportPath = require.resolve("tsx/esm");
const tsxImport = pathToFileURL(tsxImportPath).href;

if (nodeMajor >= 20) {
  nodeArgs.push("--import", tsxImport);
} else {
  nodeArgs.push("--loader", tsxImport);
}

nodeArgs.push(cliPath, ...process.argv.slice(2));

const result = spawnSync(process.execPath, nodeArgs, { stdio: "inherit" });
if (result.error) {
  console.error(result.error);
}
process.exit(result.status ?? 1);

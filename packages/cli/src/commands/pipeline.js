import * as fs from "fs/promises";
import { loadDemoDefinition } from "@demo-tools/playwright";
import { getFlagValue, hasFlag } from "../utils/args.js";
import { ensureDir, getOutputPaths, resolveRoot, toAbsolute } from "../utils/paths.js";
import { runRecordDemoCommand } from "./record-demo.js";
import { runSplitVideoCommand } from "./split-video.js";
import { runGenerateVoiceoverCommand } from "./generate-voiceover.js";
import { runAddAudioCommand } from "./add-audio-to-steps.js";
import { runConcatCommand } from "./concat-final-videos.js";

function printHelp() {
  console.log(`
Run the full demo pipeline (record → split → voiceover → add-audio → concat)

Usage:
  demo-yaml pipeline [options]

Required (same as record):
  --definition <path>     Path to the YAML demo definition
  --demo <name>           Demo name (resolved in --definitions-dir)
  --base-url <url>        Base URL for the demo
  --org-slug <slug>       Org slug for URL templates

Pipeline options:
  --clean                Remove output artifacts before running
  --padding <sec>        Extra padding after audio ends (default: 0.3)
  --env-file <path>      Env file for ElevenLabs credentials
  --voice-id <id>        Override ElevenLabs voice ID
  --root <path>          Project root (defaults to cwd)
  --output-dir <path>    Output directory (defaults to output or e2e/output)
  --help, -h             Show this help message

Examples:
  demo-yaml pipeline --definition demo-definitions/create-quote.yaml --base-url http://localhost:5173 --org-slug my-org
  demo-yaml pipeline --demo create-quote --definitions-dir examples --base-url http://localhost:5173 --org-slug my-org --clean
`);
}

async function resolveDemoName(rootDir, args) {
  const demo = getFlagValue(args, "--demo");
  if (demo) {
    return demo;
  }

  const definitionArg = getFlagValue(args, "--definition");
  if (!definitionArg) {
    return null;
  }

  const definitionPath = toAbsolute(rootDir, definitionArg);
  const definition = await loadDemoDefinition(definitionPath);
  return definition.name;
}

async function cleanOutput(paths) {
  const dirs = [
    paths.scriptsDir,
    paths.videosDir,
    paths.audioDir,
    paths.finalDir,
    paths.tempDir,
    paths.testResultsDir,
  ];

  for (const dir of dirs) {
    await fs.rm(dir, { recursive: true, force: true });
  }

  await ensureDir(paths.outputDir);
}

function withoutFlag(args, flag) {
  const result = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === flag) {
      continue;
    }
    result.push(args[i]);
  }
  return result;
}

export async function runPipelineCommand(argv) {
  const args = argv ?? process.argv.slice(2);
  const help = hasFlag(args, "--help") || hasFlag(args, "-h");

  if (help) {
    printHelp();
    return;
  }

  const root = getFlagValue(args, "--root");
  const outputDir = getFlagValue(args, "--output-dir");
  const envFile = getFlagValue(args, "--env-file");
  const voiceId = getFlagValue(args, "--voice-id");
  const padding = getFlagValue(args, "--padding");
  const clean = hasFlag(args, "--clean");

  const rootDir = resolveRoot(root);
  const outputPaths = await getOutputPaths(rootDir, outputDir);

  if (clean) {
    await cleanOutput(outputPaths);
  }

  const demoName = await resolveDemoName(rootDir, args);
  if (!demoName) {
    console.error("[error] Provide --demo or --definition to run the pipeline");
    printHelp();
    process.exit(1);
  }

  const recordArgs = withoutFlag(args, "--clean");
  await runRecordDemoCommand(recordArgs);

  const sharedArgs = [];
  if (root) {
    sharedArgs.push("--root", root);
  }
  if (outputDir) {
    sharedArgs.push("--output-dir", outputDir);
  }

  await runSplitVideoCommand(["--demo", demoName, ...sharedArgs]);

  const voiceArgs = ["--demo", demoName, ...sharedArgs];
  if (envFile) {
    voiceArgs.push("--env-file", envFile);
  }
  if (voiceId) {
    voiceArgs.push("--voice-id", voiceId);
  }
  await runGenerateVoiceoverCommand(voiceArgs);

  const audioArgs = ["--demo", demoName, ...sharedArgs];
  if (padding) {
    audioArgs.push("--padding", padding);
  }
  await runAddAudioCommand(audioArgs);

  await runConcatCommand(["--demo", demoName, ...sharedArgs]);
}

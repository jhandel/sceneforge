#!/usr/bin/env node
import { runSplitVideoCommand } from "./commands/split-video.js";
import { runGenerateVoiceoverCommand } from "./commands/generate-voiceover.js";
import { runAddAudioCommand } from "./commands/add-audio-to-steps.js";
import { runConcatCommand } from "./commands/concat-final-videos.js";
import { runRecordDemoCommand } from "./commands/record-demo.js";
import { runPipelineCommand } from "./commands/pipeline.js";
import { runDoctorCommand } from "./commands/doctor.js";
import { runSetupCommand } from "./commands/setup.js";

function printHelp() {
  console.log(`
SceneForge CLI

Usage:
  sceneforge <command> [options]

Commands:
  record       Run a demo definition with Playwright and generate scripts
  setup        Run a setup definition and save storage state
  pipeline     Run the full pipeline (record → split → voiceover → add-audio → concat)
  split        Split recorded demo videos into per-step clips
  voiceover    Generate voiceover audio with ElevenLabs
  add-audio    Add audio tracks to per-step clips
  concat       Concatenate clips into final demo videos
  doctor       Run diagnostics for ffmpeg/ffprobe/env

Run "sceneforge <command> --help" for command-specific options.
`);
}

const [command, ...rest] = process.argv.slice(2);

if (!command || command === "help" || command === "--help" || command === "-h") {
  printHelp();
  process.exit(0);
}

const normalized = command.toLowerCase();

switch (normalized) {
  case "record":
  case "run":
  case "generate":
    await runRecordDemoCommand(rest);
    break;
  case "setup":
  case "login":
    await runSetupCommand(rest);
    break;
  case "pipeline":
  case "run-pipeline":
    await runPipelineCommand(rest);
    break;
  case "split":
  case "split-video":
  case "split-video-by-steps":
    await runSplitVideoCommand(rest);
    break;
  case "voiceover":
  case "generate-voiceover":
    await runGenerateVoiceoverCommand(rest);
    break;
  case "add-audio":
  case "add-audio-to-steps":
    await runAddAudioCommand(rest);
    break;
  case "concat":
  case "concat-final-videos":
    await runConcatCommand(rest);
    break;
  case "doctor":
  case "diagnostics":
    await runDoctorCommand(rest);
    break;
  default:
    console.error(`[error] Unknown command: ${command}`);
    printHelp();
    process.exit(1);
}

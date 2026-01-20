import * as fs from "fs/promises";
import * as path from "path";
import { loadDemoDefinition } from "@t3lnet/sceneforge";
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
  sceneforge pipeline [options]

Required (same as record):
  --definition <path>     Path to the YAML demo definition
  --demo <name>           Demo name (resolved in --definitions-dir)
  --base-url <url>        Base URL for the demo

Pipeline options:
  --clean                Remove output artifacts before running
  --dry-run              Print planned steps without running them
  --resume               Skip steps that already have output artifacts
  --progress             Show pipeline step progress markers
  --padding <sec>        Extra padding after audio ends (default: 0.3)
  --env-file <path>      Env file for ElevenLabs credentials
  --voice-id <id>        Override ElevenLabs voice ID
  --root <path>          Project root (defaults to cwd)
  --output-dir <path>    Output directory (defaults to output or e2e/output)

Media options (for final video):
  --intro <path>         Intro video to prepend (overrides YAML config)
  --outro <path>         Outro video to append (overrides YAML config)
  --music <path>         Background music file (overrides YAML config)
  --music-volume <0-1>   Background music volume (default: 0.15)
  --music-loop           Loop music if shorter than video
  --music-fade-in <s>    Fade in duration for music (default: 1)
  --music-fade-out <s>   Fade out duration for music (default: 2)

  --help, -h             Show this help message

Examples:
  sceneforge pipeline --definition demo-definitions/create-quote.yaml --base-url http://localhost:5173
  sceneforge pipeline --demo create-quote --definitions-dir examples --base-url http://localhost:5173 --clean
  sceneforge pipeline --demo create-quote --output-dir output --resume --progress
  sceneforge pipeline --demo create-quote --intro assets/intro.mp4 --music assets/bg-music.mp3
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

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function hasRecordedAssets(demoName, paths) {
  const scriptPath = path.join(paths.scriptsDir, `${demoName}.json`);
  const videoPath = path.join(paths.videosDir, `${demoName}.webm`);
  const altVideoPath = path.join(paths.videosDir, `${demoName}-flow.webm`);
  const hasScript = await pathExists(scriptPath);
  const hasVideo = (await pathExists(videoPath)) || (await pathExists(altVideoPath));
  return hasScript && hasVideo;
}

async function hasSplitOutputs(demoName, paths) {
  const manifestPath = path.join(paths.videosDir, demoName, "steps-manifest.json");
  return pathExists(manifestPath);
}

async function hasVoiceoverOutputs(demoName, paths) {
  const manifestPath = path.join(paths.audioDir, demoName, "manifest.json");
  return pathExists(manifestPath);
}

async function hasAudioOutputs(demoName, paths) {
  const demoDir = path.join(paths.videosDir, demoName);
  try {
    const files = await fs.readdir(demoDir);
    return files.some((file) => file.endsWith("_with_audio.mp4"));
  } catch {
    return false;
  }
}

async function hasConcatOutputs(demoName, paths) {
  const outputPath = path.join(paths.finalDir, `${demoName}.mp4`);
  return pathExists(outputPath);
}

async function buildPipelinePlan(demoName, paths, resume) {
  if (!resume) {
    return {
      record: true,
      split: true,
      voiceover: true,
      addAudio: true,
      concat: true,
    };
  }

  return {
    record: !(await hasRecordedAssets(demoName, paths)),
    split: !(await hasSplitOutputs(demoName, paths)),
    voiceover: !(await hasVoiceoverOutputs(demoName, paths)),
    addAudio: !(await hasAudioOutputs(demoName, paths)),
    concat: !(await hasConcatOutputs(demoName, paths)),
  };
}

function logPipelineStep(showProgress, index, total, message) {
  const prefix = showProgress ? `[pipeline] [${index}/${total}]` : "[pipeline]";
  console.log(`${prefix} ${message}`);
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
  const dryRun = hasFlag(args, "--dry-run");
  const resume = hasFlag(args, "--resume");
  const showProgress = hasFlag(args, "--progress");
  const baseUrl = getFlagValue(args, "--base-url");

  // New media options
  const intro = getFlagValue(args, "--intro");
  const outro = getFlagValue(args, "--outro");
  const music = getFlagValue(args, "--music");
  const musicVolume = getFlagValue(args, "--music-volume");
  const musicLoop = hasFlag(args, "--music-loop");
  const musicFadeIn = getFlagValue(args, "--music-fade-in");
  const musicFadeOut = getFlagValue(args, "--music-fade-out");

  const rootDir = resolveRoot(root);
  const outputPaths = await getOutputPaths(rootDir, outputDir);

  const demoName = await resolveDemoName(rootDir, args);
  if (!demoName) {
    console.error("[error] Provide --demo or --definition to run the pipeline");
    printHelp();
    process.exit(1);
  }

  const effectiveResume = resume && !clean;
  const plan = await buildPipelinePlan(demoName, outputPaths, effectiveResume);

  if (plan.record && !baseUrl) {
    console.error("[error] --base-url is required to record a demo");
    printHelp();
    process.exit(1);
  }

  if (dryRun) {
    if (clean) {
      console.log("[pipeline] --clean specified; resume will be ignored");
    }
    console.log(`[pipeline] Dry run for: ${demoName}`);
    const steps = [
      ["record", plan.record],
      ["split", plan.split],
      ["voiceover", plan.voiceover],
      ["add-audio", plan.addAudio],
      ["concat", plan.concat],
    ];
    for (const [step, shouldRun] of steps) {
      console.log(`- ${step}: ${shouldRun ? "run" : "skip (--resume)"}`);
    }
    if (intro || outro || music) {
      console.log("\nMedia options:");
      if (intro) console.log(`  - Intro: ${intro}`);
      if (outro) console.log(`  - Outro: ${outro}`);
      if (music) console.log(`  - Music: ${music}`);
    }
    return;
  }

  if (clean) {
    await cleanOutput(outputPaths);
  }

  const totalSteps = 5;
  let stepIndex = 0;

  const runStep = async (label, shouldRun, fn) => {
    stepIndex += 1;
    if (!shouldRun) {
      logPipelineStep(showProgress, stepIndex, totalSteps, `${label} (skipped --resume)`);
      return;
    }
    logPipelineStep(showProgress, stepIndex, totalSteps, `Starting ${label}`);
    await fn();
    logPipelineStep(showProgress, stepIndex, totalSteps, `Completed ${label}`);
  };

  let recordArgs = withoutFlag(args, "--clean");
  recordArgs = withoutFlag(recordArgs, "--resume");
  recordArgs = withoutFlag(recordArgs, "--dry-run");
  recordArgs = withoutFlag(recordArgs, "--progress");
  await runStep("record", plan.record, () => runRecordDemoCommand(recordArgs));

  const sharedArgs = [];
  if (root) {
    sharedArgs.push("--root", root);
  }
  if (outputDir) {
    sharedArgs.push("--output-dir", outputDir);
  }

  await runStep("split", plan.split, () =>
    runSplitVideoCommand(["--demo", demoName, ...sharedArgs])
  );

  const voiceArgs = ["--demo", demoName, ...sharedArgs];
  if (envFile) {
    voiceArgs.push("--env-file", envFile);
  }
  if (voiceId) {
    voiceArgs.push("--voice-id", voiceId);
  }
  await runStep("voiceover", plan.voiceover, () => runGenerateVoiceoverCommand(voiceArgs));

  const audioArgs = ["--demo", demoName, ...sharedArgs];
  if (padding) {
    audioArgs.push("--padding", padding);
  }
  await runStep("add-audio", plan.addAudio, () => runAddAudioCommand(audioArgs));

  // Build concat args with media options
  const concatArgs = ["--demo", demoName, ...sharedArgs];
  if (intro) {
    concatArgs.push("--intro", intro);
  }
  if (outro) {
    concatArgs.push("--outro", outro);
  }
  if (music) {
    concatArgs.push("--music", music);
  }
  if (musicVolume) {
    concatArgs.push("--music-volume", musicVolume);
  }
  if (musicLoop) {
    concatArgs.push("--music-loop");
  }
  if (musicFadeIn) {
    concatArgs.push("--music-fade-in", musicFadeIn);
  }
  if (musicFadeOut) {
    concatArgs.push("--music-fade-out", musicFadeOut);
  }

  await runStep("concat", plan.concat, () => runConcatCommand(concatArgs));
}

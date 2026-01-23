import * as fs from "fs/promises";
import * as path from "path";
import { checkFFmpeg, getMediaDuration, runFFmpeg } from "../utils/media.js";
import { getFlagValue, hasFlag } from "../utils/args.js";
import { getOutputPaths, resolveRoot, readJson } from "../utils/paths.js";
import { sanitizeFileSegment } from "../utils/sanitize.js";
import {
  getIntermediateEncodingArgs,
} from "../utils/quality.js";
import {
  parseOutputDimensions,
  getOutputDimensionsHelpText,
  getScaleFilterArgs,
  logOutputDimensions,
} from "../utils/dimensions.js";

function printHelp() {
  console.log(`
Add audio to individual video step clips

Uses lossless encoding for intermediate files to preserve quality.
Final compression is applied only at the concat step.

Usage:
  sceneforge add-audio [options]

Options:
  --demo <name>         Process a specific demo by name
  --all                 Process all demos with video steps and audio
  --padding <sec>       Extra padding after audio ends (default: 0.3)
  --root <path>         Project root (defaults to cwd)
  --output-dir <path>   Output directory (defaults to e2e/output or output)
  --help, -h            Show this help message
${getOutputDimensionsHelpText()}

Output:
  Creates step_XX_<stepId>_with_audio.mp4 files in the videos/<demo>/ folder

Examples:
  sceneforge add-audio --demo create-quote
  sceneforge add-audio --demo create-quote --output-size 1080p
  sceneforge add-audio --all
`);
}

// Build scale filter string for chaining in filter_complex
function buildScaleFilter(outputDimensions) {
  if (!outputDimensions) return "";
  const { width, height } = outputDimensions;
  if (width === -1 || height === -1) {
    return `scale=${width}:${height}`;
  }
  return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`;
}

async function addAudioToStep(videoPath, audioPath, outputPath, padding, nextVideoPath, outputDimensions = null) {
  const videoDuration = await getMediaDuration(videoPath);
  const audioDuration = await getMediaDuration(audioPath);
  const targetDuration = audioDuration + padding;
  // Use lossless encoding for intermediate files to prevent generation loss
  const encodingArgs = getIntermediateEncodingArgs({ includeAudio: true });
  const scaleFilter = buildScaleFilter(outputDimensions);

  if (targetDuration <= videoDuration) {
    const padDuration = Math.max(0, videoDuration - audioDuration);
    // For this case, use -vf for scaling since filter_complex only handles audio
    const videoFilterArgs = scaleFilter ? ["-vf", scaleFilter] : [];
    await runFFmpeg([
      "-y",
      "-i",
      videoPath,
      "-i",
      audioPath,
      "-filter_complex",
      `[1:a]apad=pad_dur=${padDuration}[a]`,
      ...videoFilterArgs,
      "-map",
      "0:v",
      "-map",
      "[a]",
      "-t",
      String(videoDuration),
      ...encodingArgs,
      outputPath,
    ]);
    return;
  }

  const extensionNeeded = targetDuration - videoDuration;

  if (nextVideoPath) {
    const stillDuration = 0.04;
    // Chain scale filter into the filter_complex output
    const scaleChain = scaleFilter ? `,${scaleFilter}` : "";
    const filterGraph =
      `[1:v]trim=start=0:end=${stillDuration},setpts=PTS-STARTPTS,` +
      `tpad=stop_mode=clone:stop_duration=${extensionNeeded},` +
      `trim=duration=${extensionNeeded}[next_still];` +
      `[0:v][next_still]concat=n=2:v=1:a=0${scaleChain}[outv]`;

    await runFFmpeg([
      "-y",
      "-i",
      videoPath,
      "-i",
      nextVideoPath,
      "-i",
      audioPath,
      "-filter_complex",
      filterGraph,
      "-map",
      "[outv]",
      "-map",
      "2:a",
      ...encodingArgs,
      "-t",
      String(targetDuration),
      outputPath,
    ]);
    return;
  }

  // Chain scale filter into the filter_complex output
  const scaleChain = scaleFilter ? `,${scaleFilter}` : "";
  await runFFmpeg([
    "-y",
    "-i",
    videoPath,
    "-i",
    audioPath,
    "-filter_complex",
    `[0:v]tpad=stop_mode=clone:stop_duration=${extensionNeeded}${scaleChain}[v]`,
    "-map",
    "[v]",
    "-map",
    "1:a",
    ...encodingArgs,
    "-t",
    String(targetDuration),
    outputPath,
  ]);
}

async function processDemo(demoName, paths, padding, outputDimensions = null) {
  console.log(`\n[audio] Processing: ${demoName}`);
  console.log("[audio] Using lossless encoding for intermediate files");
  logOutputDimensions(outputDimensions, "[audio]");

  const stepsManifestPath = path.join(paths.videosDir, demoName, "steps-manifest.json");
  let stepsManifest;

  try {
    stepsManifest = await readJson(stepsManifestPath);
  } catch {
    console.error(`[audio] ✗ Steps manifest not found: ${stepsManifestPath}`);
    console.error("[audio]   Run sceneforge split first");
    return;
  }

  const audioManifestPath = path.join(paths.audioDir, demoName, "manifest.json");
  let audioManifest;

  try {
    audioManifest = await readJson(audioManifestPath);
  } catch {
    console.error(`[audio] ✗ Audio manifest not found: ${audioManifestPath}`);
    console.error("[audio]   Run sceneforge voiceover first");
    return;
  }

  console.log(`[audio] Steps: ${stepsManifest.steps.length}`);
  console.log(`[audio] Audio segments: ${audioManifest.segments.length}`);

  await fs.mkdir(paths.tempDir, { recursive: true });

  const outputFiles = [];

  for (let index = 0; index < stepsManifest.steps.length; index += 1) {
    const step = stepsManifest.steps[index];
    const nextStep = stepsManifest.steps[index + 1];
    const paddedIndex = String(step.stepIndex + 1).padStart(2, "0");
    const audioSegment = audioManifest.segments.find((segment) => segment.stepId === step.stepId);

    if (!audioSegment) {
      console.log(`[audio]   ${paddedIndex}. ${step.stepId}: ⚠ No audio found, skipping`);
      continue;
    }

    try {
      await fs.access(step.videoFile);
    } catch {
      console.error(`[audio]   ${paddedIndex}. ${step.stepId}: ✗ Video not found`);
      continue;
    }

    const safeStepId = step.safeStepId
      ? sanitizeFileSegment(step.safeStepId, `step-${step.stepIndex + 1}`)
      : sanitizeFileSegment(step.stepId, `step-${step.stepIndex + 1}`);
    const outputPath = path.join(
      paths.videosDir,
      demoName,
      `step_${paddedIndex}_${safeStepId}_with_audio.mp4`
    );

    const videoDuration = await getMediaDuration(step.videoFile);
    const audioDuration = await getMediaDuration(audioSegment.audioFile);
    const needsExtension = audioDuration + padding > videoDuration;
    const needsAudioPad = !needsExtension && audioDuration < videoDuration;
    let nextVideoPath = null;
    if (needsExtension && nextStep?.videoFile) {
      try {
        await fs.access(nextStep.videoFile);
        nextVideoPath = nextStep.videoFile;
      } catch {
        nextVideoPath = null;
      }
    }
    const extensionDuration = Math.max(0, audioDuration + padding - videoDuration);

    console.log(
      `[audio]   ${paddedIndex}. ${step.stepId}: ` +
        `video ${videoDuration.toFixed(2)}s, audio ${audioDuration.toFixed(2)}s` +
        (needsExtension
          ? nextVideoPath
            ? ` → hold next step first frame for ${extensionDuration.toFixed(2)}s`
            : ` → freeze last frame for ${extensionDuration.toFixed(2)}s`
          : needsAudioPad
            ? ` → pad audio with silence for ${(videoDuration - audioDuration).toFixed(2)}s`
            : "")
    );

    try {
      await addAudioToStep(step.videoFile, audioSegment.audioFile, outputPath, padding, nextVideoPath, outputDimensions);
      outputFiles.push(outputPath);
    } catch (error) {
      console.error(`[audio]   ${paddedIndex}. ${step.stepId}: ✗ Failed to process`);
      console.error(error);
    }
  }

  const updatedManifest = {
    ...stepsManifest,
    stepsWithAudio: stepsManifest.steps.map((step) => {
      const paddedIndex = String(step.stepIndex + 1).padStart(2, "0");
      const safeStepId = step.safeStepId
        ? sanitizeFileSegment(step.safeStepId, `step-${step.stepIndex + 1}`)
        : sanitizeFileSegment(step.stepId, `step-${step.stepIndex + 1}`);
      return {
        ...step,
        safeStepId,
        videoFileWithAudio: path.join(
          paths.videosDir,
          demoName,
          `step_${paddedIndex}_${safeStepId}_with_audio.mp4`
        ),
      };
    }),
  };

  await fs.writeFile(stepsManifestPath, JSON.stringify(updatedManifest, null, 2));

  console.log(`\n[audio] ✓ Processed ${outputFiles.length} steps with audio`);
  console.log(`[audio]   Output: ${path.join(paths.videosDir, demoName)}`);
}

async function processAll(paths, padding, outputDimensions = null) {
  console.log("\n[audio] Processing all demos...\n");

  try {
    const videoDirs = await fs.readdir(paths.videosDir);
    const demosToProcess = [];

    for (const dir of videoDirs) {
      const stepsManifestPath = path.join(paths.videosDir, dir, "steps-manifest.json");
      const audioManifestPath = path.join(paths.audioDir, dir, "manifest.json");

      try {
        await fs.access(stepsManifestPath);
        await fs.access(audioManifestPath);
        demosToProcess.push(dir);
      } catch {
        // Skip demos missing manifests
      }
    }

    if (demosToProcess.length === 0) {
      console.log("[audio] No demos ready for audio addition");
      console.log("[audio] Make sure you've run:");
      console.log("[audio]   1. sceneforge split");
      console.log("[audio]   2. sceneforge voiceover");
      return;
    }

    console.log(`[audio] Found ${demosToProcess.length} demo(s) to process\n`);

    for (const demo of demosToProcess) {
      await processDemo(demo, paths, padding, outputDimensions);
    }

    await fs.rm(paths.tempDir, { recursive: true, force: true });

    console.log("\n[audio] All demos processed!");
  } catch (error) {
    console.error("[audio] Error:", error);
  }
}

export async function runAddAudioCommand(argv) {
  const args = argv ?? process.argv.slice(2);
  const help = hasFlag(args, "--help") || hasFlag(args, "-h");
  const demo = getFlagValue(args, "--demo");
  const all = hasFlag(args, "--all");
  const padding = parseFloat(getFlagValue(args, "--padding") ?? "0.3");
  const root = getFlagValue(args, "--root");
  const outputDir = getFlagValue(args, "--output-dir");

  if (help) {
    printHelp();
    return;
  }

  const hasFFmpeg = await checkFFmpeg();
  if (!hasFFmpeg) {
    console.error("[error] FFmpeg is not installed");
    process.exit(1);
  }

  const rootDir = resolveRoot(root);
  const paths = await getOutputPaths(rootDir, outputDir);
  const outputDimensions = parseOutputDimensions(args, getFlagValue);

  if (demo) {
    await processDemo(demo, paths, padding, outputDimensions);
    await fs.rm(paths.tempDir, { recursive: true, force: true });
    return;
  }

  if (all) {
    await processAll(paths, padding, outputDimensions);
    return;
  }

  printHelp();
}

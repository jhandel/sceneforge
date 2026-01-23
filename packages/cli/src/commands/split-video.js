import * as fs from "fs/promises";
import * as path from "path";
import { checkFFmpeg, getMediaDuration, runFFmpeg } from "../utils/media.js";
import { getOutputPaths, readJson, resolveRoot } from "../utils/paths.js";
import { getFlagValue, hasFlag } from "../utils/args.js";
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
Split recorded demo video into per-step clips

Uses lossless encoding for intermediate files to preserve quality.
Final compression is applied only at the concat step.

Usage:
  sceneforge split [options]

Options:
  --demo <name>         Process a specific demo by name
  --all                 Process all demos with script JSON files
  --root <path>         Project root (defaults to cwd)
  --output-dir <path>   Output directory (defaults to e2e/output or output)
  --help, -h            Show this help message
${getOutputDimensionsHelpText()}

Examples:
  sceneforge split --demo create-quote
  sceneforge split --demo create-quote --output-size 1080p
  sceneforge split --all
`);
}

async function findVideoFile(demoName, videosDir, testResultsDir) {
  const possiblePaths = [
    path.join(videosDir, `${demoName}.webm`),
    path.join(videosDir, `${demoName}-flow.webm`),
  ];

  try {
    const dirs = await fs.readdir(testResultsDir);
    for (const dir of dirs) {
      if (dir.includes(demoName) || dir.includes(demoName.replace(/-/g, ""))) {
        possiblePaths.push(path.join(testResultsDir, dir, "video.webm"));
      }
    }
  } catch {
    // Ignore missing test-results directory
  }

  for (const videoPath of possiblePaths) {
    try {
      await fs.access(videoPath);
      return videoPath;
    } catch {
      // Continue
    }
  }

  return null;
}

async function splitDemo(demoName, paths, outputDimensions = null) {
  console.log(`\n[split] Processing: ${demoName}`);
  console.log("[split] Using lossless encoding for intermediate files");
  logOutputDimensions(outputDimensions, "[split]");

  const scriptPath = path.join(paths.scriptsDir, `${demoName}.json`);
  let script;

  try {
    script = await readJson(scriptPath);
  } catch {
    console.error(`[split] ✗ Script not found: ${scriptPath}`);
    console.error(`[split]   Generate scripts before splitting video`);
    return;
  }

  if (!script.stepBoundaries || script.stepBoundaries.length === 0) {
    console.error("[split] ✗ No step boundaries found in script");
    console.error("[split]   Regenerate scripts with step boundaries");
    return;
  }

  const videoPath = await findVideoFile(demoName, paths.videosDir, paths.testResultsDir);
  if (!videoPath) {
    console.error(`[split] ✗ Video not found for: ${demoName}`);
    return;
  }

  console.log(`[split] Video: ${videoPath}`);
  console.log(`[split] Steps: ${script.stepBoundaries.length}`);

  const videoDurationSec = await getMediaDuration(videoPath);
  const videoDurationMs = Math.round(videoDurationSec * 1000);

  const stepClipsDir = path.join(paths.videosDir, demoName);
  await fs.mkdir(stepClipsDir, { recursive: true });

  for (const boundary of script.stepBoundaries) {
    const isFirstStep = boundary.stepIndex === 0;
    const startMs = isFirstStep ? 0 : boundary.videoStartMs;
    if (startMs >= videoDurationMs) {
      console.warn(`[split]   Skipping ${boundary.stepId}: start beyond video duration`);
      continue;
    }
    const clampedEndMs = Math.min(boundary.videoEndMs, videoDurationMs);
    if (clampedEndMs <= startMs) {
      console.warn(`[split]   Skipping ${boundary.stepId}: invalid duration after clamp`);
      continue;
    }
    const startSec = startMs / 1000;
    const duration = (clampedEndMs - startMs) / 1000;
    const paddedIndex = String(boundary.stepIndex + 1).padStart(2, "0");
    const safeStepId = sanitizeFileSegment(
      boundary.stepId,
      `step-${boundary.stepIndex + 1}`
    );
    const outputFileName = `step_${paddedIndex}_${safeStepId}.mp4`;
    const outputPath = path.join(stepClipsDir, outputFileName);

    console.log(
      `[split]   ${paddedIndex}. ${boundary.stepId}: ${startSec.toFixed(2)}s - ${(startSec + duration).toFixed(2)}s (${duration.toFixed(2)}s)`
    );

    try {
      // Use lossless encoding for intermediate files to prevent generation loss
      const encodingArgs = getIntermediateEncodingArgs({ includeAudio: false });
      const scaleArgs = getScaleFilterArgs(outputDimensions);
      await runFFmpeg([
        "-y",
        "-i",
        videoPath,
        "-ss",
        String(startSec),
        "-t",
        String(duration),
        ...scaleArgs,
        ...encodingArgs,
        "-an",
        outputPath,
      ]);
    } catch (error) {
      console.error(`[split] ✗ Failed to extract step ${boundary.stepId}:`, error);
      throw error;
    }
  }

  const manifestPath = path.join(stepClipsDir, "steps-manifest.json");
  const manifest = {
    demoName: script.demoName,
    title: script.title,
    generatedAt: new Date().toISOString(),
    sourceVideo: videoPath,
    sourceVideoDurationMs: videoDurationMs,
    steps: script.stepBoundaries.map((boundary) => {
      const paddedIndex = String(boundary.stepIndex + 1).padStart(2, "0");
      const isFirstStep = boundary.stepIndex === 0;
      const splitStartMs = isFirstStep ? 0 : boundary.videoStartMs;
      const clampedEndMs = Math.min(boundary.videoEndMs, videoDurationMs);
      const safeStepId = sanitizeFileSegment(
        boundary.stepId,
        `step-${boundary.stepIndex + 1}`
      );
      return {
        stepId: boundary.stepId,
        safeStepId,
        stepIndex: boundary.stepIndex,
        videoFile: path.join(stepClipsDir, `step_${paddedIndex}_${safeStepId}.mp4`),
        splitStartMs,
        originalStartMs: boundary.videoStartMs,
        originalEndMs: boundary.videoEndMs,
        durationMs: Math.max(0, clampedEndMs - splitStartMs),
      };
    }),
  };

  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`\n[split] ✓ Split into ${script.stepBoundaries.length} clips`);
  console.log(`[split]   Output: ${stepClipsDir}`);
  console.log(`[split]   Manifest: ${manifestPath}`);
}

async function splitAll(paths, outputDimensions = null) {
  console.log("\n[split] Processing all demos...\n");

  try {
    const files = await fs.readdir(paths.scriptsDir);
    const scriptFiles = files.filter(
      (file) => file.endsWith(".json") && !file.endsWith(".voice.json") && !file.endsWith("manifest.json")
    );

    if (scriptFiles.length === 0) {
      console.log("[split] No script files found");
      return;
    }

    console.log(`[split] Found ${scriptFiles.length} demo(s)\n`);

    for (const file of scriptFiles) {
      const demoName = path.basename(file, ".json");
      await splitDemo(demoName, paths, outputDimensions);
    }

    console.log("\n[split] All demos processed!");
  } catch (error) {
    console.error("[split] Error:", error);
  }
}

export async function runSplitVideoCommand(argv) {
  const args = argv ?? process.argv.slice(2);
  const help = hasFlag(args, "--help") || hasFlag(args, "-h");
  const demo = getFlagValue(args, "--demo");
  const all = hasFlag(args, "--all");
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
    await splitDemo(demo, paths, outputDimensions);
    return;
  }

  if (all) {
    await splitAll(paths, outputDimensions);
    return;
  }

  printHelp();
}

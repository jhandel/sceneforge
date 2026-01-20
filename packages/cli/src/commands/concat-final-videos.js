import * as fs from "fs/promises";
import * as path from "path";
import { checkFFmpeg, execAsync } from "../utils/media.js";
import { getFlagValue, hasFlag } from "../utils/args.js";
import { getOutputPaths, resolveRoot } from "../utils/paths.js";

function printHelp() {
  console.log(`
Concatenate per-step video clips into final demo videos

Usage:
  demo-yaml concat [options]

Options:
  --demo <name>         Process a specific demo by name
  --all                 Process all demos with step clips
  --root <path>         Project root (defaults to cwd)
  --output-dir <path>   Output directory (defaults to e2e/output or output)
  --help, -h            Show this help message

Examples:
  demo-yaml concat --demo create-quote
  demo-yaml concat --all
`);
}

async function concatDemo(demoName, paths) {
  console.log(`\n[concat] Processing: ${demoName}\n`);

  const demoDir = path.join(paths.videosDir, demoName);

  try {
    const files = await fs.readdir(demoDir);
    const stepFiles = files.filter((file) => file.endsWith("_with_audio.mp4")).sort();

    if (stepFiles.length === 0) {
      console.error(`[concat] ✗ No step clips with audio found in ${demoDir}`);
      console.error("[concat]   Run demo-yaml add-audio first");
      return;
    }

    console.log(`[concat] Found ${stepFiles.length} step clips with audio`);

    await fs.mkdir(paths.finalDir, { recursive: true });

    const concatListPath = path.join(demoDir, "concat-list.txt");
    const concatContent = stepFiles
      .map((file) => `file '${path.join(demoDir, file)}'`)
      .join("\n");
    await fs.writeFile(concatListPath, concatContent);

    const outputPath = path.join(paths.finalDir, `${demoName}.mp4`);

    console.log("[concat] Concatenating clips...");

    const inputArgs = stepFiles
      .map((file) => `-i "${path.join(demoDir, file)}"`)
      .join(" ");
    const concatInputs = stepFiles
      .map((_, index) => `[${index}:v:0][${index}:a:0]`)
      .join("");
    const filterGraph = `${concatInputs}concat=n=${stepFiles.length}:v=1:a=1[outv][outa]`;

    await execAsync(
      `ffmpeg -y ${inputArgs} ` +
        `-filter_complex "${filterGraph}" ` +
        `-map "[outv]" -map "[outa]" ` +
        `-c:v libx264 -preset fast -c:a aac -b:a 192k -movflags +faststart "${outputPath}"`,
      { maxBuffer: 50 * 1024 * 1024 }
    );

    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`
    );
    const duration = parseFloat(stdout.trim());

    await fs.rm(concatListPath, { force: true });

    console.log(`[concat] ✓ Created: ${outputPath}`);
    console.log(`[concat]   Duration: ${duration.toFixed(2)}s`);
  } catch (error) {
    console.error(`[concat] Error processing ${demoName}:`, error);
    throw error;
  }
}

async function concatAll(paths) {
  console.log("\n[concat] Processing all demos...\n");

  try {
    const demoDirs = await fs.readdir(paths.videosDir);
    const demosToProcess = [];

    for (const dir of demoDirs) {
      const demoPath = path.join(paths.videosDir, dir);
      const stat = await fs.stat(demoPath);

      if (!stat.isDirectory()) continue;

      const files = await fs.readdir(demoPath);
      const hasAudioClips = files.some((file) => file.endsWith("_with_audio.mp4"));

      if (hasAudioClips) {
        demosToProcess.push(dir);
      }
    }

    if (demosToProcess.length === 0) {
      console.log("[concat] No demos ready for concatenation");
      console.log("[concat] Make sure you've run demo-yaml add-audio");
      return;
    }

    console.log(`[concat] Found ${demosToProcess.length} demo(s) to process\n`);

    for (const demo of demosToProcess) {
      await concatDemo(demo, paths);
    }

    console.log("\n[concat] All demos processed!");
    console.log(`[concat] Output: ${paths.finalDir}`);
  } catch (error) {
    console.error("[concat] Error:", error);
  }
}

export async function runConcatCommand(argv) {
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

  if (demo) {
    await concatDemo(demo, paths);
    return;
  }

  if (all) {
    await concatAll(paths);
    return;
  }

  printHelp();
}

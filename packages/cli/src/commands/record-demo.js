import * as fs from "fs/promises";
import * as path from "path";
import { chromium } from "@playwright/test";
import {
  loadDemoDefinition,
  runDemo,
} from "@jhandel/sceneforge-playwright";
import { config as loadEnv } from "dotenv";
import { getFlagValue, hasFlag } from "../utils/args.js";
import {
  ensureDir,
  getOutputPaths,
  resolveEnvFile,
  resolveRoot,
  toAbsolute,
} from "../utils/paths.js";
import { getMediaDuration } from "../utils/media.js";

function printHelp() {
  console.log(`
Run a YAML demo definition with Playwright and generate scripts

Usage:
  sceneforge record [options]

Options:
  --definition <path>     Path to the YAML demo definition
  --demo <name>           Demo name (resolved in --definitions-dir)
  --definitions-dir <p>   Directory for demo YAML files (default: examples)
  --base-url <url>        Base URL for the demo (required)
  --start-path <path>     Optional path/URL to open before running actions
  --asset-root <path>     Base directory for relative upload files
  --env-file <path>       Env file for secrets (defaults to .env if present)
  --locale <locale>       Locale for requests (default: en-US)
  --root <path>           Project root (defaults to cwd)
  --output-dir <path>     Output directory (defaults to output or e2e/output)
  --storage-state <path>  Playwright storage state JSON
  --viewport <WxH>        Viewport size, e.g. 1440x900 (default)
  --width <px>            Viewport width (overrides --viewport)
  --height <px>           Viewport height (overrides --viewport)
  --headed                Run browser headed
  --slowmo <ms>           Slow down Playwright actions
  --no-video              Skip video recording
  --help, -h              Show this help message

Examples:
  sceneforge record --definition demo-definitions/create-quote.yaml --base-url http://localhost:5173
  sceneforge record --demo create-quote --definitions-dir examples --base-url http://localhost:5173
`);
}

function parseViewport(args) {
  const viewportValue = getFlagValue(args, "--viewport");
  const widthValue = getFlagValue(args, "--width");
  const heightValue = getFlagValue(args, "--height");

  const defaultViewport = { width: 1440, height: 900 };

  if (widthValue || heightValue) {
    const width = widthValue ? Number(widthValue) : defaultViewport.width;
    const height = heightValue ? Number(heightValue) : defaultViewport.height;
    return { width, height };
  }

  if (!viewportValue) {
    return defaultViewport;
  }

  const match = viewportValue.match(/^(\d+)x(\d+)$/i);
  if (!match) {
    return defaultViewport;
  }

  return { width: Number(match[1]), height: Number(match[2]) };
}

function resolveStartUrl(startPath, baseUrl) {
  if (!startPath) return null;
  const interpolated = startPath
    .replace("{baseURL}", baseUrl);

  if (interpolated.startsWith("http://") || interpolated.startsWith("https://")) {
    return interpolated;
  }

  if (interpolated.startsWith("/")) {
    return `${baseUrl}${interpolated}`;
  }

  return `${baseUrl}/${interpolated}`;
}

async function alignScriptToVideo(scriptPath, videoPath, recordingStartTimeMs) {
  if (!scriptPath || !videoPath) {
    return;
  }

  try {
    const [scriptContent, videoDurationSec] = await Promise.all([
      fs.readFile(scriptPath, "utf-8"),
      getMediaDuration(videoPath),
    ]);
    const script = JSON.parse(scriptContent);
    const videoDurationMs = Math.round(videoDurationSec * 1000);
    const scriptDurationMs = Number(script.totalDurationMs ?? 0);
    const safeScriptDurationMs = Number.isFinite(scriptDurationMs) ? scriptDurationMs : 0;
    const alignmentOffsetMs = Math.max(0, safeScriptDurationMs - videoDurationMs);

    const clampTime = (value) => {
      const adjusted = Number(value ?? 0) - alignmentOffsetMs;
      return Math.max(0, Math.round(adjusted));
    };

    const alignedSegments = Array.isArray(script.segments)
      ? script.segments.map((segment) => ({
          ...segment,
          startTimeMs: clampTime(segment.startTimeMs),
          endTimeMs: clampTime(segment.endTimeMs),
        }))
      : script.segments;

    const alignedBoundaries = Array.isArray(script.stepBoundaries)
      ? script.stepBoundaries.map((boundary) => ({
          ...boundary,
          videoStartMs: clampTime(boundary.videoStartMs),
          videoEndMs: clampTime(boundary.videoEndMs),
        }))
      : script.stepBoundaries;

    const updated = {
      ...script,
      totalDurationMs: videoDurationMs,
      segments: alignedSegments,
      stepBoundaries: alignedBoundaries,
      videoMetadata: {
        videoPath,
        durationMs: videoDurationMs,
        alignmentOffsetMs,
        recordingStartTimeMs,
        alignedAt: new Date().toISOString(),
      },
    };

    await fs.writeFile(scriptPath, JSON.stringify(updated, null, 2));
  } catch (error) {
    console.warn("[record] Failed to align script timings:", error);
  }
}

async function resolveDefinitionPath(rootDir, demo, definitionsDir) {
  const dir = toAbsolute(rootDir, definitionsDir);
  const yamlPath = path.join(dir, `${demo}.yaml`);
  const ymlPath = path.join(dir, `${demo}.yml`);

  try {
    await fs.access(yamlPath);
    return yamlPath;
  } catch {
    // continue
  }

  try {
    await fs.access(ymlPath);
    return ymlPath;
  } catch {
    return null;
  }
}

async function moveVideo(sourcePath, targetPath) {
  try {
    await fs.rename(sourcePath, targetPath);
  } catch {
    await fs.copyFile(sourcePath, targetPath);
    await fs.rm(sourcePath, { force: true });
  }
}

export async function runRecordDemoCommand(argv) {
  const args = argv ?? process.argv.slice(2);
  const help = hasFlag(args, "--help") || hasFlag(args, "-h");

  if (help) {
    printHelp();
    return;
  }

  const root = getFlagValue(args, "--root");
  const outputDirOverride = getFlagValue(args, "--output-dir");
  const baseUrl = getFlagValue(args, "--base-url");
  const definitionArg = getFlagValue(args, "--definition");
  const demo = getFlagValue(args, "--demo");
  const definitionsDir = getFlagValue(args, "--definitions-dir") ?? "examples";
  const storageState = getFlagValue(args, "--storage-state");
  const startPath = getFlagValue(args, "--start-path") || getFlagValue(args, "--start-url");
  const assetRoot = getFlagValue(args, "--asset-root");
  const envFile = getFlagValue(args, "--env-file");
  const localeFlag = getFlagValue(args, "--locale");
  const headed = hasFlag(args, "--headed");
  const slowMo = getFlagValue(args, "--slowmo");
  const noVideo = hasFlag(args, "--no-video");

  if (!baseUrl) {
    console.error("[error] --base-url is required");
    printHelp();
    process.exit(1);
  }

  const rootDir = resolveRoot(root);
  const outputPaths = await getOutputPaths(rootDir, outputDirOverride);
  const resolvedEnvFile = await resolveEnvFile(rootDir, envFile);
  if (resolvedEnvFile) {
    loadEnv({ path: resolvedEnvFile });
  }
  const locale = localeFlag ?? process.env.DEMO_LOCALE ?? "en-US";

  const definitionPath = definitionArg
    ? toAbsolute(rootDir, definitionArg)
    : demo
      ? await resolveDefinitionPath(rootDir, demo, definitionsDir)
      : null;

  if (!definitionPath) {
    console.error("[error] Demo definition not found. Provide --definition or --demo.");
    printHelp();
    process.exit(1);
  }

  const definition = await loadDemoDefinition(definitionPath, {
    resolveSecrets: (key) => process.env[key],
  });

  await ensureDir(outputPaths.outputDir);
  await ensureDir(outputPaths.videosDir);

  const viewport = parseViewport(args);

  const recordDir = path.join(outputPaths.videosDir, ".recordings", definition.name);
  if (!noVideo) {
    await ensureDir(recordDir);
  }

  const browser = await chromium.launch({
    headless: !headed,
    slowMo: slowMo ? Number(slowMo) : undefined,
  });

  const context = await browser.newContext({
    viewport,
    recordVideo: noVideo ? undefined : { dir: recordDir, size: viewport },
    storageState: storageState ? toAbsolute(rootDir, storageState) : undefined,
    locale: locale || undefined,
    extraHTTPHeaders: locale
      ? {
          "Accept-Language": `${locale},en;q=0.9`,
        }
      : undefined,
  });

  const page = await context.newPage();
  const video = page.video();
  const videoRecordingStartTime = Date.now();
  const startUrl = resolveStartUrl(startPath, baseUrl);

  if (startUrl) {
    await page.goto(startUrl, { waitUntil: "networkidle" });
  }
  const result = await runDemo(
    definition,
    {
      page,
      baseURL: baseUrl,
      outputDir: outputPaths.outputDir,
      assetBaseDir: assetRoot ? toAbsolute(rootDir, assetRoot) : undefined,
      videoRecordingStartTime,
    },
    {
      generateScripts: true,
      scriptOutputDir: path.join(outputPaths.outputDir, "scripts"),
    }
  );

  await context.close();
  await browser.close();

  if (video) {
    const recordedPath = await video.path();
    const finalVideoPath = path.join(outputPaths.videosDir, `${definition.name}.webm`);
    await moveVideo(recordedPath, finalVideoPath);
    console.log(`[record] Video saved: ${finalVideoPath}`);
    if (result.scriptPath) {
      await alignScriptToVideo(result.scriptPath, finalVideoPath, videoRecordingStartTime);
    }
  }

  if (result.success) {
    console.log(`[record] ✓ Completed ${definition.name}`);
    if (result.scriptPath) {
      console.log(`[record] Script: ${result.scriptPath}`);
    }
  } else {
    console.error(`[record] ✗ Failed: ${result.error?.message ?? "Unknown error"}`);
    process.exit(1);
  }
}

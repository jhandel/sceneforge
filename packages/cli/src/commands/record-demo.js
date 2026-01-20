import * as fs from "fs/promises";
import * as path from "path";
import { chromium } from "@playwright/test";
import {
  loadDemoDefinition,
  runDemo,
} from "@demo-tools/playwright";
import { getFlagValue, hasFlag } from "../utils/args.js";
import {
  ensureDir,
  getOutputPaths,
  resolveRoot,
  toAbsolute,
} from "../utils/paths.js";

function printHelp() {
  console.log(`
Run a YAML demo definition with Playwright and generate scripts

Usage:
  demo-yaml record [options]

Options:
  --definition <path>     Path to the YAML demo definition
  --demo <name>           Demo name (resolved in --definitions-dir)
  --definitions-dir <p>   Directory for demo YAML files (default: examples)
  --base-url <url>        Base URL for the demo (required)
  --org-slug <slug>       Org slug for URL templates (required)
  --start-path <path>     Optional path/URL to open before running actions
  --asset-root <path>     Base directory for relative upload files
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
  demo-yaml record --definition demo-definitions/create-quote.yaml --base-url http://localhost:5173 --org-slug acme
  demo-yaml record --demo create-quote --definitions-dir examples --base-url http://localhost:5173 --org-slug acme
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

function resolveStartUrl(startPath, baseUrl, orgSlug) {
  if (!startPath) return null;
  const interpolated = startPath
    .replace("{orgSlug}", orgSlug)
    .replace("{baseURL}", baseUrl);

  if (interpolated.startsWith("http://") || interpolated.startsWith("https://")) {
    return interpolated;
  }

  if (interpolated.startsWith("/")) {
    return `${baseUrl}${interpolated}`;
  }

  return `${baseUrl}/${interpolated}`;
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
  const orgSlug = getFlagValue(args, "--org-slug");
  const definitionArg = getFlagValue(args, "--definition");
  const demo = getFlagValue(args, "--demo");
  const definitionsDir = getFlagValue(args, "--definitions-dir") ?? "examples";
  const storageState = getFlagValue(args, "--storage-state");
  const startPath = getFlagValue(args, "--start-path") || getFlagValue(args, "--start-url");
  const assetRoot = getFlagValue(args, "--asset-root");
  const headed = hasFlag(args, "--headed");
  const slowMo = getFlagValue(args, "--slowmo");
  const noVideo = hasFlag(args, "--no-video");

  if (!baseUrl || !orgSlug) {
    console.error("[error] --base-url and --org-slug are required");
    printHelp();
    process.exit(1);
  }

  const rootDir = resolveRoot(root);
  const outputPaths = await getOutputPaths(rootDir, outputDirOverride);

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

  const definition = await loadDemoDefinition(definitionPath);

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
  });

  const page = await context.newPage();
  const video = page.video();
  const videoRecordingStartTime = Date.now();
  const startUrl = resolveStartUrl(startPath, baseUrl, orgSlug);

  if (startUrl) {
    await page.goto(startUrl, { waitUntil: "networkidle" });
  }
  const result = await runDemo(
    definition,
    {
      page,
      baseURL: baseUrl,
      orgSlug,
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

import * as fs from "fs/promises";
import * as path from "path";
import { chromium } from "@playwright/test";
import { loadDemoDefinition, runDemo } from "@jhandel/sceneforge-playwright";
import { config as loadEnv } from "dotenv";
import { getFlagValue, hasFlag } from "../utils/args.js";
import {
  ensureDir,
  getOutputPaths,
  resolveEnvFile,
  resolveRoot,
  toAbsolute,
} from "../utils/paths.js";

function printHelp() {
  console.log(`
Run a setup YAML to capture and cache login storage state

Usage:
  sceneforge setup [options]

Options:
  --definition <path>     Path to the YAML setup definition
  --demo <name>           Demo name (resolved in --definitions-dir)
  --definitions-dir <p>   Directory for YAML files (default: examples)
  --base-url <url>        Base URL for the app (required)
  --start-path <path>     Optional path/URL to open before running actions
  --asset-root <path>     Base directory for relative upload files
  --root <path>           Project root (defaults to cwd)
  --output-dir <path>     Output directory (defaults to output or e2e/output)
  --storage-state <path>  Where to save storage state JSON (defaults to output/storage/<name>.json)
  --env-file <path>       Env file for secrets (defaults to .env if present)
  --locale <locale>       Locale for requests (default: en-US)
  --viewport <WxH>        Viewport size, e.g. 1440x900 (default)
  --width <px>            Viewport width (overrides --viewport)
  --height <px>           Viewport height (overrides --viewport)
  --headed                Run browser headed (recommended for login)
  --slowmo <ms>           Slow down Playwright actions
  --help, -h              Show this help message

Examples:
  sceneforge setup --definition examples/setup-login.yaml --base-url http://localhost:5173 --start-path /app --headed
  sceneforge setup --demo setup-login --definitions-dir examples --base-url http://localhost:5173 --storage-state output/storage/login.json
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
  const interpolated = startPath.replace("{baseURL}", baseUrl);

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

export async function runSetupCommand(argv) {
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
  const startPath = getFlagValue(args, "--start-path") || getFlagValue(args, "--start-url");
  const storageStateArg = getFlagValue(args, "--storage-state");
  const envFile = getFlagValue(args, "--env-file");
  const localeFlag = getFlagValue(args, "--locale");
  const assetRoot = getFlagValue(args, "--asset-root");
  const headed = hasFlag(args, "--headed");
  const slowMo = getFlagValue(args, "--slowmo");

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
    console.error("[error] Setup definition not found. Provide --definition or --demo.");
    printHelp();
    process.exit(1);
  }

  const definition = await loadDemoDefinition(definitionPath, {
    resolveSecrets: (key) => process.env[key],
  });

  const storageStatePath = storageStateArg
    ? toAbsolute(rootDir, storageStateArg)
    : path.join(outputPaths.outputDir, "storage", `${definition.name}.json`);

  await ensureDir(path.dirname(storageStatePath));
  await ensureDir(outputPaths.outputDir);

  const viewport = parseViewport(args);

  const browser = await chromium.launch({
    headless: !headed,
    slowMo: slowMo ? Number(slowMo) : undefined,
  });

  let context;
  try {
    context = await browser.newContext({
      viewport,
      locale: locale || undefined,
      extraHTTPHeaders: locale
        ? {
            "Accept-Language": `${locale},en;q=0.9`,
          }
        : undefined,
    });
    const page = await context.newPage();
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
      },
      {
        generateScripts: false,
      }
    );

    if (result.success) {
      await context.storageState({ path: storageStatePath });
      console.log(`[setup] ✓ Saved storage state: ${storageStatePath}`);
    } else {
      console.error(`[setup] ✗ Failed: ${result.error?.message ?? "Unknown error"}`);
      process.exit(1);
    }
  } finally {
    if (context) {
      await context.close();
    }
    await browser.close();
  }
}

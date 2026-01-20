import * as fs from "fs/promises";
import * as path from "path";

export function resolveRoot(explicitRoot) {
  return explicitRoot ? path.resolve(explicitRoot) : process.cwd();
}

async function pathExists(candidatePath) {
  try {
    await fs.access(candidatePath);
    return true;
  } catch {
    return false;
  }
}

export async function resolveOutputDir(rootDir, explicitOutputDir) {
  if (explicitOutputDir) {
    return path.resolve(rootDir, explicitOutputDir);
  }

  const outputDir = path.join(rootDir, "output");
  if (await pathExists(outputDir)) {
    return outputDir;
  }

  const e2eOutputDir = path.join(rootDir, "e2e", "output");
  if (await pathExists(e2eOutputDir)) {
    return e2eOutputDir;
  }

  return outputDir;
}

export async function resolveEnvFile(rootDir, explicitEnvFile) {
  if (explicitEnvFile) {
    return path.resolve(rootDir, explicitEnvFile);
  }

  const rootEnvFile = path.join(rootDir, ".env");
  if (await pathExists(rootEnvFile)) {
    return rootEnvFile;
  }

  const demoEnvFile = path.join(rootDir, "demo-yaml-creator", ".env");
  if (await pathExists(demoEnvFile)) {
    return demoEnvFile;
  }

  const e2eEnvFile = path.join(rootDir, "e2e", ".env");
  if (await pathExists(e2eEnvFile)) {
    return e2eEnvFile;
  }

  return null;
}

export async function getOutputPaths(rootDir, explicitOutputDir) {
  const outputDir = await resolveOutputDir(rootDir, explicitOutputDir);

  return {
    outputDir,
    scriptsDir: path.join(outputDir, "scripts"),
    videosDir: path.join(outputDir, "videos"),
    audioDir: path.join(outputDir, "audio"),
    finalDir: path.join(outputDir, "final"),
    tempDir: path.join(outputDir, "temp"),
    testResultsDir: path.join(outputDir, "test-results"),
  };
}

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function readJson(filePath) {
  const content = await fs.readFile(filePath, "utf-8");
  return JSON.parse(content);
}

export function toAbsolute(rootDir, maybeRelative) {
  return path.isAbsolute(maybeRelative) ? maybeRelative : path.join(rootDir, maybeRelative);
}

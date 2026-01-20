/**
 * Demo runner for Playwright.
 * Executes demo definitions using Playwright for video recording.
 */

import { Page, expect } from "@playwright/test";
import * as fs from "fs/promises";
import * as path from "path";
import type {
  DemoDefinition,
  DemoStep,
  DemoAction,
  WaitCondition,
} from "@demo-tools/shared";
import {
  parseFromYAML,
  validateDemoDefinition,
  resolveTarget,
  resolvePath,
} from "@demo-tools/shared";
import {
  ScriptGenerator,
  createScriptGenerator,
} from "@demo-tools/generation";
import {
  injectCursorOverlay,
  removeCursorOverlay,
  demoClick,
  moveCursorTo,
} from "./cursor-overlay";

/**
 * Context passed to the demo runner.
 */
export interface DemoContext {
  page: Page;
  baseURL: string;
  orgSlug: string;
  outputDir: string;
  videoPath?: string;
  videoRecordingStartTime?: number;
  assetBaseDir?: string;
}

/**
 * Result of running a demo.
 */
export interface DemoResult {
  success: boolean;
  demoName: string;
  videoPath?: string;
  scriptPath?: string;
  error?: Error;
  duration: number;
}

export interface RunDemoOptions {
  generateScripts?: boolean;
  scriptOutputDir?: string;
}

/**
 * Step timing info for video splitting.
 */
export interface StepTiming {
  id: string;
  script: string;
  startTime: number;
  endTime?: number;
}

/**
 * Loads and parses a YAML demo definition file.
 */
export async function loadDemoDefinition(filePath: string): Promise<DemoDefinition> {
  const content = await fs.readFile(filePath, "utf-8");
  const definition = parseFromYAML(content);
  validateDemoDefinition(definition);
  return definition;
}

/**
 * Waits for org slug to be available after login/redirect.
 */
export async function waitForOrgSlug(page: Page): Promise<string> {
  await page.waitForFunction(
    () => {
      return (
        window.location.pathname.startsWith("/app/") &&
        window.location.pathname.split("/").length >= 3
      );
    },
    { timeout: 60000 }
  );

  const url = page.url();
  const match = url.match(/\/app\/([^/]+)/);
  if (!match) {
    throw new Error(`Unable to extract org slug from URL: ${url}`);
  }
  return match[1];
}

function resolveFilePath(filePath: string, baseDir?: string): string {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  const root = baseDir ?? process.cwd();
  return path.resolve(root, filePath);
}

/**
 * Executes a wait condition.
 * Returns true if the page navigated.
 */
async function executeWaitCondition(page: Page, condition: WaitCondition): Promise<boolean> {
  const timeout = condition.timeout || 15000;
  let navigated = false;

  switch (condition.type) {
    case "text":
      if (!condition.value) {
        throw new Error("Wait for text requires 'value'");
      }
      await expect(page.getByText(condition.value, { exact: false }).first()).toBeVisible({
        timeout,
      });
      break;

    case "selector":
      if (!condition.value) {
        throw new Error("Wait for selector requires 'value'");
      }
      await page.locator(condition.value).first().waitFor({ state: "visible", timeout });
      break;

    case "navigation":
      await page.waitForURL(/.*/, { waitUntil: "networkidle", timeout });
      navigated = true;
      break;

    case "idle":
      await page.waitForLoadState("networkidle", { timeout });
      break;

    case "selectorHidden":
      if (!condition.value) {
        throw new Error("Wait for selectorHidden requires 'value'");
      }
      await page.locator(condition.value).first().waitFor({ state: "hidden", timeout });
      break;

    case "textHidden":
      if (!condition.value) {
        throw new Error("Wait for textHidden requires 'value'");
      }
      await expect(page.getByText(condition.value, { exact: false }).first()).toBeHidden({
        timeout,
      });
      break;
  }

  return navigated;
}

/**
 * Executes a single action within a step.
 * Returns true if the page navigated.
 */
async function executeAction(
  action: DemoAction,
  context: DemoContext,
): Promise<boolean> {
  const { page } = context;
  let navigated = false;

  switch (action.action) {
    case "navigate": {
      if (!action.path) {
        throw new Error("Navigate action missing 'path'");
      }
      const resolvedPath = resolvePath(action.path, {
        orgSlug: context.orgSlug,
        baseURL: context.baseURL,
      });
      const fullURL = resolvedPath.startsWith("http")
        ? resolvedPath
        : `${context.baseURL}${resolvedPath}`;
      await page.goto(fullURL, { waitUntil: "networkidle" });
      navigated = true;
      await injectCursorOverlay(page);
      break;
    }

    case "click": {
      if (!action.target) {
        throw new Error("Click action missing 'target'");
      }
      const selector = resolveTarget(action.target);
      await demoClick(page, selector, {
        highlight: action.highlight,
        delayAfter: 500,
      });
      break;
    }

    case "type": {
      if (!action.target) {
        throw new Error("Type action missing 'target'");
      }
      if (!action.text) {
        throw new Error("Type action missing 'text'");
      }
      const selector = resolveTarget(action.target);
      const element = page.locator(selector).first();
      await element.scrollIntoViewIfNeeded();
      const box = await element.boundingBox();
      if (box) {
        await moveCursorTo(page, box.x + box.width / 2, box.y + box.height / 2);
      }
      await element.click();
      await element.fill(action.text);
      break;
    }

    case "upload": {
      if (!action.file) {
        throw new Error("Upload action missing 'file'");
      }
      const filePath = resolveFilePath(action.file, context.assetBaseDir);
      // Use target selector if provided, otherwise find first file input
      const fileSelector = action.target?.selector || 'input[type="file"]';
      const fileInput = page.locator(fileSelector).first();
      await fileInput.setInputFiles(filePath);
      break;
    }

    case "wait": {
      if (action.duration) {
        await page.waitForTimeout(action.duration);
      } else if (action.waitFor) {
        navigated = await executeWaitCondition(page, action.waitFor);
        if (navigated) {
          await injectCursorOverlay(page);
        }
      }
      break;
    }

    case "hover": {
      if (!action.target) {
        throw new Error("Hover action missing 'target'");
      }
      const selector = resolveTarget(action.target);
      const element = page.locator(selector).first();
      await element.scrollIntoViewIfNeeded();
      const box = await element.boundingBox();
      if (box) {
        await moveCursorTo(page, box.x + box.width / 2, box.y + box.height / 2);
      }
      await element.hover();
      break;
    }

    case "scroll": {
      const scrollAmount = action.duration || 500;
      await page.mouse.wheel(0, scrollAmount);
      await page.waitForTimeout(300);
      break;
    }

    case "scrollTo": {
      if (!action.target) {
        throw new Error("ScrollTo action missing 'target'");
      }
      const selector = resolveTarget(action.target);
      await page.locator(selector).first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      break;
    }

    case "drag": {
      if (!action.target) {
        throw new Error("Drag action missing 'target'");
      }
      if (!action.drag) {
        throw new Error("Drag action missing 'drag' configuration");
      }
      const selector = resolveTarget(action.target);
      const element = page.locator(selector).first();
      await element.scrollIntoViewIfNeeded();
      const box = await element.boundingBox();
      if (!box) {
        throw new Error(`Drag target not found or not visible: ${selector}`);
      }

      const startX = box.x + box.width / 2;
      const startY = box.y + box.height / 2;
      const endX = startX + action.drag.deltaX;
      const endY = startY + action.drag.deltaY;
      const dragSteps = action.drag.steps || 20;

      await moveCursorTo(page, startX, startY, { steps: 15 });
      await page.waitForTimeout(100);

      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.waitForTimeout(50);

      for (let i = 1; i <= dragSteps; i++) {
        const t = i / dragSteps;
        const easeT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const currentX = startX + (endX - startX) * easeT;
        const currentY = startY + (endY - startY) * easeT;

        await page.mouse.move(currentX, currentY);
        await page.evaluate(
          ([x, y, shouldAddTrail]) => {
            const api = (window as Window & { __demoCursor?: { setPosition: (x: number, y: number) => void; addTrail: (x: number, y: number) => void } }).__demoCursor;
            if (api) {
              api.setPosition(x, y);
              if (shouldAddTrail) {
                api.addTrail(x + 4, y + 4);
              }
            }
          },
          [currentX, currentY, i % 3 === 0] as [number, number, boolean]
        );
        await page.waitForTimeout(25);
      }

      await page.mouse.up();
      await page.waitForTimeout(200);
      break;
    }

    default:
      throw new Error(`Unknown action type: ${action.action}`);
  }

  // Wait for any configured condition after action
  if (action.waitFor && action.action !== "wait") {
    const waitNavigated = await executeWaitCondition(page, action.waitFor);
    if (waitNavigated) {
      await injectCursorOverlay(page);
      navigated = true;
    }
  }

  // Small delay between actions for video clarity
  await page.waitForTimeout(200);

  return navigated;
}

/**
 * Executes a complete step (all actions).
 */
async function executeStep(
  step: DemoStep,
  context: DemoContext,
  scriptGenerator?: ScriptGenerator
): Promise<void> {
  console.log(`[demo] Executing step: ${step.id} (${step.actions.length} actions)`);

  if (scriptGenerator) {
    scriptGenerator.addSegment(step.id, step.script);
  }

  for (let i = 0; i < step.actions.length; i++) {
    const action = step.actions[i];
    console.log(`[demo]   Action ${i + 1}/${step.actions.length}: ${action.action}`);
    await executeAction(action, context);
  }
}

function getStepStartTarget(step: DemoStep): {
  selector: string;
  waitForState: "visible" | "attached";
} | null {
  for (const action of step.actions) {
    if (action.action === "wait" || action.action === "navigate") {
      continue;
    }
    if (!action.target) {
      continue;
    }
    try {
      return {
        selector: resolveTarget(action.target),
        waitForState: action.action === "upload" ? "attached" : "visible",
      };
    } catch {
      return null;
    }
  }

  return null;
}

async function waitForStepReady(page: Page, step: DemoStep): Promise<void> {
  const target = getStepStartTarget(step);
  if (!target) {
    return;
  }

  try {
    await page.locator(target.selector).first().waitFor({ state: target.waitForState, timeout: 15000 });
  } catch {
    // If the element never appears, let the step execution surface the error.
  }
}

function getStepEndSelector(step: DemoStep): string | null {
  for (let index = step.actions.length - 1; index >= 0; index -= 1) {
    const action = step.actions[index];
    if (action.action === "wait" || action.action === "navigate") {
      continue;
    }
    if (!action.target) {
      continue;
    }
    try {
      return resolveTarget(action.target);
    } catch {
      return null;
    }
  }

  return null;
}

async function waitForStepExit(page: Page, step: DemoStep): Promise<void> {
  const selector = getStepEndSelector(step);
  if (!selector) {
    return;
  }

  try {
    await page.locator(selector).first().waitFor({ state: "hidden", timeout: 1500 });
  } catch {
    // Allow steps where the last action target remains visible.
  }
}

/**
 * Runs a complete demo from a definition.
 */
export async function runDemo(
  definition: DemoDefinition,
  context: DemoContext,
  options: RunDemoOptions = {}
): Promise<DemoResult> {
  const startTime = Date.now();
  const transitionDelayMs = 500;
  const scriptGenerator = options.generateScripts
    ? createScriptGenerator(
        definition.name,
        definition.title,
        context.videoRecordingStartTime
      )
    : null;

  try {
    // Inject cursor overlay
    await injectCursorOverlay(context.page);

    // Execute each step
    for (let stepIndex = 0; stepIndex < definition.steps.length; stepIndex += 1) {
      const step = definition.steps[stepIndex];
      if (scriptGenerator && stepIndex > 0) {
        await waitForStepReady(context.page, step);
      }
      if (scriptGenerator) {
        scriptGenerator.startStep(step.id);
      }
      await executeStep(step, context, scriptGenerator ?? undefined);
      if (scriptGenerator && stepIndex < definition.steps.length - 1) {
        await waitForStepExit(context.page, step);
        await context.page.waitForTimeout(transitionDelayMs);
      }
    }

    if (scriptGenerator) {
      scriptGenerator.finishAllSteps();

      const scriptOutputDir = options.scriptOutputDir ?? path.join(context.outputDir, "scripts");
      const scriptBasePath = path.join(scriptOutputDir, definition.name);
      await scriptGenerator.exportJSON(`${scriptBasePath}.json`);
      await scriptGenerator.exportSRT(`${scriptBasePath}.srt`);
      await scriptGenerator.exportMarkdown(`${scriptBasePath}.md`);
      await scriptGenerator.exportAIVoiceScript(`${scriptBasePath}.voice.json`);

      // Clean up cursor overlay
      await removeCursorOverlay(context.page);

      return {
        success: true,
        demoName: definition.name,
        videoPath: context.videoPath,
        scriptPath: `${scriptBasePath}.json`,
        duration: Date.now() - startTime,
      };
    }

    // Clean up cursor overlay
    await removeCursorOverlay(context.page);

    return {
      success: true,
      demoName: definition.name,
      videoPath: context.videoPath,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      demoName: definition.name,
      error: error instanceof Error ? error : new Error(String(error)),
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Runs a demo from a YAML file path.
 */
export async function runDemoFromFile(
  definitionPath: string,
  context: DemoContext,
  options?: RunDemoOptions
): Promise<DemoResult> {
  const definition = await loadDemoDefinition(definitionPath);
  return runDemo(definition, context, options);
}

/**
 * Discovers all demo definition files in a directory.
 */
export async function discoverDemos(demoDir: string): Promise<string[]> {
  const files = await fs.readdir(demoDir);
  return files
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .map((f) => path.join(demoDir, f));
}

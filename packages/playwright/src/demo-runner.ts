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
} from "@t3lnet/sceneforge-shared";
import {
  parseFromYAML,
  validateDemoDefinition,
  resolveTarget,
  resolvePath,
} from "@t3lnet/sceneforge-shared";
import {
  ScriptGenerator,
  createScriptGenerator,
} from "@t3lnet/sceneforge-generation";
import {
  injectCursorOverlay,
  removeCursorOverlay,
  demoClick,
  moveCursorTo,
} from "./cursor-overlay";

const DEFAULT_ACTION_TIMEOUT_MS = 15000;
const NAVIGATION_TIMEOUT_MS = 45000;
const UPLOAD_TIMEOUT_MS = 30000;
const ACTION_TIMEOUT_BUFFER_MS = 2000;
const DEFAULT_WAIT_TIMEOUT_MS = Number(process.env.DEMO_WAIT_TIMEOUT_MS ?? 15000);
const WAIT_RETRY_ATTEMPTS = Math.max(
  1,
  Number(process.env.DEMO_WAIT_RETRY_ATTEMPTS ?? 2)
);
const WAIT_RETRY_BASE_DELAY_MS = Number(process.env.DEMO_WAIT_RETRY_DELAY_MS ?? 500);

function sanitizeDiagnosticsSegment(value: string, fallback: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return fallback;
  }
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const collapsed = cleaned.replace(/_{2,}/g, "_").replace(/^_+|_+$/g, "");
  const safe = collapsed || fallback;
  const trimmed = safe.length > 80 ? safe.slice(0, 80) : safe;
  return trimmed === "." || trimmed === ".." ? fallback : trimmed;
}

function logEvent(
  level: "info" | "warn" | "error",
  event: string,
  data: Record<string, unknown>
): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...data,
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

function getActionTimeoutMs(action: DemoAction): number {
  if (action.action === "navigate") {
    return NAVIGATION_TIMEOUT_MS;
  }
  if (action.action === "upload") {
    return UPLOAD_TIMEOUT_MS;
  }
  if (action.action === "wait") {
    if (action.duration !== undefined) {
      return Math.max(DEFAULT_ACTION_TIMEOUT_MS, action.duration + ACTION_TIMEOUT_BUFFER_MS);
    }
    if (action.waitFor?.timeout) {
      return action.waitFor.timeout + ACTION_TIMEOUT_BUFFER_MS;
    }
  }
  if (action.waitFor?.timeout) {
    return action.waitFor.timeout + ACTION_TIMEOUT_BUFFER_MS;
  }
  return DEFAULT_ACTION_TIMEOUT_MS;
}

async function withActionTimeout<T>(
  timeoutMs: number,
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([fn(), timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function captureDiagnostics(params: {
  context: DemoContext;
  stepId?: string;
  stepIndex?: number;
  actionIndex?: number;
  action?: DemoAction;
  error: unknown;
  runId: string;
}): Promise<void> {
  const { context, stepId, stepIndex, actionIndex, action, error, runId } = params;
  const diagnosticsDir = path.join(context.outputDir, "diagnostics");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const stepLabel = sanitizeDiagnosticsSegment(stepId ?? "unknown-step", "unknown-step");
  const actionLabel = actionIndex !== undefined ? `action-${actionIndex + 1}` : "action";
  const baseName = `${timestamp}-${runId}-${stepLabel}-${actionLabel}`;

  try {
    await fs.mkdir(diagnosticsDir, { recursive: true });
  } catch {
    // Ignore failures creating diagnostics dir.
  }

  const metadata = {
    runId,
    stepId,
    stepIndex,
    actionIndex,
    action,
    error: error instanceof Error ? error.message : String(error),
    url: context.page.url(),
    capturedAt: new Date().toISOString(),
  };

  try {
    const screenshotPath = path.join(diagnosticsDir, `${baseName}.png`);
    await context.page.screenshot({ path: screenshotPath, fullPage: true });
  } catch {
    // Ignore screenshot failures.
  }

  try {
    const domContent = await context.page.content();
    const maxChars = 20000;
    const snippet =
      domContent.length > maxChars
        ? `${domContent.slice(0, maxChars)}\n<!-- truncated -->`
        : domContent;
    const domPath = path.join(diagnosticsDir, `${baseName}.dom.html`);
    await fs.writeFile(domPath, snippet, "utf-8");
  } catch {
    // Ignore DOM capture failures.
  }

  try {
    const metaPath = path.join(diagnosticsDir, `${baseName}.json`);
    await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2), "utf-8");
  } catch {
    // Ignore metadata write failures.
  }
}

/**
 * Context passed to the demo runner.
 */
export interface DemoContext {
  page: Page;
  baseURL: string;
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

interface ActionContext {
  stepId: string;
  stepIndex: number;
  actionIndex: number;
  runId: string;
  demoName: string;
}

/**
 * Loads and parses a YAML demo definition file.
 */
export async function loadDemoDefinition(
  filePath: string,
  options?: { resolveSecrets?: (key: string) => string | undefined }
): Promise<DemoDefinition> {
  const content = await fs.readFile(filePath, "utf-8");
  const definition = parseFromYAML(content, options);
  validateDemoDefinition(definition);
  return definition;
}

/**
 * Waits for org slug to be available after login/redirect.
 */
function resolveFilePath(filePath: string, baseDir?: string): string {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  const root = baseDir ?? process.cwd();
  return path.resolve(root, filePath);
}

function resolveNavigatePath(actionPath: string, context: DemoContext): string {
  const resolvedPath = resolvePath(actionPath, { baseURL: context.baseURL });
  if (/\{[^}]+\}/.test(resolvedPath)) {
    throw new Error(
      `Navigate action contains unresolved template variables: ${resolvedPath}`
    );
  }
  return resolvedPath;
}

/**
 * Executes a wait condition.
 * Returns true if the page navigated.
 */
async function executeWaitCondition(
  page: Page,
  condition: WaitCondition,
  actionContext?: ActionContext
): Promise<boolean> {
  const timeout = condition.timeout || DEFAULT_WAIT_TIMEOUT_MS;
  let navigated = false;

  const getSelectorContext = async (): Promise<Record<string, unknown>> => {
    if (!condition.value) return {};
    try {
      if (condition.type === "selector" || condition.type === "selectorHidden") {
        const count = await page.locator(condition.value).count();
        return { selectorCount: count };
      }
      if (condition.type === "text" || condition.type === "textHidden") {
        const count = await page.getByText(condition.value, { exact: false }).count();
        return { textMatchCount: count };
      }
    } catch (error) {
      return { selectorContextError: error instanceof Error ? error.message : String(error) };
    }
    return {};
  };

  for (let attempt = 0; attempt < WAIT_RETRY_ATTEMPTS; attempt += 1) {
    try {
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

      if (attempt > 0 && actionContext) {
        logEvent("info", "wait_retry_success", {
          runId: actionContext.runId,
          demoName: actionContext.demoName,
          stepId: actionContext.stepId,
          actionIndex: actionContext.actionIndex,
          waitType: condition.type,
          attempt: attempt + 1,
        });
      }
      return navigated;
    } catch (error) {
      const selectorContext = await getSelectorContext();
      logEvent("warn", "wait_retry", {
        runId: actionContext?.runId,
        demoName: actionContext?.demoName,
        stepId: actionContext?.stepId,
        actionIndex: actionContext?.actionIndex,
        waitType: condition.type,
        waitValue: condition.value,
        timeout,
        attempt: attempt + 1,
        error: error instanceof Error ? error.message : String(error),
        ...selectorContext,
      });

      if (attempt >= WAIT_RETRY_ATTEMPTS - 1) {
        throw error;
      }
      const delayMs = WAIT_RETRY_BASE_DELAY_MS * (attempt + 1);
      await page.waitForTimeout(delayMs);
    }
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
  actionContext: ActionContext
): Promise<boolean> {
  const { page } = context;
  let navigated = false;
  const timeoutMs = getActionTimeoutMs(action);
  const startedAt = Date.now();

  logEvent("info", "action_start", {
    runId: actionContext.runId,
    demoName: actionContext.demoName,
    stepId: actionContext.stepId,
    stepIndex: actionContext.stepIndex,
    actionIndex: actionContext.actionIndex,
    actionType: action.action,
    timeoutMs,
  });

  try {
    await withActionTimeout(timeoutMs, `${action.action} action`, async () => {
      switch (action.action) {
        case "navigate": {
          if (!action.path) {
            throw new Error("Navigate action missing 'path'");
          }
          const resolvedPath = resolveNavigatePath(action.path, context);
          const fullURL = resolvedPath.startsWith("http")
            ? resolvedPath
            : `${context.baseURL}${resolvedPath}`;
          await page.goto(fullURL, { waitUntil: "networkidle", timeout: timeoutMs });
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
            timeoutMs,
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
          await element.waitFor({ state: "visible", timeout: timeoutMs });
          await element.scrollIntoViewIfNeeded();
          const box = await element.boundingBox();
          if (box) {
            await moveCursorTo(page, box.x + box.width / 2, box.y + box.height / 2);
          }
          await element.click({ timeout: timeoutMs });
          await element.fill(action.text, { timeout: timeoutMs });
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
          await fileInput.setInputFiles(filePath, { timeout: timeoutMs });
          break;
        }

        case "wait": {
          if (action.duration) {
            await page.waitForTimeout(action.duration);
          } else if (action.waitFor) {
            navigated = await executeWaitCondition(page, action.waitFor, actionContext);
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
          await element.waitFor({ state: "visible", timeout: timeoutMs });
          await element.scrollIntoViewIfNeeded();
          const box = await element.boundingBox();
          if (box) {
            await moveCursorTo(page, box.x + box.width / 2, box.y + box.height / 2);
          }
          await element.hover({ timeout: timeoutMs });
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
          await page.locator(selector).first().scrollIntoViewIfNeeded({ timeout: timeoutMs });
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
          await element.waitFor({ state: "visible", timeout: timeoutMs });
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
        const waitNavigated = await executeWaitCondition(page, action.waitFor, actionContext);
        if (waitNavigated) {
          await injectCursorOverlay(page);
          navigated = true;
        }
      }

      // Small delay between actions for video clarity
      await page.waitForTimeout(200);
    });

    logEvent("info", "action_complete", {
      runId: actionContext.runId,
      demoName: actionContext.demoName,
      stepId: actionContext.stepId,
      stepIndex: actionContext.stepIndex,
      actionIndex: actionContext.actionIndex,
      actionType: action.action,
      durationMs: Date.now() - startedAt,
      navigated,
    });
  } catch (error) {
    logEvent("error", "action_failed", {
      runId: actionContext.runId,
      demoName: actionContext.demoName,
      stepId: actionContext.stepId,
      stepIndex: actionContext.stepIndex,
      actionIndex: actionContext.actionIndex,
      actionType: action.action,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    await captureDiagnostics({
      context,
      stepId: actionContext.stepId,
      stepIndex: actionContext.stepIndex,
      actionIndex: actionContext.actionIndex,
      action,
      error,
      runId: actionContext.runId,
    });
    throw error;
  }

  return navigated;
}

/**
 * Executes a complete step (all actions).
 */
async function executeStep(
  step: DemoStep,
  context: DemoContext,
  scriptGenerator: ScriptGenerator | null,
  runId: string,
  demoName: string,
  stepIndex: number
): Promise<void> {
  console.log(`[demo] Executing step: ${step.id} (${step.actions.length} actions)`);
  logEvent("info", "step_start", {
    runId,
    demoName,
    stepId: step.id,
    stepIndex,
    actionCount: step.actions.length,
  });

  if (scriptGenerator) {
    scriptGenerator.addSegment(step.id, step.script);
  }

  for (let i = 0; i < step.actions.length; i++) {
    const action = step.actions[i];
    console.log(`[demo]   Action ${i + 1}/${step.actions.length}: ${action.action}`);
    await executeAction(action, context, {
      stepId: step.id,
      stepIndex,
      actionIndex: i,
      runId,
      demoName,
    });
  }

  logEvent("info", "step_complete", {
    runId,
    demoName,
    stepId: step.id,
    stepIndex,
    actionCount: step.actions.length,
  });
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
    await page
      .locator(target.selector)
      .first()
      .waitFor({ state: target.waitForState, timeout: DEFAULT_WAIT_TIMEOUT_MS });
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
  const runId = `${definition.name}-${startTime}`;
  let scriptGenerator: ScriptGenerator | null = null;

  logEvent("info", "demo_start", {
    runId,
    demoName: definition.name,
    stepCount: definition.steps.length,
    baseURL: context.baseURL,
  });

  try {
    // Inject cursor overlay
    await injectCursorOverlay(context.page);
    const hadVideoStartTime = context.videoRecordingStartTime !== undefined;
    const syncedVideoStartTimeMs = context.videoRecordingStartTime ?? Date.now();
    if (!hadVideoStartTime) {
      context.videoRecordingStartTime = syncedVideoStartTimeMs;
    }
    logEvent("info", "video_sync", {
      runId,
      demoName: definition.name,
      videoStartTimeMs: syncedVideoStartTimeMs,
      providedByCaller: hadVideoStartTime,
    });
    if (options.generateScripts) {
      scriptGenerator = createScriptGenerator(
        definition.name,
        definition.title,
        syncedVideoStartTimeMs
      );
    }

    // Execute each step
    for (let stepIndex = 0; stepIndex < definition.steps.length; stepIndex += 1) {
      const step = definition.steps[stepIndex];
      if (scriptGenerator && stepIndex > 0) {
        await waitForStepReady(context.page, step);
      }
      if (scriptGenerator) {
        scriptGenerator.startStep(step.id);
      }
      await executeStep(step, context, scriptGenerator, runId, definition.name, stepIndex);
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

      logEvent("info", "demo_complete", {
        runId,
        demoName: definition.name,
        durationMs: Date.now() - startTime,
      });

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

    logEvent("info", "demo_complete", {
      runId,
      demoName: definition.name,
      durationMs: Date.now() - startTime,
    });

    return {
      success: true,
      demoName: definition.name,
      videoPath: context.videoPath,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    logEvent("error", "demo_failed", {
      runId,
      demoName: definition.name,
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    });
    await captureDiagnostics({
      context,
      error,
      runId,
    });
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

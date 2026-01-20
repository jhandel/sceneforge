/**
 * @jhandel/sceneforge-playwright
 *
 * Playwright driver for demo recording and playback.
 * Used to execute demo definitions and record videos.
 */

// Re-export shared types for convenience
export type {
  DemoDefinition,
  DemoStep,
  DemoAction,
  ActionType,
  StepTarget,
  WaitCondition,
  DragConfig,
} from "@jhandel/sceneforge-shared";

// Demo runner
export {
  runDemo,
  runDemoFromFile,
  loadDemoDefinition,
  discoverDemos,
  type DemoContext,
  type DemoResult,
  type StepTiming,
  type RunDemoOptions,
} from "./demo-runner";

// Cursor overlay (for custom implementations)
export {
  injectCursorOverlay,
  removeCursorOverlay,
  moveCursorTo,
  triggerClickRipple,
  highlightElement,
  demoClick,
  demoHover,
  demoType,
} from "./cursor-overlay";

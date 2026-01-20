/**
 * @demo-tools/shared
 *
 * Shared types and utilities for demo recording and playback.
 * Used by both the Playwright CLI and the Chrome extension.
 */

// Types
export type {
  DemoDefinition,
  DemoStep,
  DemoAction,
  ActionType,
  StepTarget,
  WaitCondition,
  DragConfig,
  ElementInfo,
  RecordedInteraction,
  SelectorStrategy,
  SelectorCandidate,
  RecordingState,
  PickerResult,
  TestSelectorResponse,
} from "./types";

// YAML parsing and serialization
export {
  parseFromYAML,
  serializeToYAML,
  validateDemoDefinition,
  createEmptyDemo,
  createEmptyStep,
} from "./yaml-parser";

// Target resolution
export {
  resolveTarget,
  resolvePath,
  extractOrgSlug,
} from "./target-resolver";

// Action helpers
export {
  createClickAction,
  createTypeAction,
  createNavigateAction,
  createWaitAction,
  createWaitForAction,
  createUploadAction,
  createHoverAction,
  createScrollAction,
  createScrollToAction,
  createDragAction,
} from "./action-helpers";

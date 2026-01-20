/**
 * @t3lnet/sceneforge-shared
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
  PrivacyConfig,
  SelectorConfig,
  RecordingState,
  PickerResult,
  TestSelectorResponse,
  VideoSegment,
  BackgroundMusic,
  MusicStartPoint,
  MusicEndPoint,
  MediaConfig,
} from "./types";

// YAML parsing and serialization
export {
  parseFromYAML,
  serializeToYAML,
  validateDemoDefinition,
  createEmptyDemo,
  createEmptyStep,
} from "./yaml-parser";

// Schema validation
export {
  DEMO_SCHEMA_VERSION,
  demoDefinitionSchema,
  parseDemoDefinition,
  safeParseDemoDefinition,
  formatValidationError,
} from "./schema";

// Target resolution
export {
  resolveTarget,
  resolvePath,
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

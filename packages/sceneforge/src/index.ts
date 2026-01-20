/**
 * @jhandel/sceneforge
 *
 * SceneForge public API: demo runner + generation utilities.
 */

// Shared types
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
} from "../../shared/src/types";

// YAML parsing and serialization
export {
  parseFromYAML,
  serializeToYAML,
  validateDemoDefinition,
  createEmptyDemo,
  createEmptyStep,
} from "../../shared/src/yaml-parser";

// Schema validation
export {
  DEMO_SCHEMA_VERSION,
  demoDefinitionSchema,
  parseDemoDefinition,
  safeParseDemoDefinition,
  formatValidationError,
} from "../../shared/src/schema";

// Target resolution
export {
  resolveTarget,
  resolvePath,
} from "../../shared/src/target-resolver";

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
} from "../../shared/src/action-helpers";

// Demo runner
export {
  runDemo,
  runDemoFromFile,
  loadDemoDefinition,
  discoverDemos,
} from "../../playwright/src/demo-runner";

export type {
  DemoContext,
  DemoResult,
  StepTiming,
  RunDemoOptions,
} from "../../playwright/src/demo-runner";

// Cursor overlay helpers
export {
  injectCursorOverlay,
  removeCursorOverlay,
  moveCursorTo,
  triggerClickRipple,
  highlightElement,
  demoClick,
  demoHover,
  demoType,
} from "../../playwright/src/cursor-overlay";

// Voice synthesis utilities
export {
  VoiceSynthesizer,
  createVoiceSynthesizer,
  generateTimingManifest,
} from "../../generation/src/voice-synthesis";

export type {
  VoiceSynthesisConfig,
  VoiceSynthesisResult,
  SynthesizedSegment,
  GeneratedScript,
  ScriptSegment as VoiceScriptSegment,
  AudioTimingManifest,
} from "../../generation/src/voice-synthesis";

// Script generation utilities
export {
  ScriptGenerator,
  createScriptGenerator,
} from "../../generation/src/script-generator";

export type {
  ScriptSegment,
  ScriptOutput,
  StepBoundary,
} from "../../generation/src/script-generator";

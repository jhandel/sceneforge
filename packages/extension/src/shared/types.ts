/**
 * Re-export types from @jhandel/sceneforge-shared.
 * This allows existing imports in the extension to continue working.
 */

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
} from "@jhandel/sceneforge-shared";

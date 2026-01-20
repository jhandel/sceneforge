/**
 * Re-export types from @demo-tools/shared.
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
  RecordingState,
  PickerResult,
  TestSelectorResponse,
} from "@demo-tools/shared";

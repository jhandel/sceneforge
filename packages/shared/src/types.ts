/**
 * Core type definitions for demo YAML format.
 * These types define the schema used by demo definition YAML files
 * and are shared between all tools (CLI, extension, etc).
 */

/**
 * Complete demo definition matching the YAML schema.
 */
export interface DemoDefinition {
  name: string;
  title: string;
  description?: string;
  steps: DemoStep[];
}

/**
 * A logical step in the demo with a script and multiple actions.
 */
export interface DemoStep {
  id: string;
  script: string; // The voiceover text for this step
  actions: DemoAction[]; // List of actions to execute
}

/**
 * A single action within a step.
 */
export interface DemoAction {
  action: ActionType;
  path?: string;
  target?: StepTarget;
  text?: string;
  file?: string;
  duration?: number;
  highlight?: boolean;
  waitFor?: WaitCondition;
  drag?: DragConfig;
}

/**
 * Supported action types.
 */
export type ActionType =
  | "navigate"
  | "click"
  | "type"
  | "upload"
  | "wait"
  | "hover"
  | "scroll"
  | "scrollTo"
  | "drag";

/**
 * Target element specification.
 */
export interface StepTarget {
  type: "button" | "link" | "input" | "text" | "selector";
  text?: string;
  selector?: string;
  name?: string;
}

/**
 * Wait condition configuration.
 */
export interface WaitCondition {
  type: "text" | "selector" | "navigation" | "idle" | "selectorHidden" | "textHidden";
  value?: string;
  timeout?: number;
}

/**
 * Drag action configuration.
 */
export interface DragConfig {
  deltaX: number;
  deltaY: number;
  steps?: number; // Number of intermediate steps for smooth animation
}

/**
 * Element information captured during recording.
 */
export interface ElementInfo {
  tagName: string;
  id?: string;
  className?: string;
  textContent?: string;
  ariaLabel?: string;
  placeholder?: string;
  name?: string;
  type?: string;
  href?: string;
  role?: string;
  dataTestId?: string;
  boundingRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * A recorded user interaction (used during recording).
 */
export interface RecordedInteraction {
  type: "click" | "input" | "navigation" | "scroll" | "drag";
  timestamp: number;
  selector: string;
  selectorCandidates: SelectorCandidate[];
  elementInfo: ElementInfo;
  value?: string;
  url?: string;
  scrollDelta?: { deltaX: number; deltaY: number };
  dragDelta?: { deltaX: number; deltaY: number; duration: number };
}

/**
 * Selector generation strategy.
 */
export type SelectorStrategy =
  | "data-testid"
  | "aria-label"
  | "role-text"
  | "placeholder"
  | "css-class"
  | "xpath"
  | "text"
  | "id";

/**
 * A selector candidate with priority and strategy info.
 */
export interface SelectorCandidate {
  selector: string;
  priority: number;
  strategy: SelectorStrategy | string;
  description?: string;
}

/**
 * Recording state for the extension.
 */
export interface RecordingState {
  isRecording: boolean;
  isPicking: boolean;
  currentDemo: DemoDefinition | null;
  currentStepIndex: number;
}

/**
 * Result of element picker.
 */
export interface PickerResult {
  selector: string;
  selectorCandidates: SelectorCandidate[];
  elementInfo: ElementInfo;
}

/**
 * Result of testing a selector.
 */
export interface TestSelectorResponse {
  found: boolean;
  count: number;
  elementInfo?: {
    tagName: string;
    textContent?: string;
  };
}

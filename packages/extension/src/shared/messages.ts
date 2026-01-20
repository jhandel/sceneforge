/**
 * Message types for Chrome extension communication.
 */

import type { DemoDefinition, RecordedInteraction, PickerResult, RecordingState, TestSelectorResponse } from "./types";

export type { TestSelectorResponse };

/**
 * Suggested wait condition detected from DOM changes.
 */
export interface SuggestedWait {
  type: "text" | "selector" | "textHidden" | "selectorHidden";
  value: string;
  description: string;
  confidence: number; // 0-1, how likely this is a good wait condition
}

// Message type discriminators
export type MessageType =
  | "START_RECORDING"
  | "STOP_RECORDING"
  | "START_PICKER"
  | "STOP_PICKER"
  | "INTERACTION_RECORDED"
  | "FILE_UPLOAD_RECORDED"
  | "PICKER_RESULT"
  | "SUGGEST_WAITS"
  | "AUTO_WAIT_DETECTED"
  | "GET_STATE"
  | "STATE_UPDATE"
  | "UPDATE_DEMO"
  | "SET_CURRENT_STEP"
  | "TEST_SELECTOR"
  | "HIGHLIGHT_ELEMENT"
  | "CLEAR_HIGHLIGHT"
  | "PLAY_ACTION"
  | "PLAY_ACTION_RESULT"
  | "PLAY_STEP"
  | "PLAY_STEP_RESULT";

// Base message interface
interface BaseMessage {
  type: MessageType;
}

// Recording control messages
export interface StartRecordingMessage extends BaseMessage {
  type: "START_RECORDING";
}

export interface StopRecordingMessage extends BaseMessage {
  type: "STOP_RECORDING";
}

// Picker control messages
export interface StartPickerMessage extends BaseMessage {
  type: "START_PICKER";
}

export interface StopPickerMessage extends BaseMessage {
  type: "STOP_PICKER";
}

// Data messages
export interface InteractionRecordedMessage extends BaseMessage {
  type: "INTERACTION_RECORDED";
  interaction: RecordedInteraction;
}

// File upload recorded (when user selects a file via file picker)
export interface FileUploadRecordedMessage extends BaseMessage {
  type: "FILE_UPLOAD_RECORDED";
  fileName: string;
  selector: string;
  elementInfo: import("./types").ElementInfo;
}

export interface PickerResultMessage extends BaseMessage {
  type: "PICKER_RESULT";
  result: PickerResult;
}

// Suggested wait conditions (sent after DOM changes detected during recording)
export interface SuggestWaitsMessage extends BaseMessage {
  type: "SUGGEST_WAITS";
  suggestedWaits: SuggestedWait[];
  forInteractionTimestamp?: number; // Links to the interaction that triggered these
}

// Auto-detected wait condition to be recorded (high confidence)
export interface AutoWaitDetectedMessage extends BaseMessage {
  type: "AUTO_WAIT_DETECTED";
  waitCondition: {
    type: "text" | "selector" | "textHidden" | "selectorHidden";
    value: string;
    timeout: number;
  };
  description: string;
  confidence: number;
  forInteractionTimestamp?: number;
}

// State messages
export interface GetStateMessage extends BaseMessage {
  type: "GET_STATE";
}

export interface StateUpdateMessage extends BaseMessage {
  type: "STATE_UPDATE";
  state: RecordingState;
}

export interface UpdateDemoMessage extends BaseMessage {
  type: "UPDATE_DEMO";
  demo: DemoDefinition;
}

export interface SetCurrentStepMessage extends BaseMessage {
  type: "SET_CURRENT_STEP";
  stepIndex: number;
}

// Selector testing messages
export interface TestSelectorMessage extends BaseMessage {
  type: "TEST_SELECTOR";
  selector: string;
}

export interface HighlightElementMessage extends BaseMessage {
  type: "HIGHLIGHT_ELEMENT";
  selector: string;
}

export interface ClearHighlightMessage extends BaseMessage {
  type: "CLEAR_HIGHLIGHT";
}

// Playback messages
export interface PlayActionMessage extends BaseMessage {
  type: "PLAY_ACTION";
  action: import("./types").DemoAction;
}

export interface PlayActionResultMessage extends BaseMessage {
  type: "PLAY_ACTION_RESULT";
  success: boolean;
  error?: string;
  suggestedWaits?: SuggestedWait[];
  waitedForElement?: number; // ms waited for element before action
}

// Play an entire step with progress UI
export interface PlayStepMessage extends BaseMessage {
  type: "PLAY_STEP";
  actions: import("./types").DemoAction[];
  stepId?: string;
  stepIndex?: number;
}

export interface PlayStepResultMessage extends BaseMessage {
  type: "PLAY_STEP_RESULT";
  success: boolean;
  failedActionIndex?: number;
  failedActionText?: string;
  error?: string;
  completedActions: number;
  totalActions: number;
}

// Union type for all messages
export type ExtensionMessage =
  | StartRecordingMessage
  | StopRecordingMessage
  | StartPickerMessage
  | StopPickerMessage
  | InteractionRecordedMessage
  | FileUploadRecordedMessage
  | PickerResultMessage
  | SuggestWaitsMessage
  | AutoWaitDetectedMessage
  | GetStateMessage
  | StateUpdateMessage
  | UpdateDemoMessage
  | SetCurrentStepMessage
  | TestSelectorMessage
  | HighlightElementMessage
  | ClearHighlightMessage
  | PlayActionMessage
  | PlayActionResultMessage
  | PlayStepMessage
  | PlayStepResultMessage;

// Helper to send messages
export function sendMessage<T = void>(message: ExtensionMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}

// Helper to send message to active tab
export function sendMessageToTab<T = void>(tabId: number, message: ExtensionMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}

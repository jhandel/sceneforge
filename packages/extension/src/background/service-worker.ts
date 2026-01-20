/**
 * Service worker for SceneForge extension.
 * Manages state and routes messages between content script and side panel.
 */

import type {
  RecordingState,
  RecordedInteraction,
  PickerResult,
} from "../shared/types";
import type { ExtensionMessage, TestSelectorResponse } from "../shared/messages";
import { DEFAULT_PRIVACY_CONFIG, normalizePrivacyConfig } from "../shared/privacy";
import { DEFAULT_SELECTOR_CONFIG, normalizeSelectorConfig } from "../shared/selector-config";
import {
  createEmptyDemo,
  createEmptyStep,
  createClickAction,
  safeParseDemoDefinition,
  formatValidationError,
} from "../shared/yaml-serializer";

const STORAGE_VERSION = 1;

// Global state
const state: RecordingState = {
  isRecording: false,
  isPicking: false,
  isPaused: false,
  privacyConfig: { ...DEFAULT_PRIVACY_CONFIG },
  selectorConfig: { ...DEFAULT_SELECTOR_CONFIG },
  currentDemo: null,
  currentStepIndex: -1,
};

// Storage key
const STORAGE_KEY = "demoYamlCreator_state";

// Initialize state from storage
async function initializeState(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const stored = result[STORAGE_KEY];
    let shouldPersist = false;
    if (stored && typeof stored === "object" && stored !== null) {
      if ("storageVersion" in stored) {
        const storedVersion = Number((stored as { storageVersion?: number }).storageVersion);
        if (storedVersion !== STORAGE_VERSION) {
          console.warn(
            "[service-worker] Stored state version mismatch, resetting",
            storedVersion
          );
          await chrome.storage.local.remove(STORAGE_KEY);
          shouldPersist = true;
        } else {
          const storedState = stored as {
            demo?: unknown;
            privacyConfig?: unknown;
            selectorConfig?: unknown;
          };
          if (storedState.demo) {
            const parsed = safeParseDemoDefinition(storedState.demo);
            if (parsed.success) {
              const demo = parsed.data;
              state.currentDemo = demo;
              state.currentStepIndex = demo.steps.length
                ? demo.steps.length - 1
                : -1;
            } else {
              console.warn(
                "[service-worker] Invalid stored demo draft, resetting:",
                formatValidationError(parsed.error)
              );
              state.currentDemo = null;
              state.currentStepIndex = -1;
              shouldPersist = true;
            }
          }
          state.privacyConfig = normalizePrivacyConfig(storedState.privacyConfig);
          state.selectorConfig = normalizeSelectorConfig(storedState.selectorConfig);
        }
      } else {
        // Legacy stored demo draft
        const parsed = safeParseDemoDefinition(stored);
        if (parsed.success) {
          const demo = parsed.data;
          state.currentDemo = demo;
          state.currentStepIndex = demo.steps.length
            ? demo.steps.length - 1
            : -1;
          shouldPersist = true;
        } else {
          console.warn(
            "[service-worker] Invalid stored demo draft, resetting:",
            formatValidationError(parsed.error)
          );
          await chrome.storage.local.remove(STORAGE_KEY);
          shouldPersist = true;
        }
      }
    }
    state.selectorConfig = normalizeSelectorConfig(state.selectorConfig);
    if (shouldPersist) {
      await saveState();
    }
  } catch (error) {
    console.error("[service-worker] Failed to load state:", error);
  }
}

// Save state to storage
async function saveState(): Promise<void> {
  try {
    await chrome.storage.local.set({
      [STORAGE_KEY]: {
        storageVersion: STORAGE_VERSION,
        demo: state.currentDemo,
        privacyConfig: state.privacyConfig,
        selectorConfig: state.selectorConfig,
      },
    });
  } catch (error) {
    console.error("[service-worker] Failed to save state:", error);
  }
}

// Broadcast state update to all listeners
function broadcastState(): void {
  chrome.runtime.sendMessage({
    type: "STATE_UPDATE",
    state,
  }).catch(() => {
    // Ignore errors when no listeners
  });
}

// Get current active tab
async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

// Check if URL is injectable (not chrome:// or other protected URLs)
function isInjectableUrl(url: string | undefined): boolean {
  if (!url) return false;
  // Can't inject into chrome:// pages, edge://, about:, etc.
  return url.startsWith("http://") || url.startsWith("https://") || url.startsWith("file://");
}

// Send message to content script (returns null if content script not available)
async function sendToContentScript(message: ExtensionMessage): Promise<unknown> {
  const tab = await getActiveTab();
  if (!tab?.id) {
    console.log("[service-worker] No active tab found");
    return null;
  }

  // Can't inject into browser internal pages
  if (!isInjectableUrl(tab.url)) {
    console.log("[service-worker] Cannot inject into this page:", tab.url);
    return null;
  }

  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    // Content script not loaded yet - try to inject it
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content-script.js"],
      });
      // Retry sending the message
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch {
      console.log("[service-worker] Could not inject content script into:", tab.url);
      return null;
    }
  }
}

// Handle recorded interaction from content script
function handleInteractionRecorded(interaction: RecordedInteraction): void {
  console.log(`[service-worker] Received interaction:`, {
    type: interaction.type,
    selector: interaction.selector?.slice(0, 50),
    isRecording: state.isRecording,
  });

  if (!state.isRecording || state.isPaused) {
    console.log(`[service-worker] Interaction ignored: not recording`);
    return;
  }

  // Initialize demo if needed
  if (!state.currentDemo) {
    state.currentDemo = createEmptyDemo();
  }

  // Initialize first step if needed
  if (state.currentDemo.steps.length === 0) {
    state.currentDemo.steps.push(createEmptyStep("step-1"));
    state.currentStepIndex = 0;
  }

  const currentStep = state.currentDemo.steps[state.currentStepIndex];
  if (!currentStep) return;

  // Convert interaction to action based on type
  switch (interaction.type) {
    case "click": {
      const action = createClickAction(interaction.selector, true);
      currentStep.actions.push(action);
      break;
    }
    case "input": {
      if (interaction.value) {
        currentStep.actions.push({
          action: "type",
          target: {
            type: "selector",
            selector: interaction.selector,
          },
          text: interaction.value,
        });
      }
      break;
    }
    case "navigation": {
      if (interaction.url) {
        // Extract path from URL
        try {
          const url = new URL(interaction.url);
          const path = url.pathname + url.search;
          currentStep.actions.push({
            action: "navigate",
            path,
            waitFor: {
              type: "idle",
              timeout: 15000,
            },
          });
        } catch {
          // Invalid URL, skip
        }
      }
      break;
    }
    case "scroll": {
      if (interaction.scrollDelta) {
        // For now, we record scroll as a duration-based action
        // The demo runner uses duration for smooth scroll animations
        currentStep.actions.push({
          action: "scroll",
          duration: 500, // Default scroll duration
        });
      }
      break;
    }
    case "drag": {
      if (interaction.dragDelta) {
        currentStep.actions.push({
          action: "drag",
          target: {
            type: "selector",
            selector: interaction.selector,
          },
          drag: {
            deltaX: interaction.dragDelta.deltaX,
            deltaY: interaction.dragDelta.deltaY,
            steps: Math.max(10, Math.round(interaction.dragDelta.duration / 16)), // ~60fps
          },
        });
      }
      break;
    }
  }

  console.log(`[service-worker] Interaction added to step ${state.currentStepIndex}:`, {
    actionCount: currentStep.actions.length,
    lastAction: currentStep.actions[currentStep.actions.length - 1]?.action,
  });

  saveState();
  broadcastState();
}

// Handle picker result
function handlePickerResult(result: PickerResult): void {
  state.isPicking = false;

  // Send result to side panel
  chrome.runtime.sendMessage({
    type: "PICKER_RESULT",
    result,
  }).catch(() => {
    // Ignore errors when no listeners
  });

  broadcastState();
}

// Message handler
chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender: chrome.runtime.MessageSender, sendResponse) => {
    void _sender;
    (async () => {
      try {
        switch (message.type) {
          case "START_RECORDING": {
            state.isRecording = true;
            state.isPaused = Boolean(message.isPaused);
            if (!state.currentDemo) {
              state.currentDemo = createEmptyDemo();
            }
            if (message.privacyConfig) {
              state.privacyConfig = normalizePrivacyConfig(message.privacyConfig);
            }
            if (message.selectorConfig) {
              state.selectorConfig = normalizeSelectorConfig(message.selectorConfig);
            }
            const startResult = await sendToContentScript({
              type: "START_RECORDING",
              privacyConfig: state.privacyConfig,
              selectorConfig: state.selectorConfig,
              isPaused: state.isPaused,
            });
            if (startResult === null) {
              state.lastError = {
                message: "Unable to start recording: content script not available",
                time: new Date().toISOString(),
              };
            }
            broadcastState();
            sendResponse({ success: true });
            break;
          }

          case "STOP_RECORDING": {
            state.isRecording = false;
            state.isPaused = false;
            const stopResult = await sendToContentScript({ type: "STOP_RECORDING" });
            if (stopResult === null) {
              state.lastError = {
                message: "Unable to stop recording: content script not available",
                time: new Date().toISOString(),
              };
            }
            broadcastState();
            sendResponse({ success: true });
            break;
          }

          case "START_PICKER":
            state.isPicking = true;
            await sendToContentScript({ type: "START_PICKER" });
            broadcastState();
            sendResponse({ success: true });
            break;

          case "STOP_PICKER":
            state.isPicking = false;
            await sendToContentScript({ type: "STOP_PICKER" });
            broadcastState();
            sendResponse({ success: true });
            break;

          case "INTERACTION_RECORDED":
            handleInteractionRecorded(message.interaction);
            sendResponse({ success: true });
            break;

          case "FILE_UPLOAD_RECORDED":
            // Record file upload as an upload action
            if (state.isRecording && !state.isPaused && state.currentDemo && state.currentStepIndex >= 0) {
              const currentStep = state.currentDemo.steps[state.currentStepIndex];
              if (currentStep) {
                console.log(`[service-worker] Recording file upload: ${message.fileName}`);
                currentStep.actions.push({
                  action: "upload",
                  file: message.fileName, // User will need to provide actual path
                  target: {
                    type: "selector",
                    selector: message.selector,
                  },
                });
                saveState();
                broadcastState();
              }
            }
            sendResponse({ success: true });
            break;

          case "PICKER_RESULT":
            handlePickerResult(message.result);
            sendResponse({ success: true });
            break;

          case "SUGGEST_WAITS":
            // Forward suggested waits to sidepanel
            chrome.runtime.sendMessage(message).catch(() => {
              // Ignore errors when sidepanel not listening
            });
            sendResponse({ success: true });
            break;

          case "AUTO_WAIT_DETECTED":
            // Automatically add a wait action when high-confidence DOM changes detected
            if (state.isRecording && !state.isPaused && state.currentDemo && state.currentStepIndex >= 0) {
              const currentStep = state.currentDemo.steps[state.currentStepIndex];
              if (currentStep) {
                console.log(`[service-worker] Auto-adding wait action: ${message.waitCondition.type}="${message.waitCondition.value}"`);
                currentStep.actions.push({
                  action: "wait",
                  waitFor: {
                    type: message.waitCondition.type,
                    value: message.waitCondition.value,
                    timeout: message.waitCondition.timeout,
                  },
                });
                saveState();
                broadcastState();
              }
            }
            sendResponse({ success: true });
            break;

          case "GET_STATE":
            sendResponse(state);
            break;

          case "TOGGLE_RECORDING_PAUSE":
            if (!state.isRecording) {
              sendResponse({ success: false, error: "Not recording" });
              break;
            }
            state.isPaused = !state.isPaused;
            await sendToContentScript({
              type: "SET_RECORDING_PAUSED",
              isPaused: state.isPaused,
            });
            broadcastState();
            sendResponse({ success: true, isPaused: state.isPaused });
            break;

          case "UPDATE_PRIVACY_CONFIG":
            state.privacyConfig = normalizePrivacyConfig(message.privacyConfig);
            await saveState();
            await sendToContentScript({
              type: "UPDATE_PRIVACY_CONFIG",
              privacyConfig: state.privacyConfig,
            });
            broadcastState();
            sendResponse({ success: true });
            break;

          case "UPDATE_SELECTOR_CONFIG":
            state.selectorConfig = normalizeSelectorConfig(message.selectorConfig);
            await saveState();
            await sendToContentScript({
              type: "UPDATE_SELECTOR_CONFIG",
              selectorConfig: state.selectorConfig,
            });
            broadcastState();
            sendResponse({ success: true });
            break;

          case "CLEAR_ERROR":
            state.lastError = undefined;
            broadcastState();
            sendResponse({ success: true });
            break;

          case "UPDATE_DEMO":
            {
              const parsed = safeParseDemoDefinition(message.demo);
              if (!parsed.success) {
                console.warn(
                  "[service-worker] Rejected invalid demo update:",
                  formatValidationError(parsed.error)
                );
                state.lastError = {
                  message: "Invalid demo update",
                  time: new Date().toISOString(),
                };
                broadcastState();
                sendResponse({ success: false, error: "Invalid demo update" });
                break;
              }
              const demo = parsed.data;
              state.currentDemo = demo;
              // Keep currentStepIndex valid but don't change it unless necessary
              if (state.currentStepIndex >= demo.steps.length) {
                state.currentStepIndex = Math.max(0, demo.steps.length - 1);
              }
              await saveState();
              broadcastState();
              sendResponse({ success: true });
            }
            break;

          case "SET_CURRENT_STEP":
            state.currentStepIndex = message.stepIndex;
            broadcastState();
            sendResponse({ success: true });
            break;

          case "TEST_SELECTOR": {
            const result = await sendToContentScript({
              type: "TEST_SELECTOR",
              selector: message.selector,
            }) as TestSelectorResponse | null;
            sendResponse(result || { found: false, count: 0 });
            break;
          }

          case "HIGHLIGHT_ELEMENT":
            await sendToContentScript({
              type: "HIGHLIGHT_ELEMENT",
              selector: message.selector,
            });
            sendResponse({ success: true });
            break;

          case "CLEAR_HIGHLIGHT":
            await sendToContentScript({ type: "CLEAR_HIGHLIGHT" });
            sendResponse({ success: true });
            break;

          case "PLAY_ACTION": {
            const playResult = await sendToContentScript({
              type: "PLAY_ACTION",
              action: message.action,
            });
            sendResponse(playResult || { success: false, error: "No response from content script" });
            break;
          }

          case "PLAY_STEP": {
            const stepResult = await sendToContentScript({
              type: "PLAY_STEP",
              actions: message.actions,
              stepId: message.stepId,
              stepIndex: message.stepIndex,
            });
            sendResponse(stepResult || { success: false, error: "No response from content script", completedActions: 0, totalActions: message.actions.length });
            break;
          }

          default:
            sendResponse({ error: "Unknown message type" });
        }
      } catch (error) {
        console.error("[service-worker] Error handling message:", error);
        state.lastError = {
          message: String(error),
          time: new Date().toISOString(),
        };
        broadcastState();
        sendResponse({ error: String(error) });
      }
    })();

    // Return true to indicate we'll send a response asynchronously
    return true;
  }
);

// Handle extension icon click - open side panel
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
});

// Handle tab navigation - re-inject content script if needed
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && state.isRecording && !state.isPaused && isInjectableUrl(tab.url)) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content-script.js"],
      });
      // Re-enable recording on the new page
      chrome.tabs.sendMessage(tabId, {
        type: "START_RECORDING",
        privacyConfig: state.privacyConfig,
        selectorConfig: state.selectorConfig,
        isPaused: state.isPaused,
      }).catch(() => {});
    } catch {
      // Silently ignore - page may not allow injection
    }
  }
});

// Initialize on load
initializeState();

console.log("[service-worker] SceneForge service worker initialized");

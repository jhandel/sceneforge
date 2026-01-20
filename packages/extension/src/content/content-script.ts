/**
 * Content script for SceneForge.
 * Captures user interactions and handles element picking.
 */

/* eslint-disable no-inner-declarations */

import {
  generateSelectorCandidates,
  getBestSelector,
  getElementInfo,
  testSelector,
  setSelectorConfig,
} from "./selector-generator";
import { startPicker, stopPicker } from "./element-picker";
import {
  showRecordingIndicator,
  hideRecordingIndicator,
  setRecordingIndicatorPaused,
  flashClick,
  highlightElement,
  clearHighlight,
  showDetectingIndicator,
  hideDetectingIndicator,
  onSkipDetection,
} from "./highlight-overlay";
import {
  waitForElement,
  DOMChangeDetector,
  type DetectedChange,
} from "./smart-wait";
import {
  showPlaybackUI,
  updatePlaybackProgress,
  showPlaybackSuccess,
  showPlaybackError,
  formatActionText,
} from "./playback-ui";
import type {
  PrivacyConfig,
  RecordedInteraction,
  SelectorConfig,
  TestSelectorResponse,
} from "../shared/types";
import type { ExtensionMessage } from "../shared/messages";
import { DEFAULT_PRIVACY_CONFIG, normalizePrivacyConfig } from "../shared/privacy";
import { DEFAULT_SELECTOR_CONFIG, normalizeSelectorConfig } from "../shared/selector-config";

// Guard against duplicate injection - check before any initialization
const windowWithGuard = window as unknown as { __demoYamlCreatorLoaded?: boolean };
if (windowWithGuard.__demoYamlCreatorLoaded) {
  console.log("[content-script] Already loaded, skipping duplicate injection");
} else {
  windowWithGuard.__demoYamlCreatorLoaded = true;

  // State
  let isRecording = false;
  let isPaused = false;
  let privacyConfig: PrivacyConfig = { ...DEFAULT_PRIVACY_CONFIG };
  let selectorConfig: SelectorConfig = { ...DEFAULT_SELECTOR_CONFIG };
  let lastNavigationUrl = window.location.href;
  let lastDetectionStart = 0;
  const DETECTION_COOLDOWN_MS = 800;

  // DOM change detector for recording (to suggest wait conditions)
  let recordingChangeDetector: DOMChangeDetector | null = null;

  // Playback options
  interface PlaybackOptions {
    autoWait?: boolean; // Wait for elements before acting
    detectChanges?: boolean; // Detect DOM changes after actions
    stabilizationTime?: number; // How long to wait for DOM to stabilize
  }
  const defaultPlaybackOptions: PlaybackOptions = {
    autoWait: true,
    detectChanges: true,
    stabilizationTime: 500,
  };

  // Drag tracking state
  let isDragging = false;
  let dragStartElement: Element | null = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartTime = 0;
  let lastMouseX = 0;
  let lastMouseY = 0;

  // Scroll tracking state
  let scrollTimeout: number | null = null;
  let lastScrollTop = 0;
  let lastScrollLeft = 0;
  let scrollStartTop = 0;
  let scrollStartLeft = 0;

  // Track last pointer down to detect if click was suppressed
  let pendingPointerInteraction: RecordedInteraction | null = null;

  // Debounce tracking to prevent duplicate clicks
  let lastClickTime = 0;
  let lastClickSelector = "";
  let lastClickX = 0;
  let lastClickY = 0;
  const CLICK_DEBOUNCE_MS = 300; // Ignore same-element clicks within 300ms
  const CLICK_POSITION_THRESHOLD = 50; // If click is more than 50px away, it's a different element
  const PAUSE_HOTKEY = { key: "p", ctrlKey: true, shiftKey: true };

  /**
   * Sends a recorded interaction to the service worker.
   * Also starts DOM change detection to suggest wait conditions.
   */
  function sendInteraction(interaction: RecordedInteraction): void {
    console.log(`[content-script] Sending interaction:`, {
      type: interaction.type,
      selector: interaction.selector?.slice(0, 50),
    });

    chrome.runtime.sendMessage({
      type: "INTERACTION_RECORDED",
      interaction,
    }).then((response) => {
      console.log(`[content-script] Interaction sent successfully:`, response);
    }).catch((error) => {
      console.error("[content-script] Failed to send interaction:", error);
    });

    // Start DOM change detection for all meaningful interactions
    // Skip scroll and drag as they typically don't trigger async UI updates
    if (interaction.type === "click" || interaction.type === "input" || interaction.type === "navigation") {
      detectChangesAfterInteraction(interaction.timestamp, interaction.type);
    }
  }

  function updatePrivacyConfig(config: PrivacyConfig): void {
    privacyConfig = normalizePrivacyConfig(config);
  }

  function updateSelectorConfig(config: SelectorConfig): void {
    selectorConfig = normalizeSelectorConfig(config);
    setSelectorConfig(selectorConfig);
  }

  function matchesSelectorList(target: Element, selectors: string[]): boolean {
    for (const selector of selectors) {
      if (!selector.trim()) continue;
      try {
        if (target.matches(selector) || target.closest(selector)) {
          return true;
        }
      } catch (error) {
        console.warn(`[content-script] Invalid selector in privacy list: ${selector}`, error);
      }
    }
    return false;
  }

  const SENSITIVE_FIELD_KEYWORDS = [
    "password",
    "passcode",
    "secret",
    "token",
    "api",
    "key",
    "auth",
    "otp",
    "2fa",
    "ssn",
    "social",
    "credit",
    "card",
    "cvv",
    "cvc",
    "pin",
    "bank",
    "routing",
    "iban",
  ];

  function hasSensitiveKeyword(value: string | null | undefined): boolean {
    if (!value) return false;
    const lower = value.toLowerCase();
    return SENSITIVE_FIELD_KEYWORDS.some((keyword) => lower.includes(keyword));
  }

  function isSensitiveInput(
    target: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  ): boolean {
    if (target instanceof HTMLInputElement) {
      if (target.type === "password") return true;
      const autocomplete = target.getAttribute("autocomplete") || "";
      if (autocomplete.toLowerCase().includes("password")) return true;
    }
    return (
      hasSensitiveKeyword(target.name) ||
      hasSensitiveKeyword(target.id) ||
      hasSensitiveKeyword(target.getAttribute("aria-label")) ||
      hasSensitiveKeyword(target.getAttribute("placeholder"))
    );
  }

  function shouldSkipInput(
    target: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  ): boolean {
    if (privacyConfig.allowlist.length > 0 && !matchesSelectorList(target, privacyConfig.allowlist)) {
      return true;
    }
    if (privacyConfig.denylist.length > 0 && matchesSelectorList(target, privacyConfig.denylist)) {
      return true;
    }
    if (privacyConfig.redactSensitiveInputs && isSensitiveInput(target)) {
      return true;
    }
    return false;
  }

  function setPausedState(paused: boolean): void {
    isPaused = paused;
    if (isPaused && recordingChangeDetector) {
      recordingChangeDetector.stop();
      recordingChangeDetector = null;
      hideDetectingIndicator();
    }
    updateRecordingIndicatorState();
  }

  function updateRecordingIndicatorState(): void {
    if (!isRecording) return;
    showRecordingIndicator();
    setRecordingIndicatorPaused(isPaused);
  }

  function handlePauseHotkey(event: KeyboardEvent): void {
    if (!isRecording) return;
    if (event.key.toLowerCase() !== PAUSE_HOTKEY.key) return;
    if (event.ctrlKey !== PAUSE_HOTKEY.ctrlKey || event.shiftKey !== PAUSE_HOTKEY.shiftKey) {
      return;
    }
    event.preventDefault();
    chrome.runtime.sendMessage({ type: "TOGGLE_RECORDING_PAUSE" }).then((response) => {
      if (response && typeof response.isPaused === "boolean") {
        setPausedState(response.isPaused);
      }
    }).catch((error) => {
      console.error("[content-script] Failed to toggle pause:", error);
    });
  }

  /**
   * Detects DOM changes after an interaction and suggests wait conditions.
   * High-confidence suggestions are automatically recorded as wait actions.
   * Shows a visual indicator so the user knows detection is in progress.
   */
  async function detectChangesAfterInteraction(
    timestamp: number,
    interactionType: string
  ): Promise<void> {
    const now = Date.now();
    if (now - lastDetectionStart < DETECTION_COOLDOWN_MS) {
      console.log(
        `[content-script] Skipping DOM detection (cooldown ${DETECTION_COOLDOWN_MS}ms)`
      );
      return;
    }

    // If a detection is already running, don't start a new one
    // This prevents rapid clicks from cancelling each other's detection
    if (recordingChangeDetector) {
      console.log(`[content-script] DOM detection already in progress, skipping for ${interactionType}`);
      return;
    }

    lastDetectionStart = now;

    // Start a new detector
    recordingChangeDetector = new DOMChangeDetector();
    recordingChangeDetector.start();

    console.log(`[content-script] Detecting DOM changes after ${interactionType}...`);

    // Show the detecting indicator so user knows we're waiting
    showDetectingIndicator(interactionType);

    // Track if user skipped detection
    let skipped = false;

    // Set up skip handler
    onSkipDetection(() => {
      console.log(`[content-script] User skipped DOM detection`);
      skipped = true;
      if (recordingChangeDetector) {
        recordingChangeDetector.stop();
        recordingChangeDetector = null;
      }
      hideDetectingIndicator();
    });

    // Different timeouts based on interaction type
    // File uploads and clicks might trigger API calls, so give more time
    const stabilizationTime = interactionType === "file-upload" ? 1000 : 500;
    let maxWait: number;
    switch (interactionType) {
      case "file-upload":
        maxWait = 30000; // 30s for file processing (can be slow)
        break;
      case "click":
        maxWait = 10000; // 10s for clicks (might trigger modals, API calls)
        break;
      default:
        maxWait = 5000; // 5s for input, navigation
    }

    // Wait for DOM to stabilize
    const result = await recordingChangeDetector.waitForStabilization(stabilizationTime, maxWait);

    recordingChangeDetector = null;
    hideDetectingIndicator();

    // If user skipped, don't process results
    if (skipped) {
      return;
    }

    // If we found significant changes, send them as suggestions
    if (result.suggestedWaits.length > 0) {
      console.log(`[content-script] Found ${result.suggestedWaits.length} suggested waits after ${interactionType}:`, result.suggestedWaits);

      // Find the best (highest confidence) suggestion
      const bestSuggestion = result.suggestedWaits[0]; // Already sorted by confidence

      // Auto-record a wait action for medium-to-high confidence suggestions
      // Lower threshold to catch more meaningful changes
      if (bestSuggestion.confidence >= 0.4) {
        console.log(`[content-script] Auto-recording wait for: ${bestSuggestion.type}="${bestSuggestion.value}" (confidence: ${bestSuggestion.confidence})`);

        // Send as a "suggested wait" interaction that service worker will add as a wait action
        chrome.runtime.sendMessage({
          type: "AUTO_WAIT_DETECTED",
          waitCondition: {
            type: bestSuggestion.type,
            value: bestSuggestion.value,
            timeout: 15000,
          },
          description: bestSuggestion.description,
          confidence: bestSuggestion.confidence,
          forInteractionTimestamp: timestamp,
        }).catch((error) => {
          console.error("[content-script] Failed to send auto-wait:", error);
        });
      }

      // Also send all suggestions to sidepanel for display
      chrome.runtime.sendMessage({
        type: "SUGGEST_WAITS",
        suggestedWaits: result.suggestedWaits.map(sw => ({
          type: sw.type,
          value: sw.value,
          description: sw.description,
          confidence: sw.confidence,
        })),
        forInteractionTimestamp: timestamp,
      }).catch((error) => {
        console.error("[content-script] Failed to send suggested waits:", error);
      });
    } else {
      console.log(`[content-script] No significant DOM changes detected after ${interactionType}`);
    }
  }

  /**
   * Finds the best clickable element, walking up from non-interactive children
   * (like span/svg inside buttons) to find the actual interactive parent.
   */
  function findClickableElement(element: Element): Element {
    const interactiveTags = ["button", "a", "input", "select", "textarea", "label"];
    const interactiveRoles = [
      "button", "link", "menuitem", "menuitemcheckbox", "menuitemradio",
      "option", "radio", "checkbox", "switch", "tab", "combobox",
      "listbox", "slider", "spinbutton", "searchbox", "textbox"
    ];

    let current: Element | null = element;
    let depth = 0;

    // Walk up to find an interactive element (max 5 levels)
    while (current && depth < 5) {
      const tagName = current.tagName.toLowerCase();
      const role = current.getAttribute("role");

      // Check if this element is interactive
      if (interactiveTags.includes(tagName)) {
        return current;
      }
      if (role && interactiveRoles.includes(role)) {
        return current;
      }
      if (current.hasAttribute("tabindex") || current.hasAttribute("onclick")) {
        return current;
      }

      current = current.parentElement;
      depth++;
    }

    // No interactive ancestor found, return original element
    return element;
  }

  /**
   * Gets the real clickable element at a point, skipping overlays and html/body.
   * If the element at the point is non-interactive (like span/svg inside a button),
   * walks up to find the nearest interactive ancestor.
   * Returns both the element and debug info.
   */
  function getRealElementAtPoint(x: number, y: number, debug = false): { element: Element | null; debugInfo: string[] } {
    const elements = document.elementsFromPoint(x, y);
    const debugInfo: string[] = [];

    if (debug) {
      debugInfo.push(`[getRealElementAtPoint] Found ${elements.length} elements at (${x}, ${y})`);
    }

    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      const tagName = element.tagName.toLowerCase();
      const id = element.id ? `#${element.id}` : "";
      const classes = element.className && typeof element.className === "string"
        ? `.${element.className.split(" ").slice(0, 2).join(".")}`
        : "";
      const desc = `${tagName}${id}${classes}`.slice(0, 60);

      // Skip our overlay elements
      if (
        element.id?.startsWith("sceneforge") ||
        element.closest("#sceneforge-overlay")
      ) {
        if (debug) debugInfo.push(`  [${i}] SKIP (overlay): ${desc}`);
        continue;
      }

      // Skip html, body, script, style
      if (tagName === "html" || tagName === "body" || tagName === "script" || tagName === "style") {
        if (debug) debugInfo.push(`  [${i}] SKIP (${tagName}): ${desc}`);
        continue;
      }

      // Found a valid element - try to find the best clickable ancestor
      const clickable = findClickableElement(element);
      if (clickable !== element) {
        const clickableTag = clickable.tagName.toLowerCase();
        const clickableRole = clickable.getAttribute("role") || "";
        if (debug) debugInfo.push(`  [${i}] Found ${desc}, walked up to: ${clickableTag}[role="${clickableRole}"]`);
      } else {
        if (debug) debugInfo.push(`  [${i}] SELECTED: ${desc}`);
      }
      return { element: clickable, debugInfo };
    }

    if (debug) debugInfo.push(`  No valid element found!`);
    return { element: null, debugInfo };
  }

  /**
   * Handles pointerdown events - fires before click and is more reliable.
   */
  function handlePointerDown(event: PointerEvent): void {
    if (!isRecording || isPaused) return;

    // Prepare interaction in case click doesn't fire
    const { element: target } = getRealElementAtPoint(event.clientX, event.clientY);
    if (!target) {
      pendingPointerInteraction = null;
      return;
    }

    const selector = getBestSelector(target);
    const candidates = generateSelectorCandidates(target);
    const elementInfo = getElementInfo(target);

    pendingPointerInteraction = {
      type: "click",
      timestamp: Date.now(),
      selector,
      selectorCandidates: candidates,
      elementInfo,
    };

    console.log(`[content-script] Pointerdown prepared:`, {
      selector,
      tagName: elementInfo.tagName,
    });

    // Set a timeout to check if click fired - only use if click was suppressed
    const currentPending = pendingPointerInteraction;
    setTimeout(() => {
      // Only send if this exact pending interaction is still set (click didn't clear it)
      if (pendingPointerInteraction === currentPending && pendingPointerInteraction !== null) {
        console.log(`[content-script] Click was suppressed, using pointerdown interaction`);
        flashClick(event.clientX, event.clientY);
        sendInteraction(pendingPointerInteraction);
        pendingPointerInteraction = null;
      }
    }, 100);
  }

  /**
   * Handles click events during recording.
   */
  function handleClick(event: MouseEvent): void {
    // Save the pending interaction BEFORE clearing it - we may need it as a fallback
    const savedPendingInteraction = pendingPointerInteraction;
    const hadPending = pendingPointerInteraction !== null;
    pendingPointerInteraction = null; // Clear to prevent duplicate from timeout

    const eventTarget = event.target as Element;
    const eventTargetDesc = eventTarget
      ? `${eventTarget.tagName?.toLowerCase()}${eventTarget.id ? "#" + eventTarget.id : ""}`
      : "null";

    console.log(`[content-script] Click detected:`, {
      isRecording,
      clientX: event.clientX,
      clientY: event.clientY,
      eventTarget: eventTargetDesc,
      eventPhase: event.eventPhase,
      isTrusted: event.isTrusted,
      hadPendingPointerInteraction: hadPending,
    });

    if (!isRecording || isPaused) {
      console.log(`[content-script] Click ignored: not recording`);
      return;
    }

    // Get the real element at the click point with debug info
    const { element: target, debugInfo } = getRealElementAtPoint(event.clientX, event.clientY, true);

    // Log debug info
    debugInfo.forEach(line => console.log(line));

    // If getRealElementAtPoint failed but we have a pending pointerdown interaction, use that
    if (!target) {
      if (savedPendingInteraction) {
        // Check debounce for fallback too - prevent duplicate rapid clicks
        const now = Date.now();
        const distanceFromLastClick = Math.sqrt(
          Math.pow(event.clientX - lastClickX, 2) + Math.pow(event.clientY - lastClickY, 2)
        );
        const isSamePosition = distanceFromLastClick < CLICK_POSITION_THRESHOLD;

        if (savedPendingInteraction.selector === lastClickSelector && now - lastClickTime < CLICK_DEBOUNCE_MS && isSamePosition) {
          console.log(`[content-script] Click (fallback) ignored: duplicate within ${CLICK_DEBOUNCE_MS}ms at same position`);
          return;
        }

        console.log(`[content-script] Click: elementsFromPoint failed, using pointerdown fallback:`, savedPendingInteraction.selector);

        // Update debounce tracking for the fallback interaction
        lastClickTime = now;
        lastClickSelector = savedPendingInteraction.selector;
        lastClickX = event.clientX;
        lastClickY = event.clientY;

        flashClick(event.clientX, event.clientY);
        sendInteraction(savedPendingInteraction);
        return;
      }
      console.log(`[content-script] Click ignored: no valid target element found and no pointerdown fallback`);
      return;
    }

    // Get element info and selectors
    const selector = getBestSelector(target);
    const candidates = generateSelectorCandidates(target);
    const elementInfo = getElementInfo(target);

    // Debounce: ignore duplicate clicks on the same element within 300ms
    // But allow clicks on different elements with the same selector (e.g., multiple buttons with same text)
    const now = Date.now();
    const distanceFromLastClick = Math.sqrt(
      Math.pow(event.clientX - lastClickX, 2) + Math.pow(event.clientY - lastClickY, 2)
    );
    const isSamePosition = distanceFromLastClick < CLICK_POSITION_THRESHOLD;

    if (selector === lastClickSelector && now - lastClickTime < CLICK_DEBOUNCE_MS && isSamePosition) {
      console.log(`[content-script] Click ignored: duplicate within ${CLICK_DEBOUNCE_MS}ms at same position`);
      return;
    }
    lastClickTime = now;
    lastClickSelector = selector;
    lastClickX = event.clientX;
    lastClickY = event.clientY;

    console.log(`[content-script] Recording click:`, {
      selector,
      tagName: elementInfo.tagName,
      ariaLabel: elementInfo.ariaLabel,
      className: elementInfo.className?.slice(0, 50),
    });

    // Visual feedback
    flashClick(event.clientX, event.clientY);

    // Record the interaction
    const interaction: RecordedInteraction = {
      type: "click",
      timestamp: Date.now(),
      selector,
      selectorCandidates: candidates,
      elementInfo,
    };

    sendInteraction(interaction);
  }

  /**
   * Handles change events for input fields.
   */
  function handleChange(event: Event): void {
    if (!isRecording || isPaused) return;

    const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (!target) return;

    // Skip our own overlay elements
    if (
      target.id?.startsWith("sceneforge") ||
      target.closest("#sceneforge-overlay")
    ) {
      return;
    }

    // Skip file inputs - they're handled separately by handleFileInputChange
    // and shouldn't be recorded as "type" actions
    if (target instanceof HTMLInputElement && target.type === "file") {
      return;
    }

    if (shouldSkipInput(target)) {
      console.log("[content-script] Skipping sensitive input field");
      return;
    }

    // Get the value
    const value = target.value;
    if (!value) return;

    // Get element info and selectors
    const selector = getBestSelector(target);
    const candidates = generateSelectorCandidates(target);
    const elementInfo = getElementInfo(target);

    // Record the interaction
    const interaction: RecordedInteraction = {
      type: "input",
      timestamp: Date.now(),
      selector,
      selectorCandidates: candidates,
      elementInfo,
      value,
    };

    sendInteraction(interaction);
  }

  /**
   * Handles scroll events during recording.
   * Debounces to capture the complete scroll action.
   */
  function handleScroll(): void {
    if (!isRecording || isPaused) return;

    const currentScrollTop = window.scrollY || document.documentElement.scrollTop;
    const currentScrollLeft = window.scrollX || document.documentElement.scrollLeft;

    // Start tracking a new scroll action
    if (scrollTimeout === null) {
      scrollStartTop = lastScrollTop;
      scrollStartLeft = lastScrollLeft;
    }

    // Clear existing timeout
    if (scrollTimeout !== null) {
      window.clearTimeout(scrollTimeout);
    }

    // Set a debounce timeout to capture when scrolling stops
    scrollTimeout = window.setTimeout(() => {
      const deltaY = currentScrollTop - scrollStartTop;
      const deltaX = currentScrollLeft - scrollStartLeft;

      // Record scrolls more than 10px (captures small scrolls in overflow containers)
      if (Math.abs(deltaY) > 10 || Math.abs(deltaX) > 10) {
        const interaction: RecordedInteraction = {
          type: "scroll",
          timestamp: Date.now(),
          selector: "",
          selectorCandidates: [],
          elementInfo: {
            tagName: "window",
            boundingRect: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight },
          },
          scrollDelta: { deltaX, deltaY },
        };
        sendInteraction(interaction);
      }

      scrollTimeout = null;
    }, 150); // Wait 150ms after last scroll event

    lastScrollTop = currentScrollTop;
    lastScrollLeft = currentScrollLeft;
  }

  /**
   * Handles mousedown events for drag detection.
   */
  function handleMouseDown(event: MouseEvent): void {
    if (!isRecording || isPaused) return;

    // Get the real element at the mousedown point
    const { element: target } = getRealElementAtPoint(event.clientX, event.clientY);
    if (!target) return;

    // Track potential drag start
    dragStartElement = target;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragStartTime = Date.now();
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
    isDragging = false;
  }

  /**
   * Handles mousemove events for drag detection.
   */
  function handleMouseMove(event: MouseEvent): void {
    if (!isRecording || isPaused || !dragStartElement) return;

    const deltaX = event.clientX - dragStartX;
    const deltaY = event.clientY - dragStartY;

    // Consider it a drag if moved more than 10 pixels
    if (!isDragging && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
      isDragging = true;
    }

    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
  }

  /**
   * Handles mouseup events for drag detection.
   */
  function handleMouseUp(_event: MouseEvent): void {
    if (!isRecording || isPaused || !dragStartElement) {
      resetDragState();
      return;
    }

    // If we detected a drag, record it
    if (isDragging) {
      const deltaX = lastMouseX - dragStartX;
      const deltaY = lastMouseY - dragStartY;
      const duration = Date.now() - dragStartTime;

      // Get selector for the dragged element
      const selector = getBestSelector(dragStartElement);
      const candidates = generateSelectorCandidates(dragStartElement);
      const elementInfo = getElementInfo(dragStartElement);

      const interaction: RecordedInteraction = {
        type: "drag",
        timestamp: dragStartTime,
        selector,
        selectorCandidates: candidates,
        elementInfo,
        dragDelta: { deltaX, deltaY, duration },
      };

      sendInteraction(interaction);
    }

    resetDragState();
  }

  /**
   * Resets drag tracking state.
   */
  function resetDragState(): void {
    isDragging = false;
    dragStartElement = null;
    dragStartX = 0;
    dragStartY = 0;
    dragStartTime = 0;
  }

  /**
   * Watches for URL changes and records navigation events.
   */
  function watchNavigation(): void {
    const checkNavigation = () => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastNavigationUrl) {
        lastNavigationUrl = currentUrl;

        if (isRecording && !isPaused) {
          const interaction: RecordedInteraction = {
            type: "navigation",
            timestamp: Date.now(),
            selector: "",
            selectorCandidates: [],
            elementInfo: {
              tagName: "window",
              boundingRect: { x: 0, y: 0, width: 0, height: 0 },
            },
            url: currentUrl,
          };
          sendInteraction(interaction);
        }
      }
    };

    // Check on popstate
    window.addEventListener("popstate", checkNavigation);

    // Also poll for SPA navigation
    setInterval(checkNavigation, 500);
  }

  /**
   * Handles file input changes during recording.
   * This catches file uploads triggered by button clicks that open file pickers.
   * Records the upload as an action AND detects DOM changes after.
   */
  function handleFileInputChange(event: Event): void {
    if (!isRecording || isPaused) return;

    const target = event.target as HTMLInputElement;
    if (!target || target.type !== "file") return;

    // Skip our own overlay elements
    if (target.closest("#sceneforge-overlay")) return;

    if (shouldSkipInput(target)) {
      console.log("[content-script] Skipping sensitive file input");
      return;
    }

    const files = target.files;
    if (!files || files.length === 0) return;

    const fileName = files[0].name;
    console.log(`[content-script] File input changed: ${fileName}`);

    // Get selector for the file input
    const selector = getBestSelector(target);
    const elementInfo = getElementInfo(target);

    console.log(`[content-script] Recording file upload: ${fileName}, selector: ${selector}`);

    // Send the file upload interaction
    chrome.runtime.sendMessage({
      type: "FILE_UPLOAD_RECORDED",
      fileName,
      selector,
      elementInfo,
    }).then(() => {
      console.log(`[content-script] File upload recorded successfully`);
    }).catch((error) => {
      console.error("[content-script] Failed to record file upload:", error);
    });

    // Start DOM change detection - file processing often updates the UI
    // Use a longer timeout since file processing can take time
    detectChangesAfterInteraction(Date.now(), "file-upload");
  }

  /**
   * Starts recording user interactions.
   */
  function startRecording(): void {
    if (isRecording) return;

    isRecording = true;
    isPaused = false;
    showRecordingIndicator();
    setRecordingIndicatorPaused(false);

    // Initialize scroll tracking
    lastScrollTop = window.scrollY || document.documentElement.scrollTop;
    lastScrollLeft = window.scrollX || document.documentElement.scrollLeft;

    // Add event listeners
    document.addEventListener("pointerdown", handlePointerDown, { capture: true });
    document.addEventListener("click", handleClick, { capture: true });
    document.addEventListener("change", handleChange, { capture: true });
    document.addEventListener("change", handleFileInputChange, { capture: true }); // For file inputs
    window.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    document.addEventListener("mousedown", handleMouseDown, { capture: true });
    document.addEventListener("mousemove", handleMouseMove, { capture: true });
    document.addEventListener("mouseup", handleMouseUp, { capture: true });
    document.addEventListener("keydown", handlePauseHotkey, { capture: true });

    console.log("[content-script] Recording started");
  }

  /**
   * Stops recording user interactions.
   */
  function stopRecording(): void {
    if (!isRecording) return;

    isRecording = false;
    isPaused = false;
    hideRecordingIndicator();

    // Remove event listeners
    document.removeEventListener("pointerdown", handlePointerDown, { capture: true });
    document.removeEventListener("click", handleClick, { capture: true });
    document.removeEventListener("change", handleChange, { capture: true });
    document.removeEventListener("change", handleFileInputChange, { capture: true });
    window.removeEventListener("scroll", handleScroll, { capture: true });
    document.removeEventListener("mousedown", handleMouseDown, { capture: true });
    document.removeEventListener("mousemove", handleMouseMove, { capture: true });
    document.removeEventListener("mouseup", handleMouseUp, { capture: true });
    document.removeEventListener("keydown", handlePauseHotkey, { capture: true });

    // Clear any pending pointer interaction
    pendingPointerInteraction = null;

    // Stop any running DOM change detector
    if (recordingChangeDetector) {
      recordingChangeDetector.stop();
      recordingChangeDetector = null;
    }

    // Clear any pending scroll timeout
    if (scrollTimeout !== null) {
      window.clearTimeout(scrollTimeout);
      scrollTimeout = null;
    }

    // Reset drag state
    resetDragState();

    console.log("[content-script] Recording stopped");
  }

  /**
   * Tests a selector and returns results.
   */
  function handleTestSelector(selector: string): TestSelectorResponse {
    const result = testSelector(selector);
    return {
      found: result.found,
      count: result.count,
      elementInfo: result.elements[0]
        ? {
            tagName: result.elements[0].tagName.toLowerCase(),
            textContent: result.elements[0].textContent?.trim().slice(0, 50),
          }
        : undefined,
    };
  }

  /**
   * Highlights elements matching a selector.
   */
  function handleHighlightElement(selector: string): void {
    const result = testSelector(selector);
    if (result.found && result.elements[0]) {
      highlightElement(result.elements[0], selector);
    }
  }

  /**
   * Finds an element using Playwright-style selector.
   */
  function findElement(selector: string): Element | null {
    const result = testSelector(selector);
    return result.found ? result.elements[0] : null;
  }

  /**
   * Extended action result with suggested waits.
   */
  interface ActionResult {
    success: boolean;
    error?: string;
    suggestedWaits?: DetectedChange[];
    waitedForElement?: number; // ms waited for element
  }

  /**
   * Auto-waits for an element before an action.
   * Returns the element if found, or an error result.
   */
  async function autoWaitForElement(
    selector: string,
    options: PlaybackOptions = defaultPlaybackOptions
  ): Promise<{ element: Element | null; waitedMs: number; error?: string }> {
    if (!options.autoWait) {
      const element = findElement(selector);
      return { element, waitedMs: 0 };
    }

    console.log(`[content-script] Auto-waiting for element: ${selector}`);
    const result = await waitForElement(selector, {
      timeout: 10000,
      visible: true,
      enabled: true,
    });

    if (result.found && result.element) {
      console.log(`[content-script] Element found after ${result.waitedMs}ms`);
      return { element: result.element, waitedMs: result.waitedMs };
    }

    return { element: null, waitedMs: result.waitedMs, error: result.error };
  }

  /**
   * Plays a single action on the page with smart waiting.
   */
  async function playAction(
    action: import("../shared/types").DemoAction,
    options: PlaybackOptions = defaultPlaybackOptions
  ): Promise<ActionResult> {
    try {
      switch (action.action) {
        case "click": {
          if (!action.target?.selector) {
            return { success: false, error: "No selector specified" };
          }

          // Auto-wait for element
          const { element, waitedMs, error } = await autoWaitForElement(action.target.selector, options);
          if (!element) {
            return { success: false, error: error || `Element not found: ${action.target.selector}` };
          }

          // Highlight briefly before clicking
          if (action.highlight) {
            highlightElement(element, action.target.selector);
            await new Promise(r => setTimeout(r, 500));
          }

          // Start DOM change detection before the click
          const detector = options.detectChanges ? new DOMChangeDetector() : null;
          detector?.start();

          // Get element position for coordinate-based clicking
          const rect = element.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;

          // Debug logging for portal click issues
          console.log(`[playAction] Click target:`, {
            selector: action.target.selector,
            tagName: element.tagName,
            textContent: element.textContent?.slice(0, 50),
            rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
            center: { x: centerX, y: centerY },
            inViewport: centerX >= 0 && centerY >= 0 && centerX <= window.innerWidth && centerY <= window.innerHeight,
          });

          // Flash click visual
          flashClick(centerX, centerY);

          // For inputs, textareas, and comboboxes, focus first to trigger onFocus handlers
          // This is important for React components that open dropdowns on focus (like autocompletes)
          const htmlElement = element as HTMLElement;
          const tagName = element.tagName.toLowerCase();
          const role = element.getAttribute("role");
          const isInputLike = tagName === "input" || tagName === "textarea" || tagName === "select";
          const isCombobox = role === "combobox" || role === "listbox" || role === "searchbox";

          if (isInputLike || isCombobox) {
            // Focus first to trigger React onFocus handlers
            htmlElement.focus();
            // Dispatch focus event to ensure it bubbles
            htmlElement.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
            htmlElement.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
            // Small delay to let React process the focus
            await new Promise(r => setTimeout(r, 50));
          }

          // Use coordinate-based mouse events for more reliable clicking
          // This works better for portal content than element.click()
          const mouseEventInit: MouseEventInit = {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: centerX,
            clientY: centerY,
            screenX: centerX,
            screenY: centerY,
            button: 0,
            buttons: 1,
          };

          // Dispatch full mouse event sequence (more reliable for React/Radix)
          htmlElement.dispatchEvent(new MouseEvent("mousedown", mouseEventInit));
          htmlElement.dispatchEvent(new MouseEvent("mouseup", mouseEventInit));
          htmlElement.dispatchEvent(new MouseEvent("click", mouseEventInit));

          clearHighlight();

          // Wait for DOM to stabilize and get suggestions
          let suggestedWaits: DetectedChange[] = [];
          if (detector) {
            const result = await detector.waitForStabilization(
              options.stabilizationTime || 500,
              5000
            );
            suggestedWaits = result.suggestedWaits;
            if (suggestedWaits.length > 0) {
              console.log(`[content-script] Click triggered changes, top suggestion: ${suggestedWaits[0].type}="${suggestedWaits[0].value}"`);
            }
          }

          return { success: true, suggestedWaits, waitedForElement: waitedMs };
        }

        case "type": {
          if (!action.target?.selector) {
            return { success: false, error: "No selector specified" };
          }

          // Auto-wait for element
          const { element, waitedMs, error } = await autoWaitForElement(action.target.selector, options);
          if (!element) {
            return { success: false, error: error || `Element not found: ${action.target.selector}` };
          }

          const input = element as HTMLInputElement | HTMLTextAreaElement;
          // Focus and clear
          input.focus();
          input.value = "";
          // Type text character by character for visual effect
          const text = action.text || "";
          for (const char of text) {
            input.value += char;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            await new Promise(r => setTimeout(r, 30));
          }
          input.dispatchEvent(new Event("change", { bubbles: true }));
          return { success: true, waitedForElement: waitedMs };
        }

        case "hover": {
          if (!action.target?.selector) {
            return { success: false, error: "No selector specified" };
          }

          // Auto-wait for element
          const { element, waitedMs, error } = await autoWaitForElement(action.target.selector, options);
          if (!element) {
            return { success: false, error: error || `Element not found: ${action.target.selector}` };
          }

          highlightElement(element, action.target.selector);
          element.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
          element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
          return { success: true, waitedForElement: waitedMs };
        }

        case "wait": {
          if (action.duration) {
            await new Promise(r => setTimeout(r, action.duration));
            return { success: true };
          }
          if (action.waitFor) {
            const timeout = action.waitFor.timeout || 15000;
            const startTime = Date.now();

            while (Date.now() - startTime < timeout) {
              let conditionMet = false;

              switch (action.waitFor.type) {
                case "text":
                  conditionMet = document.body.textContent?.includes(action.waitFor.value || "") || false;
                  break;
                case "textHidden":
                  conditionMet = !document.body.textContent?.includes(action.waitFor.value || "");
                  break;
                case "selector":
                  conditionMet = findElement(action.waitFor.value || "") !== null;
                  break;
                case "selectorHidden":
                  conditionMet = findElement(action.waitFor.value || "") === null;
                  break;
                case "idle":
                  // Can't really check network idle from content script, just wait a bit
                  await new Promise(r => setTimeout(r, 1000));
                  conditionMet = true;
                  break;
              }

              if (conditionMet) {
                return { success: true };
              }
              await new Promise(r => setTimeout(r, 100));
            }
            return { success: false, error: `Timeout waiting for ${action.waitFor.type}` };
          }
          return { success: true };
        }

        case "scroll": {
          const duration = action.duration || 500;
          const startY = window.scrollY;
          const targetY = startY + window.innerHeight * 0.5;
          const startTime = Date.now();

          const animateScroll = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
            window.scrollTo(0, startY + (targetY - startY) * eased);

            if (progress < 1) {
              requestAnimationFrame(animateScroll);
            }
          };
          animateScroll();
          await new Promise(r => setTimeout(r, duration));
          return { success: true };
        }

        case "scrollTo": {
          if (!action.target?.selector) {
            return { success: false, error: "No selector specified" };
          }

          // Auto-wait for element
          const { element, waitedMs, error } = await autoWaitForElement(action.target.selector, options);
          if (!element) {
            return { success: false, error: error || `Element not found: ${action.target.selector}` };
          }

          element.scrollIntoView({ behavior: "smooth", block: "center" });
          await new Promise(r => setTimeout(r, 500));
          return { success: true, waitedForElement: waitedMs };
        }

        case "navigate": {
          if (action.path) {
            const path = action.path.replace("{baseURL}", window.location.origin);
            const targetUrl = path.startsWith("http")
              ? path
              : `${window.location.origin}${path}`;
            window.location.href = targetUrl;
            return { success: true };
          }
          return { success: false, error: "No path specified" };
        }

        case "drag": {
          if (!action.target?.selector || !action.drag) {
            return { success: false, error: "Missing selector or drag delta" };
          }

          // Auto-wait for element
          const { element, waitedMs, error } = await autoWaitForElement(action.target.selector, options);
          if (!element) {
            return { success: false, error: error || `Element not found: ${action.target.selector}` };
          }

          const rect = element.getBoundingClientRect();
          const startX = rect.left + rect.width / 2;
          const startY = rect.top + rect.height / 2;

          // Dispatch drag events
          element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: startX, clientY: startY }));

          const steps = action.drag.steps || 10;
          for (let i = 1; i <= steps; i++) {
            const progress = i / steps;
            const x = startX + action.drag.deltaX * progress;
            const y = startY + action.drag.deltaY * progress;
            document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: x, clientY: y }));
            await new Promise(r => setTimeout(r, 16));
          }

          document.dispatchEvent(new MouseEvent("mouseup", {
            bubbles: true,
            clientX: startX + action.drag.deltaX,
            clientY: startY + action.drag.deltaY
          }));
          return { success: true, waitedForElement: waitedMs };
        }

        case "upload": {
          // Upload action - matches CLI behavior: finds first input[type="file"] automatically
          // Due to browser security, we can only trigger the file picker from a direct user click.
          // Playwright uses setInputFiles() which bypasses this, but content scripts cannot.
          // We show a button for the user to click to open the file picker.
          if (!action.file) {
            return { success: false, error: "Upload action missing 'file'" };
          }

          // Find the file input - use target selector if provided, otherwise find first file input (CLI behavior)
          let fileInput: Element | null = null;
          if (action.target?.selector) {
            fileInput = findElement(action.target.selector);
            // If the element isn't a file input, look for one inside it
            if (fileInput && !(fileInput instanceof HTMLInputElement && fileInput.type === "file")) {
              fileInput = fileInput.querySelector('input[type="file"]');
            }
          } else {
            // CLI behavior: just find the first file input on the page
            fileInput = document.querySelector('input[type="file"]');
          }

          if (!fileInput) {
            return { success: false, error: "No file input found on page. Make sure the upload UI is visible." };
          }

          const inputElement = fileInput as HTMLInputElement;
          const fileName = action.file.split("/").pop() || action.file;

          console.log(`[content-script] Upload action: looking for file "${fileName}"`);

          // Create a prominent overlay with a button the user must click
          // This is required because file pickers can only open from direct user interaction
          const overlay = document.createElement('div');
          overlay.id = 'sceneforge-upload-overlay';
          overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 2147483647;
            font-family: system-ui, -apple-system, sans-serif;
          `;

          const modal = document.createElement('div');
          modal.style.cssText = `
            background: white;
            padding: 32px 48px;
            border-radius: 16px;
            text-align: center;
            max-width: 500px;
            box-shadow: 0 25px 80px rgba(0,0,0,0.4);
          `;

          modal.innerHTML = `
            <div style="font-size: 56px; margin-bottom: 20px;">📁</div>
            <h2 style="margin: 0 0 12px 0; font-size: 24px; color: #1a1a1a; font-weight: 600;">File Upload Required</h2>
            <p style="margin: 0 0 20px 0; color: #666; font-size: 15px; line-height: 1.5;">
              Click the button below to open the file picker, then select:
            </p>
            <div style="
              background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
              border: 2px solid #0ea5e9;
              border-radius: 10px;
              padding: 16px 20px;
              margin-bottom: 24px;
            ">
              <code style="font-size: 16px; color: #0369a1; word-break: break-all; font-weight: 600;">${fileName}</code>
            </div>
          `;

          // Create the button that will trigger the file picker (requires user click for browser security)
          const selectButton = document.createElement('button');
          selectButton.textContent = 'Choose File...';
          selectButton.style.cssText = `
            background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
            color: white;
            border: none;
            padding: 14px 32px;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            font-family: system-ui, -apple-system, sans-serif;
            box-shadow: 0 4px 14px rgba(139, 92, 246, 0.4);
            transition: transform 0.1s, box-shadow 0.1s;
          `;
          selectButton.addEventListener('mouseenter', () => {
            selectButton.style.transform = 'scale(1.02)';
            selectButton.style.boxShadow = '0 6px 20px rgba(139, 92, 246, 0.5)';
          });
          selectButton.addEventListener('mouseleave', () => {
            selectButton.style.transform = 'scale(1)';
            selectButton.style.boxShadow = '0 4px 14px rgba(139, 92, 246, 0.4)';
          });

          modal.appendChild(selectButton);
          overlay.appendChild(modal);
          document.body.appendChild(overlay);

          // Create a promise that resolves when user selects a file or timeout
          const fileSelected = new Promise<ActionResult>((resolve) => {
            const timeout = setTimeout(() => {
              inputElement.removeEventListener("change", onChange);
              cleanup();
              resolve({ success: false, error: `Timeout waiting for file selection: ${fileName}` });
            }, 120000); // 2 minute timeout for manual file selection

            const cleanup = () => {
              overlay.remove();
              clearHighlight();
            };

            const onChange = async () => {
              clearTimeout(timeout);
              inputElement.removeEventListener("change", onChange);
              cleanup();

              if (inputElement.files && inputElement.files.length > 0) {
                const selectedFile = inputElement.files[0].name;
                console.log(`[content-script] File selected: ${selectedFile}`);

                // Start DOM change detection - uploads often trigger processing
                // that shows results like "4 sources" which we want to wait for
                if (options.detectChanges) {
                  console.log(`[content-script] Detecting DOM changes after upload...`);
                  const detector = new DOMChangeDetector();
                  detector.start();

                  const result = await detector.waitForStabilization(
                    options.stabilizationTime || 1000, // Give more time for upload processing
                    15000 // Max 15 seconds for file processing
                  );

                  if (result.suggestedWaits.length > 0) {
                    console.log(`[content-script] Upload triggered changes, top suggestion: ${result.suggestedWaits[0].type}="${result.suggestedWaits[0].value}"`);
                  }

                  resolve({ success: true, suggestedWaits: result.suggestedWaits });
                } else {
                  resolve({ success: true });
                }
              } else {
                resolve({ success: false, error: "No file was selected" });
              }
            };

            // When user clicks our button, trigger the actual file input
            selectButton.addEventListener('click', () => {
              console.log(`[content-script] User clicked select button, opening file picker`);
              inputElement.click();
            });

            inputElement.addEventListener("change", onChange);
          });

          // Wait for file selection (user must click the button first)
          return await fileSelected;
        }

        default:
          return { success: false, error: `Unknown action type: ${action.action}` };
      }
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Plays a full step with progress UI.
   * Shows current action being executed, and error details on failure.
   */
  async function playStep(
    actions: import("../shared/types").DemoAction[],
    options: PlaybackOptions = defaultPlaybackOptions
  ): Promise<{ success: boolean; failedActionIndex?: number; failedActionText?: string; error?: string; completedActions: number }> {
    // Show the playback UI
    showPlaybackUI(actions.length);

    let completedActions = 0;

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const actionText = formatActionText(action);

      // Update progress - show we're working on this action
      updatePlaybackProgress(i + 1, actionText, "running");

      try {
        // Play the action
        const result = await playAction(action, options);

        if (!result.success) {
          // Action failed - show error and return
          showPlaybackError(i + 1, actionText, result.error || "Unknown error");
          return {
            success: false,
            failedActionIndex: i,
            failedActionText: actionText,
            error: result.error,
            completedActions,
          };
        }

        completedActions++;

        // Brief pause between actions for visual feedback
        if (i < actions.length - 1) {
          await new Promise(r => setTimeout(r, 200));
        }
      } catch (error) {
        showPlaybackError(i + 1, actionText, String(error));
        return {
          success: false,
          failedActionIndex: i,
          failedActionText: actionText,
          error: String(error),
          completedActions,
        };
      }
    }

    // All actions completed successfully
    showPlaybackSuccess();
    return { success: true, completedActions };
  }

  /**
   * Message handler from service worker.
   */
  chrome.runtime.onMessage.addListener(
    (message: ExtensionMessage, _sender, sendResponse) => {
      switch (message.type) {
        case "START_RECORDING":
          if (message.privacyConfig) {
            updatePrivacyConfig(message.privacyConfig);
          }
          if (message.selectorConfig) {
            updateSelectorConfig(message.selectorConfig);
          }
          startRecording();
          if (typeof message.isPaused === "boolean") {
            setPausedState(message.isPaused);
          }
          sendResponse({ success: true });
          break;

        case "STOP_RECORDING":
          stopRecording();
          sendResponse({ success: true });
          break;

        case "SET_RECORDING_PAUSED":
          if (typeof message.isPaused === "boolean") {
            setPausedState(message.isPaused);
          }
          sendResponse({ success: true });
          break;

        case "UPDATE_PRIVACY_CONFIG":
          if (message.privacyConfig) {
            updatePrivacyConfig(message.privacyConfig);
          }
          sendResponse({ success: true });
          break;

        case "UPDATE_SELECTOR_CONFIG":
          if (message.selectorConfig) {
            updateSelectorConfig(message.selectorConfig);
          }
          sendResponse({ success: true });
          break;

        case "START_PICKER":
          startPicker(
            // On element picked
            (result) => {
              chrome.runtime.sendMessage({
                type: "PICKER_RESULT",
                result,
              });
            },
            // On cancelled (ESC or cancel button)
            () => {
              chrome.runtime.sendMessage({
                type: "STOP_PICKER",
              }).catch(() => {
                // Ignore errors
              });
            }
          );
          sendResponse({ success: true });
          break;

        case "STOP_PICKER":
          stopPicker();
          sendResponse({ success: true });
          break;

        case "TEST_SELECTOR": {
          const testResult = handleTestSelector(message.selector);
          sendResponse(testResult);
          break;
        }

        case "HIGHLIGHT_ELEMENT":
          handleHighlightElement(message.selector);
          sendResponse({ success: true });
          break;

        case "CLEAR_HIGHLIGHT":
          clearHighlight();
          sendResponse({ success: true });
          break;

        case "PLAY_ACTION":
          // Handle async playback of single action
          playAction(message.action).then(result => {
            sendResponse(result);
          });
          return true; // Keep channel open for async response

        case "PLAY_STEP":
          // Handle async playback of entire step with progress UI
          playStep(message.actions).then(result => {
            sendResponse({
              ...result,
              totalActions: message.actions.length,
            });
          });
          return true; // Keep channel open for async response

        default:
          sendResponse({ error: "Unknown message type" });
      }

      // Return true to indicate async response
      return true;
    }
  );

  // Initialize
  updateSelectorConfig(selectorConfig);
  watchNavigation();
  console.log("[content-script] SceneForge content script loaded");
}

/**
 * Element picker for selecting elements on the page.
 */

import { generateSelectorCandidates, getBestSelector, getElementInfo } from "./selector-generator";
import {
  highlightElement,
  clearHighlight,
  enablePickerCursor,
  disablePickerCursor,
  showPickerIndicator,
  hidePickerIndicator,
} from "./highlight-overlay";
import type { PickerResult } from "../shared/types";

type PickerCallback = (result: PickerResult) => void;
type CancelCallback = () => void;

let isPickerActive = false;
let currentHoveredElement: Element | null = null;
let onPickCallback: PickerCallback | null = null;
let onCancelCallback: CancelCallback | null = null;

/**
 * Gets the real element at a point, skipping overlays and html/body.
 */
function getRealElementAtPoint(x: number, y: number): Element | null {
  // Get all elements at this point
  const elements = document.elementsFromPoint(x, y);

  for (const element of elements) {
    // Skip our overlay elements
    if (
      element.id?.startsWith("demo-yaml-creator") ||
      element.closest("#demo-yaml-creator-overlay")
    ) {
      continue;
    }

    // Skip html and body
    const tagName = element.tagName.toLowerCase();
    if (tagName === "html" || tagName === "body") {
      continue;
    }

    // Skip script and style elements
    if (tagName === "script" || tagName === "style" || tagName === "noscript") {
      continue;
    }

    return element;
  }

  return null;
}

/**
 * Handles mouse move during picker mode.
 */
function handleMouseMove(event: MouseEvent): void {
  if (!isPickerActive) return;

  const element = getRealElementAtPoint(event.clientX, event.clientY);
  if (!element || element === currentHoveredElement) return;

  currentHoveredElement = element;

  // Get the best selector for display
  const selector = getBestSelector(element);
  highlightElement(element, selector);
}

/**
 * Handles click during picker mode.
 */
function handleClick(event: MouseEvent): void {
  if (!isPickerActive) return;

  // Check if clicking on our overlay elements - let their handlers work
  const clickTarget = event.target as Element;
  if (
    clickTarget?.id?.startsWith("demo-yaml-creator") ||
    clickTarget?.closest("#demo-yaml-creator-overlay")
  ) {
    return;
  }

  // Get the real element under the click
  const element = getRealElementAtPoint(event.clientX, event.clientY);
  if (!element) return;

  // Only prevent default and stop propagation for actual element selection
  event.preventDefault();
  event.stopPropagation();

  // Generate result
  const candidates = generateSelectorCandidates(element);
  const result: PickerResult = {
    selector: candidates[0]?.selector || getBestSelector(element),
    selectorCandidates: candidates,
    elementInfo: getElementInfo(element),
  };

  // Stop picker
  stopPicker();

  // Call callback
  if (onPickCallback) {
    onPickCallback(result);
  }
}

/**
 * Handles key press during picker mode.
 */
function handleKeyDown(event: KeyboardEvent): void {
  if (!isPickerActive) return;

  if (event.key === "Escape") {
    event.preventDefault();
    stopPicker(true); // true = cancelled
  }
}

/**
 * Starts the element picker.
 */
export function startPicker(callback: PickerCallback, onCancel?: CancelCallback): void {
  if (isPickerActive) return;

  isPickerActive = true;
  onPickCallback = callback;
  onCancelCallback = onCancel || null;
  currentHoveredElement = null;

  // Enable crosshair cursor
  enablePickerCursor();

  // Show picker indicator with cancel button
  showPickerIndicator(() => {
    stopPicker(true); // true = cancelled
  });

  // Add event listeners with capture phase
  document.addEventListener("mousemove", handleMouseMove, { capture: true });
  document.addEventListener("click", handleClick, { capture: true });
  document.addEventListener("keydown", handleKeyDown, { capture: true });

  console.log("[element-picker] Picker started");
}

/**
 * Stops the element picker.
 * @param cancelled - If true, calls the cancel callback to notify service worker
 */
export function stopPicker(cancelled = false): void {
  if (!isPickerActive) return;

  isPickerActive = false;
  const cancelCb = onCancelCallback;
  onPickCallback = null;
  onCancelCallback = null;
  currentHoveredElement = null;

  // Restore cursor
  disablePickerCursor();

  // Hide picker indicator
  hidePickerIndicator();

  // Clear highlight
  clearHighlight();

  // Remove event listeners
  document.removeEventListener("mousemove", handleMouseMove, { capture: true });
  document.removeEventListener("click", handleClick, { capture: true });
  document.removeEventListener("keydown", handleKeyDown, { capture: true });

  // Notify if cancelled
  if (cancelled && cancelCb) {
    cancelCb();
  }

  console.log("[element-picker] Picker stopped", cancelled ? "(cancelled)" : "");
}

/**
 * Returns whether the picker is currently active.
 */
export function isPickerEnabled(): boolean {
  return isPickerActive;
}

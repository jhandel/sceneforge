/**
 * Visual overlay for element highlighting and picker mode.
 * Safe for re-injection - uses window state and guards against duplicates.
 */

// Use object to avoid redeclaration errors on re-injection
const OverlayIds = {
  OVERLAY: "sceneforge-overlay",
  TOOLTIP: "sceneforge-tooltip",
  HIGHLIGHT: "sceneforge-highlight",
  RECORDING: "sceneforge-recording",
  PICKER: "sceneforge-picker-indicator",
  DETECTING: "sceneforge-detecting",
} as const;

// State stored on window to survive re-injection
interface OverlayState {
  onCancelPicker: (() => void) | null;
  currentSelector: string;
  isHighlightVisible: boolean;
  escListenerAdded: boolean;
}

const windowWithState = window as Window & { __demoOverlayState?: OverlayState };
if (!windowWithState.__demoOverlayState) {
  windowWithState.__demoOverlayState = {
    onCancelPicker: null,
    currentSelector: "",
    isHighlightVisible: false,
    escListenerAdded: false,
  };
}
const overlayState = windowWithState.__demoOverlayState;

/**
 * Creates and returns the main overlay container.
 */
function getOrCreateOverlay(): HTMLDivElement {
  let overlay = document.getElementById(OverlayIds.OVERLAY) as HTMLDivElement;
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = OverlayIds.OVERLAY;
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 2147483647;
    `;
    document.body.appendChild(overlay);
  }
  return overlay;
}

/**
 * Creates the highlight box element.
 */
function getOrCreateHighlight(): HTMLDivElement {
  const overlay = getOrCreateOverlay();
  let highlight = document.getElementById(OverlayIds.HIGHLIGHT) as HTMLDivElement;
  if (!highlight) {
    highlight = document.createElement("div");
    highlight.id = OverlayIds.HIGHLIGHT;
    highlight.style.cssText = `
      position: fixed;
      border: 2px solid #8b5cf6;
      background: rgba(139, 92, 246, 0.1);
      border-radius: 4px;
      pointer-events: none;
      display: none;
      transition: all 0.15s ease;
    `;
    overlay.appendChild(highlight);
  }
  return highlight;
}

/**
 * Creates the tooltip element with copy and dismiss buttons.
 */
function getOrCreateTooltip(): HTMLDivElement {
  const overlay = getOrCreateOverlay();
  let tooltip = document.getElementById(OverlayIds.TOOLTIP) as HTMLDivElement;
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.id = OverlayIds.TOOLTIP;
    tooltip.style.cssText = `
      position: fixed;
      background: #1f2937;
      color: white;
      padding: 8px 12px;
      border-radius: 6px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      max-width: 400px;
      word-break: break-all;
      pointer-events: auto;
      display: none;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
      z-index: 2147483647;
      cursor: pointer;
    `;

    // Selector text container
    const selectorText = document.createElement("div");
    selectorText.id = `${OverlayIds.TOOLTIP}-text`;
    selectorText.style.cssText = `
      margin-bottom: 6px;
    `;
    tooltip.appendChild(selectorText);

    // Button container
    const buttonContainer = document.createElement("div");
    buttonContainer.style.cssText = `
      display: flex;
      gap: 6px;
    `;

    // Copy button
    const copyBtn = document.createElement("button");
    copyBtn.id = `${OverlayIds.TOOLTIP}-copy`;
    copyBtn.textContent = "Copy";
    copyBtn.style.cssText = `
      background: #8b5cf6;
      color: white;
      border: none;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
      font-family: system-ui, -apple-system, sans-serif;
    `;
    copyBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (overlayState.currentSelector) {
        navigator.clipboard.writeText(overlayState.currentSelector).then(() => {
          copyBtn.textContent = "Copied!";
          setTimeout(() => {
            copyBtn.textContent = "Copy";
          }, 1500);
        });
      }
    });
    buttonContainer.appendChild(copyBtn);

    // Dismiss button
    const dismissBtn = document.createElement("button");
    dismissBtn.id = `${OverlayIds.TOOLTIP}-dismiss`;
    dismissBtn.textContent = "Dismiss";
    dismissBtn.style.cssText = `
      background: #6b7280;
      color: white;
      border: none;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
      font-family: system-ui, -apple-system, sans-serif;
    `;
    dismissBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearHighlight();
    });
    dismissBtn.addEventListener("mouseenter", () => {
      dismissBtn.style.background = "#4b5563";
    });
    dismissBtn.addEventListener("mouseleave", () => {
      dismissBtn.style.background = "#6b7280";
    });
    buttonContainer.appendChild(dismissBtn);

    tooltip.appendChild(buttonContainer);

    // Click on tooltip itself shouldn't trigger element selection
    tooltip.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    overlay.appendChild(tooltip);
  }
  return tooltip;
}

/**
 * Global ESC key handler to dismiss highlight.
 */
function handleEscKey(event: KeyboardEvent): void {
  if (event.key === "Escape" && overlayState.isHighlightVisible) {
    clearHighlight();
  }
}

// Add global ESC listener only once
if (!overlayState.escListenerAdded) {
  document.addEventListener("keydown", handleEscKey);
  overlayState.escListenerAdded = true;
}

/**
 * Shows highlight around an element.
 */
export function highlightElement(element: Element, selector?: string): void {
  const rect = element.getBoundingClientRect();
  const highlight = getOrCreateHighlight();
  const tooltip = getOrCreateTooltip();

  // Position highlight
  highlight.style.left = `${rect.left - 2}px`;
  highlight.style.top = `${rect.top - 2}px`;
  highlight.style.width = `${rect.width + 4}px`;
  highlight.style.height = `${rect.height + 4}px`;
  highlight.style.display = "block";
  overlayState.isHighlightVisible = true;

  // Position tooltip
  if (selector) {
    overlayState.currentSelector = selector;
    const selectorText = document.getElementById(`${OverlayIds.TOOLTIP}-text`);
    if (selectorText) {
      selectorText.textContent = selector;
    }

    // Position tooltip above or below element
    const tooltipHeight = 60; // Taller now with button
    const margin = 8;
    let top = rect.top - tooltipHeight - margin;
    if (top < 0) {
      top = rect.bottom + margin;
    }

    tooltip.style.left = `${Math.max(8, rect.left)}px`;
    tooltip.style.top = `${top}px`;
    tooltip.style.display = "block";
  }
}

/**
 * Clears any highlights.
 */
export function clearHighlight(): void {
  const highlight = document.getElementById(OverlayIds.HIGHLIGHT);
  const tooltip = document.getElementById(OverlayIds.TOOLTIP);
  if (highlight) highlight.style.display = "none";
  if (tooltip) tooltip.style.display = "none";
  overlayState.isHighlightVisible = false;
}

/**
 * Shows the recording indicator.
 */
export function showRecordingIndicator(): void {
  const overlay = getOrCreateOverlay();
  let indicator = document.getElementById(OverlayIds.RECORDING) as HTMLDivElement;
  if (!indicator) {
    indicator = document.createElement("div");
    indicator.id = OverlayIds.RECORDING;
    indicator.style.cssText = `
      position: fixed;
      top: 12px;
      right: 12px;
      background: #ef4444;
      color: white;
      padding: 6px 12px;
      border-radius: 16px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 12px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      pointer-events: auto;
      z-index: 2147483647;
    `;

    // Add pulsing dot
    const dot = document.createElement("span");
    dot.style.cssText = `
      width: 8px;
      height: 8px;
      background: white;
      border-radius: 50%;
      animation: demo-pulse 1.5s ease-in-out infinite;
    `;
    indicator.appendChild(dot);

    // Add text
    const text = document.createElement("span");
    text.textContent = "Recording";
    indicator.appendChild(text);

    // Add animation style if not already present
    if (!document.getElementById("sceneforge-styles")) {
      const style = document.createElement("style");
      style.id = "sceneforge-styles";
      style.textContent = `
        @keyframes demo-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes demo-flash-expand {
          0% { transform: scale(0.5); opacity: 1; }
          100% { transform: scale(1.5); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    overlay.appendChild(indicator);
  }

  indicator.style.display = "flex";
}

/**
 * Updates the recording indicator to show paused or active state.
 */
export function setRecordingIndicatorPaused(isPaused: boolean): void {
  const indicator = document.getElementById(OverlayIds.RECORDING) as HTMLDivElement | null;
  if (!indicator) return;

  const spans = indicator.querySelectorAll("span");
  const dot = spans[0] as HTMLSpanElement | undefined;
  const label = spans[1] as HTMLSpanElement | undefined;

  if (isPaused) {
    indicator.style.background = "#f59e0b";
    if (dot) {
      dot.style.animation = "none";
      dot.style.opacity = "0.8";
    }
    if (label) {
      label.textContent = "Paused";
    }
  } else {
    indicator.style.background = "#ef4444";
    if (dot) {
      dot.style.animation = "demo-pulse 1.5s ease-in-out infinite";
      dot.style.opacity = "1";
    }
    if (label) {
      label.textContent = "Recording";
    }
  }
}

/**
 * Hides the recording indicator.
 */
export function hideRecordingIndicator(): void {
  const indicator = document.getElementById(OverlayIds.RECORDING);
  if (indicator) indicator.style.display = "none";
}

/**
 * Shows a temporary flash effect on click.
 */
export function flashClick(x: number, y: number): void {
  const flash = document.createElement("div");
  flash.className = "sceneforge-flash";
  flash.style.cssText = `
    position: fixed;
    left: ${x - 15}px;
    top: ${y - 15}px;
    width: 30px;
    height: 30px;
    background: rgba(139, 92, 246, 0.4);
    border: 2px solid #8b5cf6;
    border-radius: 50%;
    pointer-events: none;
    z-index: 2147483647;
    animation: demo-flash-expand 0.3s ease-out forwards;
  `;

  document.body.appendChild(flash);

  setTimeout(() => {
    flash.remove();
  }, 300);
}

/**
 * Shows picker mode cursor style.
 */
export function enablePickerCursor(): void {
  document.body.style.cursor = "crosshair";
}

/**
 * Restores normal cursor.
 */
export function disablePickerCursor(): void {
  document.body.style.cursor = "";
}

/**
 * Removes all overlay elements.
 */
export function removeOverlay(): void {
  const overlay = document.getElementById(OverlayIds.OVERLAY);
  if (overlay) overlay.remove();
  disablePickerCursor();
}

/**
 * Shows the picker mode indicator with cancel button.
 */
export function showPickerIndicator(onCancel: () => void): void {
  overlayState.onCancelPicker = onCancel;
  const overlay = getOrCreateOverlay();
  let indicator = document.getElementById(OverlayIds.PICKER) as HTMLDivElement;

  if (!indicator) {
    indicator = document.createElement("div");
    indicator.id = OverlayIds.PICKER;
    indicator.style.cssText = `
      position: fixed;
      top: 12px;
      right: 12px;
      background: #8b5cf6;
      color: white;
      padding: 8px 12px;
      border-radius: 8px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 12px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      pointer-events: auto;
      z-index: 2147483647;
    `;

    // Instructions text
    const text = document.createElement("span");
    text.textContent = "Click element to select - ESC to cancel";
    indicator.appendChild(text);

    // Cancel button
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.cssText = `
      background: rgba(255, 255, 255, 0.2);
      color: white;
      border: none;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      font-family: system-ui, -apple-system, sans-serif;
      font-weight: 500;
    `;
    cancelBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (overlayState.onCancelPicker) {
        overlayState.onCancelPicker();
      }
    });
    cancelBtn.addEventListener("mouseenter", () => {
      cancelBtn.style.background = "rgba(255, 255, 255, 0.3)";
    });
    cancelBtn.addEventListener("mouseleave", () => {
      cancelBtn.style.background = "rgba(255, 255, 255, 0.2)";
    });
    indicator.appendChild(cancelBtn);

    overlay.appendChild(indicator);
  }

  indicator.style.display = "flex";
}

/**
 * Hides the picker mode indicator.
 */
export function hidePickerIndicator(): void {
  const indicator = document.getElementById(OverlayIds.PICKER);
  if (indicator) indicator.style.display = "none";
  overlayState.onCancelPicker = null;
}

/**
 * Shows the "Detecting changes..." indicator during DOM stabilization.
 */
export function showDetectingIndicator(interactionType?: string): void {
  const overlay = getOrCreateOverlay();
  let indicator = document.getElementById(OverlayIds.DETECTING) as HTMLDivElement;

  if (!indicator) {
    indicator = document.createElement("div");
    indicator.id = OverlayIds.DETECTING;
    indicator.style.cssText = `
      position: fixed;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      background: #f59e0b;
      color: white;
      padding: 8px 16px;
      border-radius: 20px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 13px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
      pointer-events: auto;
      z-index: 2147483647;
    `;

    // Add spinner
    const spinner = document.createElement("span");
    spinner.id = `${OverlayIds.DETECTING}-spinner`;
    spinner.style.cssText = `
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: demo-spin 0.8s linear infinite;
    `;
    indicator.appendChild(spinner);

    // Add text
    const text = document.createElement("span");
    text.id = `${OverlayIds.DETECTING}-text`;
    text.textContent = "Detecting changes...";
    indicator.appendChild(text);

    // Add skip button
    const skipBtn = document.createElement("button");
    skipBtn.id = `${OverlayIds.DETECTING}-skip`;
    skipBtn.textContent = "Skip";
    skipBtn.style.cssText = `
      background: rgba(255, 255, 255, 0.25);
      color: white;
      border: none;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 11px;
      cursor: pointer;
      font-family: system-ui, -apple-system, sans-serif;
      font-weight: 500;
      margin-left: 4px;
    `;
    skipBtn.addEventListener("mouseenter", () => {
      skipBtn.style.background = "rgba(255, 255, 255, 0.35)";
    });
    skipBtn.addEventListener("mouseleave", () => {
      skipBtn.style.background = "rgba(255, 255, 255, 0.25)";
    });
    indicator.appendChild(skipBtn);

    // Add spin animation if not already present
    const existingStyle = document.getElementById("sceneforge-styles");
    if (existingStyle && !existingStyle.textContent?.includes("demo-spin")) {
      existingStyle.textContent += `
        @keyframes demo-spin {
          to { transform: rotate(360deg); }
        }
      `;
    }

    overlay.appendChild(indicator);
  }

  // Update text based on interaction type
  const textEl = document.getElementById(`${OverlayIds.DETECTING}-text`);
  if (textEl) {
    switch (interactionType) {
      case "file-upload":
        textEl.textContent = "Processing upload...";
        break;
      case "click":
        textEl.textContent = "Detecting changes...";
        break;
      default:
        textEl.textContent = "Detecting changes...";
    }
  }

  indicator.style.display = "flex";
}

/**
 * Hides the detecting indicator.
 */
export function hideDetectingIndicator(): void {
  const indicator = document.getElementById(OverlayIds.DETECTING);
  if (indicator) indicator.style.display = "none";
}

/**
 * Sets a callback for when the user clicks "Skip" on the detecting indicator.
 */
export function onSkipDetection(callback: () => void): void {
  const skipBtn = document.getElementById(`${OverlayIds.DETECTING}-skip`);
  if (skipBtn) {
    // Remove old listeners by cloning
    const newBtn = skipBtn.cloneNode(true) as HTMLButtonElement;
    skipBtn.parentNode?.replaceChild(newBtn, skipBtn);
    newBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      callback();
    });
  }
}

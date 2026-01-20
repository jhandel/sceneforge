/**
 * Smart wait utilities for intelligent action timing.
 * Provides pre-action waiting for elements and post-action DOM stabilization detection.
 */

import type { WaitCondition } from "../shared/types";

/**
 * Options for waiting for an element.
 */
export interface WaitForElementOptions {
  timeout?: number;
  visible?: boolean;
  enabled?: boolean;
  stable?: boolean;
}

/**
 * Result of waiting for an element.
 */
export interface WaitForElementResult {
  found: boolean;
  element: Element | null;
  error?: string;
  waitedMs: number;
}

/**
 * Detected DOM change that could be used as a wait condition.
 */
export interface DetectedChange {
  type: "text" | "selector" | "textHidden" | "selectorHidden";
  value: string;
  description: string;
  confidence: number; // 0-1, how likely this is a good wait condition
}

/**
 * Result of DOM stabilization detection.
 */
export interface StabilizationResult {
  stabilized: boolean;
  duration: number;
  suggestedWaits: DetectedChange[];
}

/**
 * Checks if an element is visible (not hidden by CSS).
 */
function isElementVisible(element: Element): boolean {
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return false;
  }

  return true;
}

/**
 * Checks if an element is enabled (not disabled).
 */
function isElementEnabled(element: Element): boolean {
  if (element instanceof HTMLButtonElement ||
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement) {
    return !element.disabled;
  }

  // Check for aria-disabled
  if (element.getAttribute("aria-disabled") === "true") {
    return false;
  }

  return true;
}

/**
 * Checks if an element is stable (not animating/transitioning).
 */
async function isElementStable(element: Element, stabilityTime = 100): Promise<boolean> {
  const getRect = () => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  };

  const initialRect = getRect();
  await new Promise(r => setTimeout(r, stabilityTime));
  const finalRect = getRect();

  return (
    Math.abs(initialRect.x - finalRect.x) < 1 &&
    Math.abs(initialRect.y - finalRect.y) < 1 &&
    Math.abs(initialRect.width - finalRect.width) < 1 &&
    Math.abs(initialRect.height - finalRect.height) < 1
  );
}

/**
 * Checks if an element is the topmost element at its center position.
 * This helps identify elements in portals/modals that are visually on top.
 */
function isTopmostAtPosition(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;

  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  // Check if element is in viewport
  if (centerX < 0 || centerY < 0 || centerX > window.innerWidth || centerY > window.innerHeight) {
    return false;
  }

  const topElement = document.elementFromPoint(centerX, centerY);
  if (!topElement) return false;

  // Check if the element at point is the target or a child of it
  return element === topElement || element.contains(topElement) || topElement.contains(element);
}

/**
 * Gets the effective z-index of an element (considers stacking context).
 */
function getEffectiveZIndex(element: Element): number {
  let maxZ = 0;
  let current: Element | null = element;

  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    const zIndex = parseInt(style.zIndex, 10);
    if (!isNaN(zIndex) && zIndex > maxZ) {
      maxZ = zIndex;
    }
    current = current.parentElement;
  }

  return maxZ;
}

/**
 * Finds an element using Playwright-style selector.
 * Supports: :has-text(), [attribute], >> nth=N
 * Prioritizes elements that are visible, in view, and topmost (for portal support).
 */
function findElement(selector: string): Element | null {
  // Handle >> nth=N suffix
  let targetIndex: number | null = null;
  let baseSelector = selector;

  const nthMatch = selector.match(/^(.+?)\s*>>\s*nth=(\d+)$/);
  if (nthMatch) {
    baseSelector = nthMatch[1];
    targetIndex = parseInt(nthMatch[2], 10);
  }

  // Find all matching elements
  let elements: Element[] = [];

  // Handle Playwright-style :has-text selectors
  // Matches: tag:has-text("text") or [attr]:has-text("text")
  const getHasTextElements = (base: string, text: string): Element[] => {
    const baseElements = Array.from(document.querySelectorAll(base)).filter(el =>
      el.textContent?.includes(text)
    );
    if (baseElements.length > 0) {
      return baseElements;
    }

    const roleButtonBase = base.replace(/(^|[\s>+~])button$/, "$1[role=\"button\"]");
    if (roleButtonBase === base) {
      return baseElements;
    }

    return Array.from(document.querySelectorAll(roleButtonBase)).filter(el =>
      el.textContent?.includes(text)
    );
  };

  const hasTextMatch = baseSelector.match(/^(.+?):has-text\("([^"]+)"\)$/);
  if (hasTextMatch) {
    const [, base, text] = hasTextMatch;
    elements = getHasTextElements(base, text);
  }
  // Text selector: text="Submit"
  else if (baseSelector.match(/^text="([^"]+)"$/)) {
    const textMatch = baseSelector.match(/^text="([^"]+)"$/);
    if (textMatch) {
      const [, text] = textMatch;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node: Text | null;
      while ((node = walker.nextNode() as Text | null)) {
        if (node.textContent?.includes(text) && node.parentElement) {
          elements.push(node.parentElement);
        }
      }
    }
  }
  // Standard CSS selector
  else {
    try {
      elements = Array.from(document.querySelectorAll(baseSelector));
    } catch {
      return null;
    }
  }

  // If no elements found
  if (elements.length === 0) {
    return null;
  }

  // If nth index specified, return that element
  if (targetIndex !== null) {
    return elements[targetIndex] || null;
  }

  // If only one element, return it
  if (elements.length === 1) {
    return elements[0];
  }

  // Multiple elements found - prioritize visible ones that are topmost (in portals/modals)
  console.log(`[findElement] Found ${elements.length} elements matching "${selector}"`);

  // First, filter to visible elements with valid bounding boxes
  const visibleElements = elements.filter(el => {
    if (!isElementVisible(el)) return false;
    const rect = el.getBoundingClientRect();
    // Must have non-zero dimensions and be within viewport
    if (rect.width === 0 || rect.height === 0) return false;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    // Must be at least partially in viewport
    if (centerX < 0 || centerY < 0 || centerX > window.innerWidth || centerY > window.innerHeight) {
      return false;
    }
    return true;
  });

  console.log(`[findElement] ${visibleElements.length} are visible with valid bounds`);

  if (visibleElements.length === 0) {
    console.log(`[findElement] No visible elements, falling back to first match`);
    return elements[0]; // Fall back to first match if none visible
  }

  if (visibleElements.length === 1) {
    return visibleElements[0];
  }

  // Multiple visible elements - check which one is actually topmost (clickable)
  // This handles portal/modal content which has higher z-index
  const topmostElements = visibleElements.filter(el => isTopmostAtPosition(el));
  console.log(`[findElement] ${topmostElements.length} are topmost at their position`);

  if (topmostElements.length > 0) {
    // If multiple are topmost, prefer the one with highest z-index
    topmostElements.sort((a, b) => getEffectiveZIndex(b) - getEffectiveZIndex(a));
    const chosen = topmostElements[0];
    console.log(`[findElement] Chose element with z-index ${getEffectiveZIndex(chosen)}:`, chosen.textContent?.slice(0, 30));
    return chosen;
  }

  // Fall back to highest z-index among visible elements
  visibleElements.sort((a, b) => getEffectiveZIndex(b) - getEffectiveZIndex(a));
  const chosen = visibleElements[0];
  console.log(`[findElement] Fell back to highest z-index ${getEffectiveZIndex(chosen)}:`, chosen.textContent?.slice(0, 30));
  return chosen;
}

/**
 * Waits for an element to be present, optionally visible and enabled.
 * This is similar to Playwright's built-in auto-waiting.
 */
export async function waitForElement(
  selector: string,
  options: WaitForElementOptions = {}
): Promise<WaitForElementResult> {
  const {
    timeout = 10000,
    visible = true,
    enabled = true,
    stable = false,
  } = options;

  const startTime = Date.now();
  const pollInterval = 100;

  while (Date.now() - startTime < timeout) {
    const element = findElement(selector);

    if (element) {
      // Check visibility
      if (visible && !isElementVisible(element)) {
        await new Promise(r => setTimeout(r, pollInterval));
        continue;
      }

      // Check enabled
      if (enabled && !isElementEnabled(element)) {
        await new Promise(r => setTimeout(r, pollInterval));
        continue;
      }

      // Check stability
      if (stable && !(await isElementStable(element))) {
        continue;
      }

      return {
        found: true,
        element,
        waitedMs: Date.now() - startTime,
      };
    }

    await new Promise(r => setTimeout(r, pollInterval));
  }

  return {
    found: false,
    element: null,
    error: `Timeout waiting for element: ${selector}`,
    waitedMs: timeout,
  };
}

/**
 * Class to detect DOM changes and suggest wait conditions.
 */
export class DOMChangeDetector {
  private observer: MutationObserver | null = null;
  private changes: Array<{
    type: "added" | "removed" | "text";
    element?: Element;
    text?: string;
    timestamp: number;
  }> = [];
  private initialText: Set<string> = new Set();
  private initialElements: Set<string> = new Set();
  private isObserving = false;

  /**
   * Gets text snippets from an element (for identifying new text).
   */
  private getTextSnippets(element: Element): string[] {
    const snippets: string[] = [];
    const text = element.textContent?.trim() || "";

    // Split into meaningful chunks (sentences, phrases)
    const chunks = text.split(/[.!?\n]+/).filter(s => s.trim().length > 3 && s.trim().length < 100);
    snippets.push(...chunks.map(s => s.trim()));

    // Also get specific text patterns that are good for waiting
    // Numbers with units (like "4 sources", "12 items")
    const numberPatterns = text.match(/\d+\s+\w+/g) || [];
    snippets.push(...numberPatterns);

    return snippets;
  }

  /**
   * Gets a unique identifier for an element.
   */
  private getElementIdentifier(element: Element): string {
    const tag = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : "";
    const classes = element.className && typeof element.className === "string"
      ? `.${element.className.split(" ").slice(0, 2).join(".")}`
      : "";
    const testId = element.getAttribute("data-testid");
    return testId ? `[data-testid="${testId}"]` : `${tag}${id}${classes}`;
  }

  /**
   * Starts observing DOM changes.
   */
  start(): void {
    if (this.isObserving) return;

    // Capture initial state
    this.initialText = new Set(this.getTextSnippets(document.body));

    // Capture initial elements (visible ones)
    document.querySelectorAll("*").forEach(el => {
      if (isElementVisible(el)) {
        this.initialElements.add(this.getElementIdentifier(el));
      }
    });

    this.changes = [];
    this.isObserving = true;

    this.observer = new MutationObserver((mutations) => {
      const timestamp = Date.now();

      for (const mutation of mutations) {
        // Track added nodes
        mutation.addedNodes.forEach(node => {
          if (node instanceof Element) {
            // Skip our overlay elements
            if (node.id?.startsWith("demo-yaml") || node.closest("#demo-yaml-creator-overlay")) {
              return;
            }

            this.changes.push({
              type: "added",
              element: node,
              timestamp,
            });

            // Also track new text content
            const text = node.textContent?.trim();
            if (text && text.length > 3 && text.length < 200) {
              this.changes.push({
                type: "text",
                text,
                timestamp,
              });
            }
          }
        });

        // Track removed nodes
        mutation.removedNodes.forEach(node => {
          if (node instanceof Element) {
            this.changes.push({
              type: "removed",
              element: node,
              timestamp,
            });
          }
        });

        // Track character data changes (text updates)
        if (mutation.type === "characterData" && mutation.target.parentElement) {
          const text = mutation.target.textContent?.trim();
          if (text && text.length > 3 && text.length < 200) {
            this.changes.push({
              type: "text",
              text,
              element: mutation.target.parentElement,
              timestamp,
            });
          }
        }

        // Track attribute changes (elements becoming visible, etc.)
        if (mutation.type === "attributes" && mutation.target instanceof Element) {
          const element = mutation.target;

          // Skip our overlay elements
          if (element.id?.startsWith("demo-yaml") || element.closest("#demo-yaml-creator-overlay")) {
            return;
          }

          // Track Radix UI / headless UI state changes (data-state="open", aria-expanded="true")
          const dataState = element.getAttribute("data-state");
          const ariaExpanded = element.getAttribute("aria-expanded");

          if (dataState === "open" || ariaExpanded === "true") {
            // A dropdown/popover/dialog opened - this is a good wait condition
            this.changes.push({
              type: "added",
              element,
              timestamp,
            });
          }

          // Check if element became visible or got new content
          const text = element.textContent?.trim();
          if (text && text.length > 3 && text.length < 200 && !this.initialText.has(text)) {
            this.changes.push({
              type: "text",
              text,
              element,
              timestamp,
            });
          }
        }
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true, // Also catch attribute changes (class, style, etc.)
      attributeFilter: ["class", "style", "hidden", "disabled", "aria-hidden", "data-state", "aria-expanded"],
    });

    console.log("[smart-wait] Started DOM change detection");
  }

  /**
   * Stops observing and returns detected changes.
   */
  stop(): DetectedChange[] {
    if (!this.isObserving) return [];

    this.observer?.disconnect();
    this.observer = null;
    this.isObserving = false;

    console.log(`[smart-wait] Stopped DOM detection, found ${this.changes.length} changes`);

    return this.analyzeDOMChanges();
  }

  /**
   * Analyzes collected changes and suggests wait conditions.
   */
  private analyzeDOMChanges(): DetectedChange[] {
    const suggestions: DetectedChange[] = [];
    const seenText = new Set<string>();
    const seenSelectors = new Set<string>();

    for (const change of this.changes) {
      // Text changes
      if (change.type === "text" && change.text) {
        const text = change.text.trim();

        // Skip if already seen or was in initial state
        if (seenText.has(text) || this.initialText.has(text)) continue;
        seenText.add(text);

        // Calculate confidence based on patterns
        let confidence = 0.4; // Base confidence - catch most meaningful changes
        let description = `New text appeared: "${text.slice(0, 50)}${text.length > 50 ? '...' : ''}"`;

        // Higher confidence for number+word patterns (like "4 sources", "12 items loaded")
        if (/\d+\s+\w+/.test(text)) {
          confidence = 0.8;
          description = `Counter/status text: "${text}"`;
        }
        // Higher confidence for status words
        else if (/loaded|complete|ready|success|done|finished|created|saved|uploaded|processed|added|removed|updated|error|failed|warning/i.test(text)) {
          confidence = 0.7;
          description = `Status text: "${text.slice(0, 50)}"`;
        }
        // Higher confidence for modal/dialog titles or button text that appeared
        else if (/confirm|cancel|submit|continue|next|previous|close|ok|yes|no/i.test(text) && text.length < 30) {
          confidence = 0.6;
          description = `UI element text: "${text}"`;
        }
        // Medium-high confidence for short, specific text (likely meaningful)
        else if (text.length < 50 && text.length > 5) {
          confidence = 0.5;
          description = `New text: "${text}"`;
        }

        suggestions.push({
          type: "text",
          value: text.length > 50 ? text.slice(0, 50) : text,
          description,
          confidence,
        });
      }

      // Element additions
      if (change.type === "added" && change.element) {
        const identifier = this.getElementIdentifier(change.element);

        // Skip if already seen or was in initial state
        if (seenSelectors.has(identifier) || this.initialElements.has(identifier)) continue;
        seenSelectors.add(identifier);

        // Higher confidence for elements with data-testid
        const testId = change.element.getAttribute("data-testid");
        if (testId) {
          suggestions.push({
            type: "selector",
            value: `[data-testid="${testId}"]`,
            description: `Element with test ID "${testId}" appeared`,
            confidence: 0.8,
          });
        }
        // High confidence for Radix UI dropdown content (portals)
        else if (change.element.hasAttribute("data-radix-popper-content-wrapper") ||
                 change.element.getAttribute("data-state") === "open" ||
                 change.element.getAttribute("role") === "listbox" ||
                 change.element.getAttribute("role") === "menu" ||
                 change.element.getAttribute("role") === "dialog") {
          const role = change.element.getAttribute("role");
          const ariaLabel = change.element.getAttribute("aria-label");
          let selector = "";
          let desc = "";

          if (ariaLabel) {
            selector = `[aria-label="${ariaLabel}"]`;
            desc = `Dropdown/menu "${ariaLabel}" opened`;
          } else if (role) {
            selector = `[role="${role}"][data-state="open"]`;
            desc = `${role} opened`;
          } else {
            selector = `[data-state="open"]`;
            desc = `Dropdown/popover opened`;
          }

          suggestions.push({
            type: "selector",
            value: selector,
            description: desc,
            confidence: 0.75,
          });
        }
        // Medium confidence for elements with meaningful IDs
        else if (change.element.id && !change.element.id.includes("__")) {
          suggestions.push({
            type: "selector",
            value: `#${change.element.id}`,
            description: `Element #${change.element.id} appeared`,
            confidence: 0.6,
          });
        }
      }
    }

    // Sort by confidence
    suggestions.sort((a, b) => b.confidence - a.confidence);

    // Return top suggestions
    return suggestions.slice(0, 5);
  }

  /**
   * Waits for DOM to stabilize (no changes for specified duration).
   */
  async waitForStabilization(
    stabilityDuration = 500,
    maxWait = 10000
  ): Promise<StabilizationResult> {
    const startTime = Date.now();
    let lastChangeTime = startTime;
    let changeCount = 0;

    return new Promise((resolve) => {
      const checkStability = () => {
        const now = Date.now();
        const currentChangeCount = this.changes.length;

        // If changes occurred, update last change time
        if (currentChangeCount !== changeCount) {
          lastChangeTime = now;
          changeCount = currentChangeCount;
        }

        // Check if stable (no changes for stabilityDuration)
        if (now - lastChangeTime >= stabilityDuration) {
          const suggestions = this.stop();
          resolve({
            stabilized: true,
            duration: now - startTime,
            suggestedWaits: suggestions,
          });
          return;
        }

        // Check timeout
        if (now - startTime >= maxWait) {
          const suggestions = this.stop();
          resolve({
            stabilized: false,
            duration: maxWait,
            suggestedWaits: suggestions,
          });
          return;
        }

        // Continue checking
        setTimeout(checkStability, 100);
      };

      // Start checking after first stability window
      setTimeout(checkStability, stabilityDuration);
    });
  }
}

/**
 * Creates a wait condition from a detected change.
 */
export function createWaitCondition(change: DetectedChange, timeout = 15000): WaitCondition {
  return {
    type: change.type,
    value: change.value,
    timeout,
  };
}

/**
 * Waits for DOM stabilization and returns suggested wait conditions.
 * Useful during recording to auto-detect what to wait for.
 */
export async function detectPostActionChanges(
  stabilityDuration = 500,
  maxWait = 10000
): Promise<StabilizationResult> {
  const detector = new DOMChangeDetector();
  detector.start();
  return detector.waitForStabilization(stabilityDuration, maxWait);
}

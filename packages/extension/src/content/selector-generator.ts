/**
 * Selector generator for the SceneForge.
 * Generates stable CSS selectors with multiple strategies.
 */

import type { SelectorCandidate, ElementInfo, SelectorConfig } from "../shared/types";
import { DEFAULT_SELECTOR_CONFIG, normalizeSelectorConfig } from "../shared/selector-config";

const PORTAL_STRATEGY_SUFFIX = "-in-portal";
let selectorConfig: SelectorConfig = { ...DEFAULT_SELECTOR_CONFIG };

export function setSelectorConfig(config: SelectorConfig): void {
  selectorConfig = normalizeSelectorConfig(config);
}

function getStrategyKey(strategy: string): string {
  if (strategy.endsWith(PORTAL_STRATEGY_SUFFIX)) {
    return strategy.slice(0, -PORTAL_STRATEGY_SUFFIX.length);
  }
  return strategy;
}

function filterCandidatesByConfig(
  candidates: SelectorCandidate[],
  config: SelectorConfig
): SelectorCandidate[] {
  if (!config.enabledStrategies.length) {
    return candidates;
  }
  const enabled = new Set(config.enabledStrategies);
  return candidates.filter((candidate) => enabled.has(getStrategyKey(candidate.strategy)));
}

/**
 * Detects if an element is inside a portal (Radix, Headless UI, etc.)
 * and returns a selector prefix to scope to that portal.
 */
function getPortalPrefix(element: Element): string | null {
  let current: Element | null = element;

  while (current && current !== document.body) {
    // Radix UI portals
    if (current.hasAttribute("data-radix-popper-content-wrapper")) {
      return "[data-radix-popper-content-wrapper]";
    }
    // Radix dialog/modal portals
    if (current.getAttribute("role") === "dialog" && current.hasAttribute("data-state")) {
      return '[role="dialog"][data-state="open"]';
    }
    // Radix select/combobox content
    if (current.getAttribute("role") === "listbox" && current.closest("[data-radix-popper-content-wrapper]")) {
      return "[data-radix-popper-content-wrapper] [role=\"listbox\"]";
    }
    // Headless UI portals
    if (current.hasAttribute("data-headlessui-portal")) {
      return "[data-headlessui-portal]";
    }
    // Generic high z-index portals (common pattern)
    const style = window.getComputedStyle(current);
    const zIndex = parseInt(style.zIndex, 10);
    if (zIndex >= 50 && current.parentElement === document.body) {
      // This looks like a portal - use its role or a generic selector
      const role = current.getAttribute("role");
      if (role === "listbox" || role === "menu" || role === "dialog") {
        return `[role="${role}"]`;
      }
    }

    current = current.parentElement;
  }

  return null;
}

/**
 * Extracts element information for the selector generator.
 */
export function getElementInfo(element: Element): ElementInfo {
  const rect = element.getBoundingClientRect();

  return {
    tagName: element.tagName.toLowerCase(),
    id: element.id || undefined,
    className: element.className && typeof element.className === "string"
      ? element.className
      : undefined,
    textContent: element.textContent?.trim().slice(0, 100) || undefined,
    ariaLabel: element.getAttribute("aria-label") || undefined,
    placeholder: (element as HTMLInputElement).placeholder || undefined,
    role: element.getAttribute("role") || undefined,
    type: (element as HTMLInputElement).type || undefined,
    name: (element as HTMLInputElement).name || undefined,
    dataTestId: element.getAttribute("data-testid") || undefined,
    boundingRect: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    },
  };
}

/**
 * Generates selector candidates for an element, ordered by priority.
 */
export function generateSelectorCandidates(element: Element): SelectorCandidate[] {
  const candidates: SelectorCandidate[] = [];
  const info = getElementInfo(element);
  const role = element.getAttribute("role");

  // Check if element is inside a portal - if so, we'll prefix selectors
  const portalPrefix = getPortalPrefix(element);

  // Strategy 1: data-testid (highest priority - most stable)
  const testId = element.getAttribute("data-testid");
  if (testId) {
    candidates.push({
      selector: `[data-testid="${escapeAttr(testId)}"]`,
      strategy: "data-testid",
      priority: 1,
      description: `Test ID: ${testId}`,
    });
  }

  // Strategy 2: aria-label directly on element
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) {
    // Combine with tag for more specificity
    candidates.push({
      selector: `${info.tagName}[aria-label="${escapeAttr(ariaLabel)}"]`,
      strategy: "aria-label",
      priority: 2,
      description: `${info.tagName} with aria-label: ${ariaLabel}`,
    });
  }

  // Strategy 3: Role + visible text (Playwright style) - HIGH PRIORITY for unique text
  const visibleText = getVisibleText(element);
  if (visibleText && visibleText.length >= 2 && visibleText.length <= 50) {
    if (info.tagName === "button") {
      candidates.push({
        selector: `button:has-text("${escapeAttr(visibleText)}")`,
        strategy: "role-text",
        priority: 3,
        description: `Button with text: ${visibleText}`,
      });
    } else if (role === "button") {
      candidates.push({
        selector: `${info.tagName}[role="button"]:has-text("${escapeAttr(visibleText)}")`,
        strategy: "role-text",
        priority: 3,
        description: `Button with text: ${visibleText}`,
      });
    } else if (info.tagName === "a") {
      candidates.push({
        selector: `a:has-text("${escapeAttr(visibleText)}")`,
        strategy: "role-text",
        priority: 3,
        description: `Link with text: ${visibleText}`,
      });
    } else if (role === "option") {
      // Dropdown/combobox options - very common!
      candidates.push({
        selector: `[role="option"]:has-text("${escapeAttr(visibleText)}")`,
        strategy: "role-text",
        priority: 2, // Higher priority - these are often unique
        description: `Option: ${visibleText}`,
      });
    } else if (role === "menuitem" || role === "menuitemcheckbox" || role === "menuitemradio") {
      candidates.push({
        selector: `[role="${role}"]:has-text("${escapeAttr(visibleText)}")`,
        strategy: "role-text",
        priority: 2,
        description: `Menu item: ${visibleText}`,
      });
    } else if (role === "tab") {
      candidates.push({
        selector: `[role="tab"]:has-text("${escapeAttr(visibleText)}")`,
        strategy: "role-text",
        priority: 2,
        description: `Tab: ${visibleText}`,
      });
    } else if (role === "listitem" || role === "treeitem") {
      candidates.push({
        selector: `[role="${role}"]:has-text("${escapeAttr(visibleText)}")`,
        strategy: "role-text",
        priority: 3,
        description: `List item: ${visibleText}`,
      });
    } else if (role === "cell" || role === "gridcell") {
      // Table cells with text
      candidates.push({
        selector: `[role="${role}"]:has-text("${escapeAttr(visibleText)}")`,
        strategy: "role-text",
        priority: 4,
        description: `Cell: ${visibleText}`,
      });
    } else if (role === "link") {
      candidates.push({
        selector: `[role="link"]:has-text("${escapeAttr(visibleText)}")`,
        strategy: "role-text",
        priority: 3,
        description: `Link: ${visibleText}`,
      });
    } else if (role === "checkbox" || role === "radio" || role === "switch") {
      // Form controls with labels
      candidates.push({
        selector: `[role="${role}"]:has-text("${escapeAttr(visibleText)}")`,
        strategy: "role-text",
        priority: 3,
        description: `${role}: ${visibleText}`,
      });
    } else if (role === "combobox") {
      // Dropdown/select trigger buttons
      candidates.push({
        selector: `[role="combobox"]:has-text("${escapeAttr(visibleText)}")`,
        strategy: "role-text",
        priority: 2,
        description: `Dropdown: ${visibleText}`,
      });
    } else if (info.tagName === "li") {
      // List items without explicit role
      candidates.push({
        selector: `li:has-text("${escapeAttr(visibleText)}")`,
        strategy: "role-text",
        priority: 4,
        description: `List item: ${visibleText}`,
      });
    } else if (info.tagName === "div" && visibleText.length <= 30) {
      // Generic divs with short text - might be clickable UI elements
      // Only use if text is short and likely a label
      candidates.push({
        selector: `div:has-text("${escapeAttr(visibleText)}")`,
        strategy: "text",
        priority: 8, // Lower priority for generic divs
        description: `Element with text: ${visibleText}`,
      });
    }
  }

  // Strategy 4: placeholder (for inputs)
  const placeholder = (element as HTMLInputElement).placeholder;
  if (placeholder) {
    candidates.push({
      selector: `${info.tagName}[placeholder="${escapeAttr(placeholder)}"]`,
      strategy: "placeholder",
      priority: 4,
      description: `${info.tagName} with placeholder: ${placeholder}`,
    });
  }

  // Strategy 5: name attribute (for form elements)
  const name = (element as HTMLInputElement).name;
  if (name && (info.tagName === "input" || info.tagName === "textarea" || info.tagName === "select")) {
    candidates.push({
      selector: `${info.tagName}[name="${escapeAttr(name)}"]`,
      strategy: "name",
      priority: 5,
      description: `${info.tagName} with name: ${name}`,
    });
  }

  // Strategy 6: Stable ID (not dynamically generated)
  if (info.id && !isDynamicId(info.id)) {
    candidates.push({
      selector: `#${CSS.escape(info.id)}`,
      strategy: "id",
      priority: 6,
      description: `ID: ${info.id}`,
    });
  }

  // Strategy 7: Meaningful class (only truly semantic classes)
  const meaningfulClasses = getMeaningfulClasses(element);
  if (meaningfulClasses.length > 0) {
    const cls = meaningfulClasses[0];
    // Tag + class is usually specific enough
    candidates.push({
      selector: `${info.tagName}.${CSS.escape(cls)}`,
      strategy: "css-class",
      priority: 7,
      description: `${info.tagName} with class .${cls}`,
    });

    // If element has role, add role + class variant
    if (role) {
      candidates.push({
        selector: `[role="${role}"].${CSS.escape(cls)}`,
        strategy: "role-class",
        priority: 7,
        description: `${role} with class .${cls}`,
      });
    }
  }

  // Strategy 8: title attribute
  const title = element.getAttribute("title");
  if (title && title.length <= 50) {
    candidates.push({
      selector: `${info.tagName}[title="${escapeAttr(title)}"]`,
      strategy: "title",
      priority: 8,
      description: `${info.tagName} with title: ${title}`,
    });
  }

  // Strategy 9: CSS path (always include as fallback)
  const cssPath = generateCSSPath(element);
  candidates.push({
    selector: cssPath,
    strategy: "css-path",
    priority: 100,
    description: "CSS path",
  });

  // Sort by priority and deduplicate
  candidates.sort((a, b) => a.priority - b.priority);
  const seen = new Set<string>();
  const filtered = candidates.filter(c => {
    if (seen.has(c.selector)) return false;
    seen.add(c.selector);
    return true;
  });

  // If element is in a portal, add portal-scoped versions of selectors
  // These have higher priority because they're more specific
  if (portalPrefix) {
    const portalScoped: SelectorCandidate[] = [];
    for (const candidate of filtered) {
      // Skip CSS paths (already specific) and selectors that start with the portal prefix
      if (candidate.strategy === "css-path" || candidate.selector.startsWith(portalPrefix)) {
        continue;
      }
      // Create a portal-scoped version with higher priority
      portalScoped.push({
        selector: `${portalPrefix} ${candidate.selector}`,
        strategy: `${candidate.strategy}-in-portal` as SelectorCandidate["strategy"],
        priority: candidate.priority - 0.5, // Slightly higher priority
        description: `${candidate.description} (in portal)`,
      });
    }
    // Add portal-scoped selectors at the beginning (higher priority)
    return [...portalScoped, ...filtered];
  }

  return filtered;
}

/**
 * Gets the best selector for an element.
 * If the best selector matches multiple elements, adds an index to disambiguate.
 */
export function getBestSelector(element: Element): string {
  try {
    const candidates = generateSelectorCandidates(element);
    const filteredCandidates = filterCandidatesByConfig(candidates, selectorConfig);
    const rankedCandidates = filteredCandidates.length > 0 ? filteredCandidates : candidates;
    const baseSelector = rankedCandidates[0]?.selector || generateCSSPath(element);

    // Check if the selector matches multiple elements
    const matchResult = testSelector(baseSelector);
    if (matchResult.count > 1) {
      // Find which index this element is among the matches
      const index = matchResult.elements.indexOf(element);
      if (index >= 0) {
        // Use Playwright-style nth selector
        // Format: selector >> nth=N (0-indexed)
        return `${baseSelector} >> nth=${index}`;
      }
    }

    return baseSelector;
  } catch (error) {
    console.error("[selector-generator] Error in getBestSelector:", error);
    // Fallback to CSS path
    return generateCSSPath(element);
  }
}

/**
 * Gets visible text from an element (direct text nodes only, no nested content).
 */
function getVisibleText(element: Element): string {
  // Only get direct text nodes, not deeply nested content
  let text = "";
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || "";
    }
  }
  text = text.trim();

  // If no direct text but has simple content, use it
  if (!text) {
    const innerText = element.textContent?.trim() || "";
    // Only use if it's reasonably short (likely a label, not page content)
    if (innerText.length <= 40 && !innerText.includes("\n")) {
      text = innerText;
    }
  }

  return text;
}

/**
 * Escapes special characters for use in attribute selectors.
 */
function escapeAttr(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Checks if an ID looks dynamically generated.
 */
function isDynamicId(id: string): boolean {
  const dynamicPatterns = [
    /^:r[0-9a-z]+:$/i,      // React IDs like :r1:
    /^[0-9a-f]{8,}$/i,      // Long hex strings
    /^radix-/i,             // Radix UI
    /^react-/i,             // React generated
    /^headlessui-/i,        // Headless UI
    /^rc-/i,                // RC components
    /^_/,                   // Underscore prefixed
    /[0-9]{8,}/,            // Long numbers
    /^[a-z]{1,2}[0-9]+$/i,  // Short prefix with numbers (r1, ab123)
  ];
  return dynamicPatterns.some(p => p.test(id));
}

/**
 * Gets meaningful class names (filters out utility classes).
 */
function getMeaningfulClasses(element: Element): string[] {
  const className = element.className;
  if (!className || typeof className !== "string") return [];

  const classes = className.split(/\s+/).filter(Boolean);

  // Patterns for utility/state classes to skip
  const skipPatterns = [
    // Tailwind layout & positioning
    /^(flex|grid|block|inline|hidden|relative|absolute|fixed|sticky|static)$/i,
    /^(inline-flex|inline-grid|inline-block|contents|flow-root)$/i,
    /^(float|clear|object|box|isolation|isolate)(-|$)/i,
    /^(top|right|bottom|left|inset|start|end)-/i,

    // Tailwind sizing
    /^(w|h|min-w|min-h|max-w|max-h|size)-/i,

    // Tailwind spacing
    /^(p|m|px|py|mx|my|pt|pb|pl|pr|ps|pe|mt|mb|ml|mr|ms|me|gap|space)-/i,

    // Tailwind typography
    /^(text|font|leading|tracking|whitespace|break|hyphens|content)-/i,
    /^(uppercase|lowercase|capitalize|normal-case|truncate|indent|align)(-|$)/i,
    /^(decoration|underline|overline|line-through|no-underline)(-|$)/i,
    /^(antialiased|subpixel-antialiased|italic|not-italic|ordinal|slashed-zero)$/i,
    /^(lining-nums|oldstyle-nums|proportional-nums|tabular-nums)$/i,
    /^(diagonal-fractions|stacked-fractions)$/i,
    /^line-clamp-/i,

    // Tailwind backgrounds & borders
    /^(bg|border|rounded|ring|outline|shadow|divide|from|via|to)-/i,
    /^(opacity|mix-blend|bg-blend)-/i,

    // Tailwind effects & filters
    /^(blur|brightness|contrast|drop-shadow|grayscale|hue-rotate|invert|saturate|sepia)-/i,
    /^(backdrop-blur|backdrop-brightness|backdrop-contrast|backdrop-grayscale)-/i,
    /^(backdrop-hue-rotate|backdrop-invert|backdrop-opacity|backdrop-saturate|backdrop-sepia)-/i,

    // Tailwind transforms & transitions
    /^(scale|rotate|translate|skew|origin|transform)-/i,
    /^(transition|duration|ease|delay|animate)-/i,

    // Tailwind interactivity
    /^(cursor|caret|pointer-events|resize|scroll|snap|touch|select|will-change|appearance)-/i,
    /^(accent|user-select)(-|$)/i,

    // Tailwind layout utilities
    /^(columns|col|row|auto-cols|auto-rows|grid-cols|grid-rows|grid-flow)-/i,
    /^(items|justify|self|place|order|grow|shrink|basis)-/i,
    /^(z|overflow|overscroll|aspect|container)(-|$)/i,

    // Tailwind responsive/state prefixes
    /^(hover|focus|active|disabled|dark|light|sm|md|lg|xl|2xl|xs|3xl):/i,
    /^(group|peer|first|last|odd|even|visited|checked|required|invalid|valid)(-|:)/i,
    /^(focus-within|focus-visible|placeholder|file|marker|selection|before|after):/i,

    // Tailwind arbitrary values
    /^-?[a-z]+-\[.+\]$/i,   // Arbitrary values like w-[100px]
    /^\[.+\]$/i,            // Arbitrary classes like [mask-type:alpha]
    /^data-\[.+\]:/i,       // Data modifiers
    /^[a-z]+-\d+$/i,        // Single value utilities like p-4, z-10

    // Tailwind accessibility
    /^(sr-only|not-sr-only|forced-color-adjust)(-|$)/i,

    // State/behavior classes
    /^(light|dark|focus|focused|hover|hovered|active|disabled|selected|checked)$/i,
    /^(open|opened|closed|expanded|collapsed|loading|loaded|visible|hidden)$/i,
    /^(valid|invalid|error|success|warning|dragging|resizing)$/i,
    /^focus-(visible|within)$/i,
  ];

  return classes.filter(cls => !skipPatterns.some(p => p.test(cls)));
}

/**
 * Generates a CSS path to uniquely identify an element.
 */
function generateCSSPath(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;
  let depth = 0;

  while (current && depth < 4) {
    const tag = current.tagName.toLowerCase();

    // Stop at body/html
    if (tag === "body" || tag === "html") break;

    let part = tag;

    // Add stable ID if available
    if (current.id && !isDynamicId(current.id)) {
      parts.unshift(`#${CSS.escape(current.id)}`);
      break;
    }

    // Add first meaningful class
    const classes = getMeaningfulClasses(current);
    if (classes.length > 0) {
      part += `.${CSS.escape(classes[0])}`;
    }

    // Add role if no class
    const role = current.getAttribute("role");
    if (role && classes.length === 0) {
      part += `[role="${role}"]`;
    }

    // Add nth-of-type for disambiguation
    const parent: Element | null = current.parentElement;
    if (parent) {
      const currentTag = current.tagName;
      const children: Element[] = Array.from(parent.children);
      const siblings = children.filter(c => c.tagName === currentTag);
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        part += `:nth-of-type(${index})`;
      }
    }

    parts.unshift(part);
    current = parent;
    depth++;
  }

  return parts.join(" > ") || element.tagName.toLowerCase();
}

/**
 * Tests if a selector matches elements on the page.
 * Supports Playwright-style selectors: :has-text() and >> nth=N
 */
export function testSelector(selector: string): { found: boolean; count: number; elements: Element[] } {
  try {
    let elements: Element[];
    let targetIndex: number | null = null;

    // Check for >> nth=N suffix
    const nthMatch = selector.match(/^(.+?)\s*>>\s*nth=(\d+)$/);
    let baseSelector = selector;
    if (nthMatch) {
      baseSelector = nthMatch[1];
      targetIndex = parseInt(nthMatch[2], 10);
    }

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

    if (baseSelector.includes(":has-text(")) {
      // Handle Playwright-style :has-text selectors
      const match = baseSelector.match(/^(.+?):has-text\("(.+?)"\)$/);
      if (match) {
        const [, base, text] = match;
        elements = getHasTextElements(base, text);
      } else {
        elements = [];
      }
    } else {
      elements = Array.from(document.querySelectorAll(baseSelector));
    }

    // If nth index was specified, return only that element
    if (targetIndex !== null && elements.length > targetIndex) {
      const targetElement = elements[targetIndex];
      return { found: true, count: 1, elements: [targetElement] };
    } else if (targetIndex !== null) {
      // Index out of bounds
      return { found: false, count: 0, elements: [] };
    }

    return { found: elements.length > 0, count: elements.length, elements };
  } catch {
    return { found: false, count: 0, elements: [] };
  }
}

/**
 * Target resolution utilities.
 * Converts StepTarget configurations to CSS/Playwright selectors.
 */

import type { StepTarget } from "./types";

/**
 * Resolves a target configuration to a selector string.
 * Works with both Playwright locators and standard CSS selectors.
 */
export function resolveTarget(target: StepTarget): string {
  // If explicit selector is provided, use it directly
  if (target.selector) {
    return target.selector;
  }

  switch (target.type) {
    case "button":
      if (target.text) {
        return `button:has-text("${target.text}"), [role="button"]:has-text("${target.text}")`;
      }
      if (target.name) {
        return `button[name="${target.name}"], [role="button"][name="${target.name}"]`;
      }
      break;

    case "link":
      if (target.text) {
        return `a:has-text("${target.text}")`;
      }
      if (target.name) {
        return `a[name="${target.name}"]`;
      }
      break;

    case "input":
      if (target.name) {
        return `input[name="${target.name}"], textarea[name="${target.name}"]`;
      }
      if (target.text) {
        // Input with associated label
        return `label:has-text("${target.text}") + input, label:has-text("${target.text}") input`;
      }
      break;

    case "text":
      if (target.text) {
        return `text="${target.text}"`;
      }
      break;

    case "selector":
      // Selector type but no selector provided
      break;
  }

  throw new Error(`Unable to resolve target: ${JSON.stringify(target)}`);
}

/**
 * Replaces template variables in paths.
 * Supports: {orgSlug}, {baseURL}
 */
export function resolvePath(
  pathTemplate: string,
  variables: Record<string, string>
): string {
  let result = pathTemplate;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value);
  }
  return result;
}

/**
 * Extracts the org slug from a URL path.
 * Expects paths like /app/{orgSlug}/...
 */
export function extractOrgSlug(pathname: string): string | null {
  const match = pathname.match(/\/app\/([^/]+)/);
  return match ? match[1] : null;
}

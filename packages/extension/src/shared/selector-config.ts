import type { SelectorConfig } from "./types";

export const SELECTOR_STRATEGY_OPTIONS = [
  {
    id: "data-testid",
    label: "Test IDs",
    description: "Prefer data-testid attributes for stable selectors.",
  },
  {
    id: "aria-label",
    label: "ARIA labels",
    description: "Use aria-label attributes where available.",
  },
  {
    id: "role-text",
    label: "Role + text",
    description: "Use role-based selectors with visible text.",
  },
  {
    id: "placeholder",
    label: "Placeholders",
    description: "Use input placeholders for form fields.",
  },
  {
    id: "name",
    label: "Form names",
    description: "Use name attributes on form controls.",
  },
  {
    id: "id",
    label: "Stable IDs",
    description: "Use non-dynamic ID attributes.",
  },
  {
    id: "css-class",
    label: "Semantic classes",
    description: "Use meaningful class names with tag selectors.",
  },
  {
    id: "role-class",
    label: "Role + class",
    description: "Use role-based selectors with classes.",
  },
  {
    id: "title",
    label: "Title attributes",
    description: "Use title attributes for descriptive elements.",
  },
  {
    id: "text",
    label: "Generic text",
    description: "Fallback to element text when needed.",
  },
  {
    id: "css-path",
    label: "CSS path",
    description: "Always-available fallback selector.",
  },
] as const;

export const DEFAULT_SELECTOR_CONFIG: SelectorConfig = {
  enabledStrategies: SELECTOR_STRATEGY_OPTIONS.map((option) => option.id),
};

export function normalizeSelectorConfig(config?: unknown): SelectorConfig {
  const candidate =
    config && typeof config === "object"
      ? (config as Partial<SelectorConfig>)
      : undefined;
  const enabled = Array.isArray(candidate?.enabledStrategies)
    ? candidate.enabledStrategies.map((value) => String(value).trim()).filter(Boolean)
    : [];
  const unique = Array.from(new Set(enabled));
  return {
    enabledStrategies: unique.length > 0 ? unique : DEFAULT_SELECTOR_CONFIG.enabledStrategies,
  };
}

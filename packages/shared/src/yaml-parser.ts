/**
 * YAML parsing and serialization for demo definitions.
 * Shared between CLI and extension.
 */

import { parse, stringify } from "yaml";
import type {
  DemoDefinition,
  DemoStep,
  DemoAction,
  StepTarget,
  WaitCondition,
  ActionType,
} from "./types";

/**
 * Parses a YAML string into a DemoDefinition.
 */
export function parseFromYAML(yamlString: string): DemoDefinition {
  const parsed = parse(yamlString) as Record<string, unknown>;

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid YAML: expected an object");
  }

  return {
    name: String(parsed.name || "untitled"),
    title: String(parsed.title || "Untitled Demo"),
    description: parsed.description ? String(parsed.description) : undefined,
    steps: Array.isArray(parsed.steps) ? parsed.steps.map(parseStep) : [],
  };
}

function parseStep(step: unknown): DemoStep {
  if (!step || typeof step !== "object") {
    return createEmptyStep();
  }

  const s = step as Record<string, unknown>;
  return {
    id: String(s.id || `step-${Date.now()}`),
    script: String(s.script || ""),
    actions: Array.isArray(s.actions) ? s.actions.map(parseAction) : [],
  };
}

function parseAction(action: unknown): DemoAction {
  if (!action || typeof action !== "object") {
    return { action: "wait", duration: 1000 };
  }

  const a = action as Record<string, unknown>;
  const result: DemoAction = {
    action: (a.action as ActionType) || "wait",
  };

  // Parse target
  if (a.target && typeof a.target === "object") {
    const t = a.target as Record<string, unknown>;
    result.target = {
      type: (t.type as StepTarget["type"]) || "selector",
      selector: t.selector ? String(t.selector) : undefined,
      text: t.text ? String(t.text) : undefined,
      name: t.name ? String(t.name) : undefined,
    };
  }

  // Parse scalar fields
  if (a.path !== undefined) result.path = String(a.path);
  if (a.text !== undefined) result.text = String(a.text);
  if (a.file !== undefined) result.file = String(a.file);
  if (a.duration !== undefined) result.duration = Number(a.duration);
  if (a.highlight !== undefined) result.highlight = Boolean(a.highlight);

  // Parse waitFor
  if (a.waitFor && typeof a.waitFor === "object") {
    const w = a.waitFor as Record<string, unknown>;
    result.waitFor = {
      type: (w.type as WaitCondition["type"]) || "text",
      value: w.value ? String(w.value) : undefined,
      timeout: w.timeout ? Number(w.timeout) : 15000,
    };
  }

  // Parse drag
  if (a.drag && typeof a.drag === "object") {
    const d = a.drag as Record<string, unknown>;
    result.drag = {
      deltaX: Number(d.deltaX) || 0,
      deltaY: Number(d.deltaY) || 0,
      steps: d.steps ? Number(d.steps) : undefined,
    };
  }

  return result;
}

/**
 * Serializes a DemoDefinition to a YAML string.
 */
export function serializeToYAML(demo: DemoDefinition): string {
  const cleanDemo = {
    name: demo.name,
    title: demo.title,
    ...(demo.description && { description: demo.description }),
    steps: demo.steps.map(serializeStep),
  };

  return stringify(cleanDemo, {
    indent: 2,
    lineWidth: 100,
    defaultStringType: "QUOTE_DOUBLE",
    defaultKeyType: "PLAIN",
  });
}

function serializeStep(step: DemoStep): object {
  return {
    id: step.id,
    script: step.script,
    actions: step.actions.map(serializeAction),
  };
}

function serializeAction(action: DemoAction): object {
  const result: Record<string, unknown> = {
    action: action.action,
  };

  if (action.path !== undefined) {
    result.path = action.path;
  }

  if (action.target !== undefined) {
    result.target = serializeTarget(action.target);
  }

  if (action.text !== undefined) {
    result.text = action.text;
  }

  if (action.file !== undefined) {
    result.file = action.file;
  }

  if (action.duration !== undefined) {
    result.duration = action.duration;
  }

  if (action.highlight === true) {
    result.highlight = true;
  }

  if (action.waitFor !== undefined) {
    result.waitFor = serializeWaitCondition(action.waitFor);
  }

  if (action.drag !== undefined) {
    result.drag = {
      deltaX: action.drag.deltaX,
      deltaY: action.drag.deltaY,
      ...(action.drag.steps !== undefined && { steps: action.drag.steps }),
    };
  }

  return result;
}

function serializeTarget(target: StepTarget): object {
  const result: Record<string, unknown> = {
    type: target.type,
  };

  if (target.text !== undefined) {
    result.text = target.text;
  }

  if (target.selector !== undefined) {
    result.selector = target.selector;
  }

  if (target.name !== undefined) {
    result.name = target.name;
  }

  return result;
}

function serializeWaitCondition(waitFor: WaitCondition): object {
  const result: Record<string, unknown> = {
    type: waitFor.type,
  };

  if (waitFor.value !== undefined) {
    result.value = waitFor.value;
  }

  if (waitFor.timeout !== undefined) {
    result.timeout = waitFor.timeout;
  }

  return result;
}

/**
 * Validates a demo definition, throwing on errors.
 */
export function validateDemoDefinition(definition: DemoDefinition): void {
  if (!definition.name) {
    throw new Error("Demo definition missing 'name' field");
  }
  if (!definition.title) {
    throw new Error("Demo definition missing 'title' field");
  }
  if (!definition.steps || !Array.isArray(definition.steps)) {
    throw new Error("Demo definition missing 'steps' array");
  }

  for (const step of definition.steps) {
    if (!step.id) {
      throw new Error("Step missing 'id' field");
    }
    if (step.script === undefined || step.script === null) {
      throw new Error(`Step '${step.id}' missing 'script' field`);
    }
    if (!step.actions || !Array.isArray(step.actions)) {
      throw new Error(`Step '${step.id}' missing 'actions' array`);
    }
  }
}

/**
 * Creates a default empty demo definition.
 */
export function createEmptyDemo(): DemoDefinition {
  return {
    name: "new-demo",
    title: "New Demo",
    description: "",
    steps: [],
  };
}

/**
 * Creates a default empty step.
 */
export function createEmptyStep(id?: string): DemoStep {
  const stepId = id || `step-${Date.now()}`;
  return {
    id: stepId,
    script: "",
    actions: [],
  };
}

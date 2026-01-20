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
} from "./types";
import {
  DEMO_SCHEMA_VERSION,
  formatValidationError,
  parseDemoDefinition,
  safeParseDemoDefinition,
} from "./schema";

/**
 * Parses a YAML string into a DemoDefinition.
 */
export function parseFromYAML(
  yamlString: string,
  options?: { resolveSecrets?: (key: string) => string | undefined }
): DemoDefinition {
  const parsed = parse(yamlString);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid YAML: expected an object");
  }
  const resolved = options?.resolveSecrets
    ? resolveSecrets(parsed, options.resolveSecrets)
    : parsed;
  try {
    return parseDemoDefinition(resolved);
  } catch (error) {
    throw new Error(formatValidationError(error));
  }
}

/**
 * Serializes a DemoDefinition to a YAML string.
 */
export function serializeToYAML(demo: DemoDefinition): string {
  const cleanDemo = {
    version: demo.version ?? DEMO_SCHEMA_VERSION,
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
  const result = safeParseDemoDefinition(definition);
  if (!result.success) {
    throw new Error(formatValidationError(result.error));
  }
}

/**
 * Creates a default empty demo definition.
 */
export function createEmptyDemo(): DemoDefinition {
  return {
    version: DEMO_SCHEMA_VERSION,
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

const SECRET_PATTERN = /\$\{(ENV|SECRET):([A-Za-z0-9_]+)\}/g;

function resolveSecrets(
  value: unknown,
  resolver: (key: string) => string | undefined,
  path = "root"
): unknown {
  if (typeof value === "string") {
    if (!SECRET_PATTERN.test(value)) {
      return value;
    }
    SECRET_PATTERN.lastIndex = 0;
    return value.replace(SECRET_PATTERN, (_match, _type, key: string) => {
      const resolved = resolver(key);
      if (resolved === undefined) {
        throw new Error(`Missing secret for ${key} at ${path}`);
      }
      return resolved;
    });
  }

  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      resolveSecrets(entry, resolver, `${path}[${index}]`)
    );
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = resolveSecrets(entry, resolver, `${path}.${key}`);
    }
    return result;
  }

  return value;
}

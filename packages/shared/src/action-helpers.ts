/**
 * Helper functions for creating common actions.
 */

import type { DemoAction, WaitCondition } from "./types";

/**
 * Creates a click action.
 */
export function createClickAction(selector: string, highlight = false): DemoAction {
  return {
    action: "click",
    target: {
      type: "selector",
      selector,
    },
    highlight,
  };
}

/**
 * Creates a type/input action.
 */
export function createTypeAction(selector: string, text: string): DemoAction {
  return {
    action: "type",
    target: {
      type: "selector",
      selector,
    },
    text,
  };
}

/**
 * Creates a navigate action.
 */
export function createNavigateAction(path: string): DemoAction {
  return {
    action: "navigate",
    path,
  };
}

/**
 * Creates a wait action with a fixed duration.
 */
export function createWaitAction(duration: number): DemoAction {
  return {
    action: "wait",
    duration,
  };
}

/**
 * Creates a wait action with a condition.
 */
export function createWaitForAction(
  type: WaitCondition["type"],
  value?: string,
  timeout = 15000
): DemoAction {
  return {
    action: "wait",
    waitFor: {
      type,
      value,
      timeout,
    },
  };
}

/**
 * Creates an upload action.
 * Note: selector is optional - defaults to first file input on page.
 */
export function createUploadAction(file: string, selector?: string): DemoAction {
  const action: DemoAction = {
    action: "upload",
    file,
  };
  if (selector) {
    action.target = {
      type: "selector",
      selector,
    };
  }
  return action;
}

/**
 * Creates a hover action.
 */
export function createHoverAction(selector: string): DemoAction {
  return {
    action: "hover",
    target: {
      type: "selector",
      selector,
    },
  };
}

/**
 * Creates a scroll action.
 */
export function createScrollAction(duration = 500): DemoAction {
  return {
    action: "scroll",
    duration,
  };
}

/**
 * Creates a scroll-to action.
 */
export function createScrollToAction(selector: string): DemoAction {
  return {
    action: "scrollTo",
    target: {
      type: "selector",
      selector,
    },
  };
}

/**
 * Creates a drag action.
 */
export function createDragAction(
  selector: string,
  deltaX: number,
  deltaY: number,
  steps = 20
): DemoAction {
  return {
    action: "drag",
    target: {
      type: "selector",
      selector,
    },
    drag: {
      deltaX,
      deltaY,
      steps,
    },
  };
}

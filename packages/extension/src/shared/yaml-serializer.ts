/**
 * Re-export YAML utilities from @demo-tools/shared.
 * This allows existing imports in the extension to continue working.
 */

export {
  serializeToYAML,
  parseFromYAML,
  createEmptyDemo,
  createEmptyStep,
  createClickAction,
  createWaitAction,
  createWaitForAction,
  createNavigateAction,
  createTypeAction,
  createUploadAction,
} from "@demo-tools/shared";

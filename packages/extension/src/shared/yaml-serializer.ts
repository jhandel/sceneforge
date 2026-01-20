/**
 * Re-export YAML utilities from @t3lnet/sceneforge-shared.
 * This allows existing imports in the extension to continue working.
 */

export {
  serializeToYAML,
  parseFromYAML,
  parseDemoDefinition,
  safeParseDemoDefinition,
  formatValidationError,
  demoDefinitionSchema,
  DEMO_SCHEMA_VERSION,
  createEmptyDemo,
  createEmptyStep,
  createClickAction,
  createWaitAction,
  createWaitForAction,
  createNavigateAction,
  createTypeAction,
  createUploadAction,
} from "@t3lnet/sceneforge-shared";

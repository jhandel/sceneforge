/**
 * LLM Context Tooling for SceneForge
 *
 * This module provides tools for generating and deploying
 * LLM instruction files for AI coding assistants.
 */

// Template loading
export {
  loadTemplate,
  loadTemplatesByCategory,
  interpolateVariables,
  composeTemplates,
  listTemplates,
  templateExists,
  type LoadedTemplate,
  type TemplateVariables,
} from "./template-loader.js";

// Tool formatting
export {
  formatForTool,
  getOutputPath,
  getSplitOutputPaths,
  getToolConfig,
  getSupportedTools,
  formatStageName,
  getStageFileName,
  isValidTool,
  isValidFormat,
  TOOL_CONFIGS,
  type TargetTool,
  type DeployFormat,
  type ToolConfig,
  type FormattedOutput,
} from "./tool-formatter.js";

// Context builder
export {
  buildContext,
  deployContext,
  previewContext,
  listDeployedContext,
  removeContext,
  getSkill,
  listSkills,
  hasTemplates,
  type Stage,
  type ContextBuilderOptions,
  type DeployResult,
  type PreviewResult,
} from "./context-builder.js";

/**
 * Tool-specific formatting for LLM context files.
 * Formats content and determines file locations for each target tool.
 */

export type TargetTool = "cursor" | "copilot" | "claude" | "codex";
export type DeployFormat = "combined" | "split";

export interface ToolConfig {
  name: string;
  description: string;
  combinedFile: string;
  splitDir: string;
  splitFilePrefix: string;
  fileExtension: string;
  supportsSkills: boolean;
}

export interface FormattedOutput {
  tool: TargetTool;
  filePath: string;
  content: string;
}

/**
 * Configuration for each supported LLM tool.
 */
export const TOOL_CONFIGS: Record<TargetTool, ToolConfig> = {
  cursor: {
    name: "Cursor",
    description: "Cursor AI IDE with .cursorrules support",
    combinedFile: ".cursorrules",
    splitDir: ".cursor/rules",
    splitFilePrefix: "",
    fileExtension: ".md",
    supportsSkills: true,
  },
  copilot: {
    name: "GitHub Copilot",
    description: "GitHub Copilot with instructions file",
    combinedFile: ".github/copilot-instructions.md",
    splitDir: ".github/copilot",
    splitFilePrefix: "",
    fileExtension: ".md",
    supportsSkills: false,
  },
  claude: {
    name: "Claude Code",
    description: "Claude Code CLI with CLAUDE.md support",
    combinedFile: "CLAUDE.md",
    splitDir: ".claude/rules",
    splitFilePrefix: "",
    fileExtension: ".md",
    supportsSkills: true,
  },
  codex: {
    name: "Codex",
    description: "OpenAI Codex with AGENTS.md support",
    combinedFile: "AGENTS.md",
    splitDir: ".codex",
    splitFilePrefix: "",
    fileExtension: ".md",
    supportsSkills: false,
  },
};

/**
 * Get the list of all supported tools.
 */
export function getSupportedTools(): TargetTool[] {
  return Object.keys(TOOL_CONFIGS) as TargetTool[];
}

/**
 * Get configuration for a specific tool.
 */
export function getToolConfig(tool: TargetTool): ToolConfig {
  return TOOL_CONFIGS[tool];
}

/**
 * Format content for a specific tool with appropriate headers and structure.
 */
export function formatForTool(
  tool: TargetTool,
  content: string,
  options?: {
    stage?: string;
    includeToolHeader?: boolean;
  }
): string {
  const config = TOOL_CONFIGS[tool];
  const { stage, includeToolHeader = true } = options ?? {};

  const lines: string[] = [];

  // Add tool-specific header
  if (includeToolHeader) {
    lines.push(`# SceneForge LLM Context`);
    lines.push(``);
    lines.push(`> Generated for ${config.name}`);
    if (stage) {
      lines.push(`> Stage: ${stage}`);
    }
    lines.push(``);
    lines.push(`---`);
    lines.push(``);
  }

  lines.push(content);

  return lines.join("\n");
}

/**
 * Get the output file path for a tool.
 */
export function getOutputPath(
  tool: TargetTool,
  format: DeployFormat,
  outputDir: string,
  stageName?: string
): string {
  const config = TOOL_CONFIGS[tool];

  if (format === "combined") {
    return `${outputDir}/${config.combinedFile}`;
  }

  // Split format
  const fileName = stageName
    ? `${config.splitFilePrefix}${stageName}${config.fileExtension}`
    : `${config.splitFilePrefix}main${config.fileExtension}`;

  return `${outputDir}/${config.splitDir}/${fileName}`;
}

/**
 * Get all output paths for a tool in split format.
 */
export function getSplitOutputPaths(
  tool: TargetTool,
  outputDir: string,
  stageNames: string[]
): string[] {
  return stageNames.map((stage) => getOutputPath(tool, "split", outputDir, stage));
}

/**
 * Format stage name for display.
 */
export function formatStageName(stage: string): string {
  const stageMap: Record<string, string> = {
    actions: "Stage 1: Action Generation",
    scripts: "Stage 2: Script Writing",
    balance: "Stage 3: Step Balancing",
    rebalance: "Stage 4: Rebalancing",
  };

  return stageMap[stage] ?? stage;
}

/**
 * Get stage file name from stage identifier.
 */
export function getStageFileName(stage: string): string {
  const stageFileMap: Record<string, string> = {
    actions: "stage1-actions",
    scripts: "stage2-scripts",
    balance: "stage3-balancing",
    rebalance: "stage4-rebalancing",
  };

  return stageFileMap[stage] ?? stage;
}

/**
 * Validate a tool name.
 */
export function isValidTool(tool: string): tool is TargetTool {
  return tool in TOOL_CONFIGS;
}

/**
 * Validate a deploy format.
 */
export function isValidFormat(format: string): format is DeployFormat {
  return format === "combined" || format === "split";
}

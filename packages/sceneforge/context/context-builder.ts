/**
 * Main context builder for generating LLM instruction files.
 * Orchestrates template loading, composition, and formatting.
 */

import * as fs from "fs/promises";
import * as path from "path";
import {
  loadTemplate,
  loadTemplatesByCategory,
  interpolateVariables,
  composeTemplates,
  listTemplates,
  type LoadedTemplate,
  type TemplateVariables,
} from "./template-loader.js";
import {
  formatForTool,
  getOutputPath,
  getToolConfig,
  getSupportedTools,
  formatStageName,
  getStageFileName,
  type TargetTool,
  type DeployFormat,
} from "./tool-formatter.js";

export type Stage = "actions" | "scripts" | "balance" | "rebalance" | "all";

// Markers for identifying SceneForge content in existing files
const SCENEFORGE_START_MARKER = "<!-- SCENEFORGE_CONTEXT_START -->";
const SCENEFORGE_END_MARKER = "<!-- SCENEFORGE_CONTEXT_END -->";

export interface ContextBuilderOptions {
  target: TargetTool | "all";
  stage: Stage;
  format: DeployFormat;
  outputDir: string;
  variables?: TemplateVariables;
}

export interface DeployResult {
  tool: TargetTool;
  filePath: string;
  stage?: string;
  created: boolean;
  skipped?: boolean;
  error?: string;
}

export interface PreviewResult {
  tool: TargetTool;
  stage?: string;
  content: string;
}

/**
 * Wrap content with SceneForge markers for identification.
 */
function wrapWithMarkers(content: string): string {
  return `${SCENEFORGE_START_MARKER}\n${content}\n${SCENEFORGE_END_MARKER}`;
}

/**
 * Merge SceneForge content into an existing file.
 * - If file doesn't exist, returns wrapped content
 * - If file exists without markers, appends wrapped content
 * - If file exists with markers, replaces the marked section
 */
async function mergeWithExisting(
  filePath: string,
  newContent: string
): Promise<{ content: string; merged: boolean }> {
  const wrappedContent = wrapWithMarkers(newContent);

  try {
    const existingContent = await fs.readFile(filePath, "utf-8");

    // Check if file already has SceneForge markers
    const startIndex = existingContent.indexOf(SCENEFORGE_START_MARKER);
    const endIndex = existingContent.indexOf(SCENEFORGE_END_MARKER);

    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      // Replace existing SceneForge section
      const beforeSection = existingContent.slice(0, startIndex);
      const afterSection = existingContent.slice(
        endIndex + SCENEFORGE_END_MARKER.length
      );
      return {
        content: beforeSection + wrappedContent + afterSection,
        merged: true,
      };
    } else {
      // Append SceneForge section to existing content
      const separator = existingContent.trim().endsWith("-->") ? "\n\n" : "\n\n---\n\n";
      return {
        content: existingContent.trimEnd() + separator + wrappedContent + "\n",
        merged: true,
      };
    }
  } catch (error) {
    // File doesn't exist, return wrapped content for new file
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { content: wrappedContent, merged: false };
    }
    throw error;
  }
}

async function writeSplitPointer(
  tool: TargetTool,
  stageNames: Stage[],
  outputDir: string
): Promise<{ filePath: string; merged: boolean }> {
  const config = getToolConfig(tool);
  const stageLines = stageNames.map((stage) => {
    const friendly = formatStageName(stage);
    const stageFile = `${config.splitFilePrefix}${getStageFileName(stage)}${config.fileExtension}`;
    const relativePath = path.posix.join(config.splitDir, stageFile);
    return `- ${friendly}: ${relativePath}`;
  });

  const pointerBody = [
    "SceneForge context for this tool is split across the following stage files:",
    "",
    ...stageLines,
    "",
    `Open the stage file that matches the work you're doing, or run "npx sceneforge context preview --target ${tool} --stage <stage>" to inspect a specific stage.`,
  ].join("\n");

  const formattedPointer = formatForTool(tool, pointerBody, {
    includeToolHeader: true,
  });

  const combinedPath = path.join(outputDir, config.combinedFile);
  await fs.mkdir(path.dirname(combinedPath), { recursive: true });
  const { content: finalContent, merged } = await mergeWithExisting(
    combinedPath,
    formattedPointer
  );
  await fs.writeFile(combinedPath, finalContent, "utf-8");

  return { filePath: combinedPath, merged };
}

/**
 * Build context content for a specific tool and stage.
 */
export async function buildContext(
  tool: TargetTool,
  stage: Stage,
  variables?: TemplateVariables
): Promise<string> {
  const templates: LoadedTemplate[] = [];

  // Always load base templates
  const baseTemplates = await loadTemplatesByCategory("base");
  templates.push(...baseTemplates);

  // Load stage-specific templates
  if (stage === "all") {
    const stageTemplates = await loadTemplatesByCategory("stages");
    templates.push(...stageTemplates);
  } else {
    const stageFileName = getStageFileName(stage);
    try {
      const stageTemplate = await loadTemplate("stages", stageFileName);
      templates.push(stageTemplate);
    } catch {
      // Stage template may not exist yet
    }
  }

  // Compose templates
  let content = composeTemplates(templates, {
    separator: "\n\n---\n\n",
    includeHeaders: false,
  });

  // Interpolate variables
  if (variables) {
    content = interpolateVariables(content, variables);
  }

  // Format for target tool
  const stageName = stage === "all" ? undefined : formatStageName(stage);
  return formatForTool(tool, content, { stage: stageName });
}

/**
 * Deploy context files to the target directory.
 */
export async function deployContext(
  options: ContextBuilderOptions
): Promise<DeployResult[]> {
  const { target, stage, format, outputDir, variables } = options;
  const results: DeployResult[] = [];

  // Determine which tools to deploy to
  const tools: TargetTool[] =
    target === "all" ? getSupportedTools() : [target];

  // Determine which stages to deploy
  const stages: Stage[] =
    stage === "all"
      ? ["actions", "scripts", "balance", "rebalance"]
      : [stage];

  for (const tool of tools) {
    if (format === "combined") {
      // Generate single combined file
      try {
        const content = await buildContext(tool, "all", variables);
        const filePath = getOutputPath(tool, format, outputDir);
        const absolutePath = path.resolve(filePath);

        // Ensure directory exists
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });

        // Merge with existing content or create new
        const { content: finalContent, merged } = await mergeWithExisting(
          absolutePath,
          content
        );

        // Write file
        await fs.writeFile(absolutePath, finalContent, "utf-8");

        results.push({
          tool,
          filePath: absolutePath,
          created: true,
          skipped: false,
        });

        if (merged) {
          console.log(`  [merged] ${path.relative(outputDir, absolutePath)}`);
        }
      } catch (error) {
        results.push({
          tool,
          filePath: getOutputPath(tool, format, outputDir),
          created: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } else {
      // Generate split files for each stage
      const deployedStages: Stage[] = [];
      for (const stg of stages) {
        try {
          const content = await buildContext(tool, stg, variables);
          const stageName = getStageFileName(stg);
          const filePath = getOutputPath(tool, format, outputDir, stageName);
          const absolutePath = path.resolve(filePath);

          // Ensure directory exists
          await fs.mkdir(path.dirname(absolutePath), { recursive: true });

          // Merge with existing content or create new
          const { content: finalContent, merged } = await mergeWithExisting(
            absolutePath,
            content
          );

          // Write file
          await fs.writeFile(absolutePath, finalContent, "utf-8");

          results.push({
            tool,
            filePath: absolutePath,
            stage: stg,
            created: true,
            skipped: false,
          });

          if (merged) {
            console.log(`  [merged] ${path.relative(outputDir, absolutePath)}`);
          }
          deployedStages.push(stg);
        } catch (error) {
          results.push({
            tool,
            filePath: getOutputPath(tool, format, outputDir, stg),
            stage: stg,
            created: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      if (deployedStages.length > 0) {
        const pointerResult = await writeSplitPointer(
          tool,
          deployedStages,
          outputDir
        );
        results.push({
          tool,
          filePath: pointerResult.filePath,
          created: true,
          skipped: false,
        });
        if (pointerResult.merged) {
          console.log(
            `  [merged] ${path.relative(outputDir, pointerResult.filePath)}`
          );
        }
      }
    }
  }

  return results;
}

/**
 * Preview context content without writing files.
 */
export async function previewContext(
  tool: TargetTool,
  stage: Stage,
  variables?: TemplateVariables
): Promise<PreviewResult> {
  const content = await buildContext(tool, stage, variables);

  return {
    tool,
    stage: stage === "all" ? undefined : stage,
    content,
  };
}

/**
 * List deployed context files in a directory.
 */
export async function listDeployedContext(
  outputDir: string
): Promise<{
  files: Array<{ tool: TargetTool; path: string; exists: boolean }>;
}> {
  const tools = getSupportedTools();
  const files: Array<{ tool: TargetTool; path: string; exists: boolean }> = [];

  for (const tool of tools) {
    const config = getToolConfig(tool);

    // Check combined file
    const combinedPath = path.join(outputDir, config.combinedFile);
    try {
      await fs.access(combinedPath);
      files.push({ tool, path: combinedPath, exists: true });
    } catch {
      files.push({ tool, path: combinedPath, exists: false });
    }

    // Check split directory
    const splitDir = path.join(outputDir, config.splitDir);
    try {
      const splitFiles = await fs.readdir(splitDir);
      for (const file of splitFiles) {
        if (file.endsWith(config.fileExtension)) {
          files.push({
            tool,
            path: path.join(splitDir, file),
            exists: true,
          });
        }
      }
    } catch {
      // Split directory doesn't exist
    }
  }

  return { files };
}

/**
 * Remove deployed context files.
 */
export async function removeContext(
  outputDir: string,
  target: TargetTool | "all"
): Promise<Array<{ path: string; removed: boolean; error?: string }>> {
  const tools: TargetTool[] =
    target === "all" ? getSupportedTools() : [target];
  const results: Array<{ path: string; removed: boolean; error?: string }> = [];

  for (const tool of tools) {
    const config = getToolConfig(tool);

    // Remove combined file
    const combinedPath = path.join(outputDir, config.combinedFile);
    try {
      await fs.unlink(combinedPath);
      results.push({ path: combinedPath, removed: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        results.push({
          path: combinedPath,
          removed: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Remove split directory
    const splitDir = path.join(outputDir, config.splitDir);
    try {
      await fs.rm(splitDir, { recursive: true });
      results.push({ path: splitDir, removed: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        results.push({
          path: splitDir,
          removed: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return results;
}

/**
 * Get a skill template by name.
 */
export async function getSkill(name: string): Promise<{
  name: string;
  content: string;
} | null> {
  try {
    const template = await loadTemplate("skills", name);
    return { name: template.name, content: template.content };
  } catch {
    return null;
  }
}

/**
 * List all available skills.
 */
export async function listSkills(): Promise<string[]> {
  const templates = await listTemplates();
  return templates.skills;
}

/**
 * Check if templates are available.
 */
export async function hasTemplates(): Promise<boolean> {
  const templates = await listTemplates();
  return templates.base.length > 0;
}

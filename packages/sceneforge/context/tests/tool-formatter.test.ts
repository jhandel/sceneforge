import { describe, it, expect } from "vitest";
import {
  getSupportedTools,
  getToolConfig,
  formatForTool,
  getOutputPath,
  getSplitOutputPaths,
  formatStageName,
  getStageFileName,
  isValidTool,
  isValidFormat,
  TOOL_CONFIGS,
} from "../tool-formatter";

describe("tool-formatter", () => {
  describe("getSupportedTools", () => {
    it("returns all supported tools", () => {
      const tools = getSupportedTools();
      expect(tools).toContain("cursor");
      expect(tools).toContain("copilot");
      expect(tools).toContain("claude");
      expect(tools).toContain("codex");
      expect(tools.length).toBe(4);
    });
  });

  describe("getToolConfig", () => {
    it("returns config for cursor", () => {
      const config = getToolConfig("cursor");
      expect(config.name).toBe("Cursor");
      expect(config.combinedFile).toBe(".cursorrules");
      expect(config.splitDir).toBe(".cursor/rules");
    });

    it("returns config for copilot", () => {
      const config = getToolConfig("copilot");
      expect(config.name).toBe("GitHub Copilot");
      expect(config.combinedFile).toBe(".github/copilot-instructions.md");
    });

    it("returns config for claude", () => {
      const config = getToolConfig("claude");
      expect(config.name).toBe("Claude Code");
      expect(config.combinedFile).toBe("CLAUDE.md");
    });

    it("returns config for codex", () => {
      const config = getToolConfig("codex");
      expect(config.name).toBe("Codex");
      expect(config.combinedFile).toBe("AGENTS.md");
    });
  });

  describe("TOOL_CONFIGS", () => {
    it("has configs for all tools", () => {
      expect(TOOL_CONFIGS.cursor).toBeDefined();
      expect(TOOL_CONFIGS.copilot).toBeDefined();
      expect(TOOL_CONFIGS.claude).toBeDefined();
      expect(TOOL_CONFIGS.codex).toBeDefined();
    });

    it("all configs have required properties", () => {
      for (const [key, config] of Object.entries(TOOL_CONFIGS)) {
        expect(config.name).toBeDefined();
        expect(config.combinedFile).toBeDefined();
        expect(config.splitDir).toBeDefined();
        expect(config.fileExtension).toBeDefined();
        expect(typeof config.supportsSkills).toBe("boolean");
      }
    });
  });

  describe("formatForTool", () => {
    it("adds header by default", () => {
      const result = formatForTool("claude", "Content here");
      expect(result).toContain("# SceneForge LLM Context");
      expect(result).toContain("Claude Code");
      expect(result).toContain("Content here");
    });

    it("includes stage when provided", () => {
      const result = formatForTool("cursor", "Content", { stage: "Stage 1" });
      expect(result).toContain("Stage: Stage 1");
    });

    it("can skip header", () => {
      const result = formatForTool("claude", "Content", { includeToolHeader: false });
      expect(result).toBe("Content");
    });
  });

  describe("getOutputPath", () => {
    it("returns combined path for combined format", () => {
      const path = getOutputPath("claude", "combined", "/project");
      expect(path).toBe("/project/CLAUDE.md");
    });

    it("returns split path with stage", () => {
      const path = getOutputPath("claude", "split", "/project", "stage1-actions");
      expect(path).toBe("/project/.claude/rules/stage1-actions.md");
    });

    it("returns main path when no stage for split format", () => {
      const path = getOutputPath("cursor", "split", "/project");
      expect(path).toBe("/project/.cursor/rules/main.md");
    });

    it("handles cursor combined path", () => {
      const path = getOutputPath("cursor", "combined", "/project");
      expect(path).toBe("/project/.cursorrules");
    });

    it("handles copilot path", () => {
      const path = getOutputPath("copilot", "combined", "/project");
      expect(path).toBe("/project/.github/copilot-instructions.md");
    });
  });

  describe("getSplitOutputPaths", () => {
    it("returns paths for all stages", () => {
      const paths = getSplitOutputPaths("claude", "/project", ["stage1", "stage2"]);
      expect(paths).toHaveLength(2);
      expect(paths[0]).toContain("stage1");
      expect(paths[1]).toContain("stage2");
    });
  });

  describe("formatStageName", () => {
    it("formats action stage", () => {
      expect(formatStageName("actions")).toBe("Stage 1: Action Generation");
    });

    it("formats scripts stage", () => {
      expect(formatStageName("scripts")).toBe("Stage 2: Script Writing");
    });

    it("formats balance stage", () => {
      expect(formatStageName("balance")).toBe("Stage 3: Step Balancing");
    });

    it("formats rebalance stage", () => {
      expect(formatStageName("rebalance")).toBe("Stage 4: Rebalancing");
    });

    it("returns input for unknown stage", () => {
      expect(formatStageName("unknown")).toBe("unknown");
    });
  });

  describe("getStageFileName", () => {
    it("converts actions to file name", () => {
      expect(getStageFileName("actions")).toBe("stage1-actions");
    });

    it("converts scripts to file name", () => {
      expect(getStageFileName("scripts")).toBe("stage2-scripts");
    });

    it("converts balance to file name", () => {
      expect(getStageFileName("balance")).toBe("stage3-balancing");
    });

    it("converts rebalance to file name", () => {
      expect(getStageFileName("rebalance")).toBe("stage4-rebalancing");
    });

    it("returns input for unknown stage", () => {
      expect(getStageFileName("custom")).toBe("custom");
    });
  });

  describe("isValidTool", () => {
    it("returns true for valid tools", () => {
      expect(isValidTool("cursor")).toBe(true);
      expect(isValidTool("copilot")).toBe(true);
      expect(isValidTool("claude")).toBe(true);
      expect(isValidTool("codex")).toBe(true);
    });

    it("returns false for invalid tools", () => {
      expect(isValidTool("invalid")).toBe(false);
      expect(isValidTool("")).toBe(false);
      expect(isValidTool("all")).toBe(false);
    });
  });

  describe("isValidFormat", () => {
    it("returns true for valid formats", () => {
      expect(isValidFormat("combined")).toBe(true);
      expect(isValidFormat("split")).toBe(true);
    });

    it("returns false for invalid formats", () => {
      expect(isValidFormat("invalid")).toBe(false);
      expect(isValidFormat("")).toBe(false);
    });
  });
});

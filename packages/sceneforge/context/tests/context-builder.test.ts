import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  buildContext,
  previewContext,
  deployContext,
  listDeployedContext,
  removeContext,
  getSkill,
  listSkills,
  hasTemplates,
} from "../context-builder";

describe("context-builder", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sceneforge-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("hasTemplates", () => {
    it("returns true when templates exist", async () => {
      const result = await hasTemplates();
      expect(result).toBe(true);
    });
  });

  describe("buildContext", () => {
    it("builds context for claude with all stages", async () => {
      const content = await buildContext("claude", "all");
      expect(content).toContain("SceneForge");
      expect(content).toContain("Claude Code");
    });

    it("builds context for specific stage", async () => {
      const content = await buildContext("cursor", "actions");
      expect(content).toContain("Cursor");
    });

    it("includes base templates in output", async () => {
      const content = await buildContext("claude", "all");
      expect(content).toContain("YAML");
      expect(content).toContain("DemoAction");
    });

    it("applies variable interpolation", async () => {
      const content = await buildContext("claude", "all", {
        customVar: "CustomValue",
      });
      // Variables not in templates won't appear, but function should not throw
      expect(content.length).toBeGreaterThan(0);
    });
  });

  describe("previewContext", () => {
    it("returns preview result with content", async () => {
      const result = await previewContext("claude", "all");
      expect(result.tool).toBe("claude");
      expect(result.stage).toBeUndefined();
      expect(result.content.length).toBeGreaterThan(0);
    });

    it("includes stage in result when specified", async () => {
      const result = await previewContext("cursor", "actions");
      expect(result.tool).toBe("cursor");
      expect(result.stage).toBe("actions");
    });
  });

  describe("deployContext", () => {
    it("deploys combined file for single tool", async () => {
      const results = await deployContext({
        target: "claude",
        stage: "all",
        format: "combined",
        outputDir: tempDir,
      });

      expect(results.length).toBe(1);
      expect(results[0].created).toBe(true);
      expect(results[0].tool).toBe("claude");

      const filePath = path.join(tempDir, "CLAUDE.md");
      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain("SceneForge");
    });

    it("deploys files for all tools", async () => {
      const results = await deployContext({
        target: "all",
        stage: "all",
        format: "combined",
        outputDir: tempDir,
      });

      expect(results.length).toBe(4);
      expect(results.every((r) => r.created)).toBe(true);

      // Check each file exists
      const claudeFile = await fs.readFile(path.join(tempDir, "CLAUDE.md"), "utf-8");
      expect(claudeFile).toContain("Claude Code");

      const cursorFile = await fs.readFile(path.join(tempDir, ".cursorrules"), "utf-8");
      expect(cursorFile).toContain("Cursor");
    });

    it("creates directory structure for split format", async () => {
      const results = await deployContext({
        target: "claude",
        stage: "actions",
        format: "split",
        outputDir: tempDir,
      });

      expect(results.length).toBe(1);
      expect(results[0].created).toBe(true);

      const splitDir = path.join(tempDir, ".claude/rules");
      const files = await fs.readdir(splitDir);
      expect(files.length).toBeGreaterThan(0);
    });

    it("deploys multiple stages in split format", async () => {
      const results = await deployContext({
        target: "cursor",
        stage: "all",
        format: "split",
        outputDir: tempDir,
      });

      expect(results.length).toBe(4);
      expect(results.every((r) => r.created)).toBe(true);
    });
  });

  describe("listDeployedContext", () => {
    it("returns empty list for empty directory", async () => {
      const result = await listDeployedContext(tempDir);
      expect(result.files.every((f) => !f.exists)).toBe(true);
    });

    it("detects deployed files", async () => {
      // First deploy
      await deployContext({
        target: "claude",
        stage: "all",
        format: "combined",
        outputDir: tempDir,
      });

      const result = await listDeployedContext(tempDir);
      const existing = result.files.filter((f) => f.exists);
      expect(existing.length).toBeGreaterThan(0);
      expect(existing.some((f) => f.tool === "claude")).toBe(true);
    });
  });

  describe("removeContext", () => {
    it("removes deployed files for specific tool", async () => {
      // Deploy first
      await deployContext({
        target: "claude",
        stage: "all",
        format: "combined",
        outputDir: tempDir,
      });

      // Verify file exists
      const filePath = path.join(tempDir, "CLAUDE.md");
      await expect(fs.access(filePath)).resolves.toBeUndefined();

      // Remove
      const results = await removeContext(tempDir, "claude");
      expect(results.some((r) => r.removed)).toBe(true);

      // Verify file removed
      await expect(fs.access(filePath)).rejects.toThrow();
    });

    it("removes all deployed files when target is all", async () => {
      // Deploy all
      await deployContext({
        target: "all",
        stage: "all",
        format: "combined",
        outputDir: tempDir,
      });

      // Remove all
      await removeContext(tempDir, "all");

      // Verify all removed
      const result = await listDeployedContext(tempDir);
      const existing = result.files.filter((f) => f.exists);
      expect(existing.length).toBe(0);
    });

    it("handles non-existent files gracefully", async () => {
      const results = await removeContext(tempDir, "claude");
      // Should not error, just not mark as removed
      expect(results.every((r) => !r.error || r.error === undefined)).toBe(true);
    });
  });

  describe("getSkill", () => {
    it("returns skill content for valid skill", async () => {
      const skill = await getSkill("generate-actions");
      expect(skill).not.toBeNull();
      expect(skill?.name).toBe("generate-actions");
      expect(skill?.content).toContain("Generate");
    });

    it("returns null for invalid skill", async () => {
      const skill = await getSkill("non-existent-skill");
      expect(skill).toBeNull();
    });
  });

  describe("listSkills", () => {
    it("returns all available skills", async () => {
      const skills = await listSkills();
      expect(skills).toContain("generate-actions");
      expect(skills).toContain("write-step-script");
      expect(skills).toContain("balance-timing");
      expect(skills).toContain("review-demo-yaml");
      expect(skills).toContain("debug-selector");
      expect(skills).toContain("optimize-demo");
      expect(skills.length).toBe(6);
    });
  });
});

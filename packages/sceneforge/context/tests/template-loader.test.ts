import { describe, it, expect, beforeAll } from "vitest";
import {
  loadTemplate,
  loadTemplatesByCategory,
  interpolateVariables,
  composeTemplates,
  listTemplates,
  templateExists,
  type LoadedTemplate,
} from "../template-loader";

describe("template-loader", () => {
  describe("interpolateVariables", () => {
    it("replaces variables with values", () => {
      const content = "Hello {{name}}, welcome to {{project}}!";
      const result = interpolateVariables(content, {
        name: "World",
        project: "SceneForge",
      });
      expect(result).toBe("Hello World, welcome to SceneForge!");
    });

    it("leaves unmatched variables as-is", () => {
      const content = "Hello {{name}}, your {{unknown}} is ready";
      const result = interpolateVariables(content, { name: "User" });
      expect(result).toBe("Hello User, your {{unknown}} is ready");
    });

    it("handles empty variables object", () => {
      const content = "No {{variables}} here";
      const result = interpolateVariables(content, {});
      expect(result).toBe("No {{variables}} here");
    });

    it("converts numbers to strings", () => {
      const content = "Version {{version}}";
      const result = interpolateVariables(content, { version: 1 });
      expect(result).toBe("Version 1");
    });

    it("handles boolean values", () => {
      const content = "Feature enabled: {{enabled}}";
      const result = interpolateVariables(content, { enabled: true });
      expect(result).toBe("Feature enabled: true");
    });

    it("skips undefined values", () => {
      const content = "Value: {{value}}";
      const result = interpolateVariables(content, { value: undefined });
      expect(result).toBe("Value: {{value}}");
    });
  });

  describe("composeTemplates", () => {
    const templates: LoadedTemplate[] = [
      { name: "first", content: "First template", category: "base" },
      { name: "second", content: "Second template", category: "base" },
    ];

    it("joins templates with default separator", () => {
      const result = composeTemplates(templates);
      expect(result).toContain("First template");
      expect(result).toContain("Second template");
      expect(result).toContain("---");
    });

    it("uses custom separator", () => {
      const result = composeTemplates(templates, { separator: "\n\n" });
      expect(result).toBe("First template\n\nSecond template");
    });

    it("includes headers when requested", () => {
      const result = composeTemplates(templates, { includeHeaders: true });
      expect(result).toContain("<!-- Template: base/first -->");
      expect(result).toContain("<!-- Template: base/second -->");
    });
  });

  describe("listTemplates", () => {
    it("returns object with all categories", async () => {
      const templates = await listTemplates();
      expect(templates).toHaveProperty("base");
      expect(templates).toHaveProperty("stages");
      expect(templates).toHaveProperty("skills");
      expect(Array.isArray(templates.base)).toBe(true);
      expect(Array.isArray(templates.stages)).toBe(true);
      expect(Array.isArray(templates.skills)).toBe(true);
    });

    it("lists base templates", async () => {
      const templates = await listTemplates();
      expect(templates.base).toContain("project-overview");
      expect(templates.base).toContain("yaml-schema");
      expect(templates.base).toContain("actions-reference");
      expect(templates.base).toContain("selectors-guide");
      expect(templates.base).toContain("cli-reference");
    });

    it("lists stage templates", async () => {
      const templates = await listTemplates();
      expect(templates.stages).toContain("stage1-actions");
      expect(templates.stages).toContain("stage2-scripts");
      expect(templates.stages).toContain("stage3-balancing");
      expect(templates.stages).toContain("stage4-rebalancing");
    });

    it("lists skill templates", async () => {
      const templates = await listTemplates();
      expect(templates.skills).toContain("generate-actions");
      expect(templates.skills).toContain("write-step-script");
      expect(templates.skills).toContain("balance-timing");
      expect(templates.skills).toContain("review-demo-yaml");
      expect(templates.skills).toContain("debug-selector");
      expect(templates.skills).toContain("optimize-demo");
    });
  });

  describe("templateExists", () => {
    it("returns true for existing template", async () => {
      const exists = await templateExists("base", "project-overview");
      expect(exists).toBe(true);
    });

    it("returns false for non-existent template", async () => {
      const exists = await templateExists("base", "non-existent-template");
      expect(exists).toBe(false);
    });

    it("returns true for skill template", async () => {
      const exists = await templateExists("skills", "generate-actions");
      expect(exists).toBe(true);
    });
  });

  describe("loadTemplate", () => {
    it("loads a base template", async () => {
      const template = await loadTemplate("base", "project-overview");
      expect(template.name).toBe("project-overview");
      expect(template.category).toBe("base");
      expect(template.content).toContain("SceneForge");
    });

    it("loads a stage template", async () => {
      const template = await loadTemplate("stages", "stage1-actions");
      expect(template.name).toBe("stage1-actions");
      expect(template.category).toBe("stages");
      expect(template.content).toContain("Action");
    });

    it("loads a skill template", async () => {
      const template = await loadTemplate("skills", "generate-actions");
      expect(template.name).toBe("generate-actions");
      expect(template.category).toBe("skills");
      expect(template.content.length).toBeGreaterThan(100);
    });

    it("throws for non-existent template", async () => {
      await expect(loadTemplate("base", "non-existent")).rejects.toThrow();
    });
  });

  describe("loadTemplatesByCategory", () => {
    it("loads all base templates", async () => {
      const templates = await loadTemplatesByCategory("base");
      expect(templates.length).toBeGreaterThanOrEqual(5);
      expect(templates.every((t) => t.category === "base")).toBe(true);
    });

    it("loads all stage templates", async () => {
      const templates = await loadTemplatesByCategory("stages");
      expect(templates.length).toBe(4);
      expect(templates.every((t) => t.category === "stages")).toBe(true);
    });

    it("loads all skill templates", async () => {
      const templates = await loadTemplatesByCategory("skills");
      expect(templates.length).toBe(6);
      expect(templates.every((t) => t.category === "skills")).toBe(true);
    });
  });
});

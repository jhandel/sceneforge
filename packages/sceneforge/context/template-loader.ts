/**
 * Template loading and composition for LLM context files.
 * Loads markdown templates and supports variable interpolation.
 */

import { existsSync } from "fs";
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface TemplateVariables {
  [key: string]: string | number | boolean | undefined;
}

export interface LoadedTemplate {
  name: string;
  content: string;
  category: "base" | "stages" | "skills";
}

/**
 * Get the templates directory path.
 */
function getTemplatesDir(): string {
  const candidates = [
    // Standard dist layout: dist/templates/{base,stages,skills}
    path.join(__dirname, "templates"),
    // Nested layout if templates were copied into an existing dist/templates
    path.join(__dirname, "templates", "templates"),
    // Source layout when templates are shipped under context/templates
    path.join(__dirname, "..", "context", "templates"),
  ];

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "base"))) {
      return candidate;
    }
  }

  return candidates[0];
}

/**
 * Load a single template file by category and name.
 */
export async function loadTemplate(
  category: "base" | "stages" | "skills",
  name: string
): Promise<LoadedTemplate> {
  const templatesDir = getTemplatesDir();
  const filePath = path.join(templatesDir, category, `${name}.md`);

  try {
    const content = await fs.readFile(filePath, "utf-8");
    return { name, content, category };
  } catch (error) {
    throw new Error(`Failed to load template ${category}/${name}: ${error}`);
  }
}

/**
 * Load all templates from a specific category.
 */
export async function loadTemplatesByCategory(
  category: "base" | "stages" | "skills"
): Promise<LoadedTemplate[]> {
  const templatesDir = getTemplatesDir();
  const categoryDir = path.join(templatesDir, category);

  try {
    const files = await fs.readdir(categoryDir);
    const templates: LoadedTemplate[] = [];

    for (const file of files) {
      if (file.endsWith(".md")) {
        const name = file.replace(/\.md$/, "");
        const template = await loadTemplate(category, name);
        templates.push(template);
      }
    }

    return templates;
  } catch (error) {
    throw new Error(
      `Failed to load templates from ${category} in ${templatesDir}: ${error}`
    );
  }
}

/**
 * Interpolate variables in template content.
 * Variables use the format: {{variableName}}
 */
export function interpolateVariables(
  content: string,
  variables: TemplateVariables
): string {
  return content.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = variables[key];
    if (value === undefined) {
      return match; // Leave unmatched variables as-is
    }
    return String(value);
  });
}

/**
 * Compose multiple templates into a single document.
 */
export function composeTemplates(
  templates: LoadedTemplate[],
  options?: {
    separator?: string;
    includeHeaders?: boolean;
  }
): string {
  const { separator = "\n\n---\n\n", includeHeaders = false } = options ?? {};

  return templates
    .map((template) => {
      if (includeHeaders) {
        return `<!-- Template: ${template.category}/${template.name} -->\n\n${template.content}`;
      }
      return template.content;
    })
    .join(separator);
}

/**
 * List available templates by category.
 */
export async function listTemplates(): Promise<{
  base: string[];
  stages: string[];
  skills: string[];
}> {
  const templatesDir = getTemplatesDir();
  const result: { base: string[]; stages: string[]; skills: string[] } = {
    base: [],
    stages: [],
    skills: [],
  };

  for (const category of ["base", "stages", "skills"] as const) {
    const categoryDir = path.join(templatesDir, category);
    try {
      const files = await fs.readdir(categoryDir);
      result[category] = files
        .filter((f) => f.endsWith(".md"))
        .map((f) => f.replace(/\.md$/, ""));
    } catch {
      // Directory may not exist yet
      result[category] = [];
    }
  }

  return result;
}

/**
 * Check if a template exists.
 */
export async function templateExists(
  category: "base" | "stages" | "skills",
  name: string
): Promise<boolean> {
  const templatesDir = getTemplatesDir();
  const filePath = path.join(templatesDir, category, `${name}.md`);

  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

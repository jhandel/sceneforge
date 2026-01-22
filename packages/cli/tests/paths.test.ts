import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import {
  resolveRoot,
  resolveOutputDir,
  resolveEnvFile,
  getOutputPaths,
  toAbsolute,
} from "../src/utils/paths.js";

describe("path utilities", () => {
  describe("resolveRoot", () => {
    it("returns resolved path when explicit root provided", () => {
      const result = resolveRoot("/some/path");

      expect(result).toBe("/some/path");
    });

    it("resolves relative paths to absolute", () => {
      const result = resolveRoot("./relative");

      expect(path.isAbsolute(result)).toBe(true);
      expect(result).toContain("relative");
    });

    it("returns cwd when no explicit root", () => {
      const result = resolveRoot(undefined);

      expect(result).toBe(process.cwd());
    });

    it("returns cwd for null input", () => {
      const result = resolveRoot(null as unknown as string);

      expect(result).toBe(process.cwd());
    });
  });

  describe("toAbsolute", () => {
    it("returns absolute path unchanged", () => {
      const result = toAbsolute("/root", "/absolute/path");

      expect(result).toBe("/absolute/path");
    });

    it("joins relative path with root", () => {
      const result = toAbsolute("/root", "relative/path");

      expect(result).toBe("/root/relative/path");
    });

    it("handles current directory reference", () => {
      const result = toAbsolute("/root", "./file.txt");

      expect(result).toBe("/root/file.txt");
    });

    it("handles parent directory reference", () => {
      const result = toAbsolute("/root/sub", "../file.txt");

      // path.join resolves .. references
      expect(result).toBe("/root/file.txt");
    });
  });
});

describe("path utilities with filesystem", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `paths-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("resolveOutputDir", () => {
    it("returns explicit output dir when provided", async () => {
      const result = await resolveOutputDir(tempDir, "custom-output");

      expect(result).toBe(path.join(tempDir, "custom-output"));
    });

    it("returns existing output dir over e2e/output", async () => {
      await fs.mkdir(path.join(tempDir, "output"), { recursive: true });
      await fs.mkdir(path.join(tempDir, "e2e", "output"), { recursive: true });

      const result = await resolveOutputDir(tempDir, undefined);

      expect(result).toBe(path.join(tempDir, "output"));
    });

    it("returns e2e/output when output does not exist but e2e/output does", async () => {
      await fs.mkdir(path.join(tempDir, "e2e", "output"), { recursive: true });

      const result = await resolveOutputDir(tempDir, undefined);

      expect(result).toBe(path.join(tempDir, "e2e", "output"));
    });

    it("returns default output when neither exists", async () => {
      const result = await resolveOutputDir(tempDir, undefined);

      expect(result).toBe(path.join(tempDir, "output"));
    });
  });

  describe("resolveEnvFile", () => {
    it("returns explicit env file when provided", async () => {
      const result = await resolveEnvFile(tempDir, "custom.env");

      expect(result).toBe(path.join(tempDir, "custom.env"));
    });

    it("returns root .env when it exists", async () => {
      await fs.writeFile(path.join(tempDir, ".env"), "TEST=value");

      const result = await resolveEnvFile(tempDir, undefined);

      expect(result).toBe(path.join(tempDir, ".env"));
    });

    it("returns .local/.env when root .env does not exist", async () => {
      await fs.mkdir(path.join(tempDir, ".local"), { recursive: true });
      await fs.writeFile(path.join(tempDir, ".local", ".env"), "TEST=value");

      const result = await resolveEnvFile(tempDir, undefined);

      expect(result).toBe(path.join(tempDir, ".local", ".env"));
    });

    it("returns sceneforge/.env when neither root nor .local exists", async () => {
      await fs.mkdir(path.join(tempDir, "sceneforge"), { recursive: true });
      await fs.writeFile(path.join(tempDir, "sceneforge", ".env"), "TEST=value");

      const result = await resolveEnvFile(tempDir, undefined);

      expect(result).toBe(path.join(tempDir, "sceneforge", ".env"));
    });

    it("returns e2e/.env as fallback", async () => {
      await fs.mkdir(path.join(tempDir, "e2e"), { recursive: true });
      await fs.writeFile(path.join(tempDir, "e2e", ".env"), "TEST=value");

      const result = await resolveEnvFile(tempDir, undefined);

      expect(result).toBe(path.join(tempDir, "e2e", ".env"));
    });

    it("returns null when no env file exists", async () => {
      const result = await resolveEnvFile(tempDir, undefined);

      expect(result).toBeNull();
    });

    it("prioritizes .env files in correct order", async () => {
      // Create all possible env files
      await fs.mkdir(path.join(tempDir, ".local"), { recursive: true });
      await fs.mkdir(path.join(tempDir, "sceneforge"), { recursive: true });
      await fs.mkdir(path.join(tempDir, "e2e"), { recursive: true });

      await fs.writeFile(path.join(tempDir, ".local", ".env"), "LOCAL");
      await fs.writeFile(path.join(tempDir, "sceneforge", ".env"), "SCENEFORGE");
      await fs.writeFile(path.join(tempDir, "e2e", ".env"), "E2E");

      // .local should win over sceneforge and e2e
      let result = await resolveEnvFile(tempDir, undefined);
      expect(result).toBe(path.join(tempDir, ".local", ".env"));

      // Add root .env, it should win
      await fs.writeFile(path.join(tempDir, ".env"), "ROOT");
      result = await resolveEnvFile(tempDir, undefined);
      expect(result).toBe(path.join(tempDir, ".env"));
    });
  });

  describe("getOutputPaths", () => {
    it("returns all output paths relative to output dir", async () => {
      const result = await getOutputPaths(tempDir, "output");

      expect(result.outputDir).toBe(path.join(tempDir, "output"));
      expect(result.scriptsDir).toBe(path.join(tempDir, "output", "scripts"));
      expect(result.videosDir).toBe(path.join(tempDir, "output", "videos"));
      expect(result.audioDir).toBe(path.join(tempDir, "output", "audio"));
      expect(result.finalDir).toBe(path.join(tempDir, "output", "final"));
      expect(result.tempDir).toBe(path.join(tempDir, "output", "temp"));
      expect(result.testResultsDir).toBe(path.join(tempDir, "output", "test-results"));
    });

    it("uses resolved output dir when not explicitly provided", async () => {
      await fs.mkdir(path.join(tempDir, "output"), { recursive: true });

      const result = await getOutputPaths(tempDir, undefined);

      expect(result.outputDir).toBe(path.join(tempDir, "output"));
    });
  });
});

import { describe, it, expect } from "vitest";
import { hasFlag, getFlagValue, getFlagValueOrDefault } from "../src/utils/args.js";

describe("CLI argument utilities", () => {
  describe("hasFlag", () => {
    it("returns true when flag is present", () => {
      const args = ["--verbose", "--output", "dir"];

      expect(hasFlag(args, "--verbose")).toBe(true);
    });

    it("returns false when flag is not present", () => {
      const args = ["--output", "dir"];

      expect(hasFlag(args, "--verbose")).toBe(false);
    });

    it("returns true for flag at any position", () => {
      const args = ["--output", "dir", "--verbose"];

      expect(hasFlag(args, "--verbose")).toBe(true);
    });

    it("returns false for empty args", () => {
      expect(hasFlag([], "--verbose")).toBe(false);
    });

    it("distinguishes between similar flags", () => {
      const args = ["--no-cache"];

      expect(hasFlag(args, "--no-cache")).toBe(true);
      expect(hasFlag(args, "--cache")).toBe(false);
    });
  });

  describe("getFlagValue", () => {
    it("returns value after flag", () => {
      const args = ["--output", "my-dir"];

      expect(getFlagValue(args, "--output")).toBe("my-dir");
    });

    it("returns null when flag is not present", () => {
      const args = ["--verbose"];

      expect(getFlagValue(args, "--output")).toBeNull();
    });

    it("returns null when flag has no following value", () => {
      const args = ["--output"];

      expect(getFlagValue(args, "--output")).toBeNull();
    });

    it("returns correct value when multiple flags exist", () => {
      const args = ["--demo", "my-demo", "--output", "my-dir", "--verbose"];

      expect(getFlagValue(args, "--demo")).toBe("my-demo");
      expect(getFlagValue(args, "--output")).toBe("my-dir");
    });

    it("returns first occurrence when flag appears multiple times", () => {
      const args = ["--output", "first", "--output", "second"];

      expect(getFlagValue(args, "--output")).toBe("first");
    });

    it("handles values that look like flags", () => {
      const args = ["--message", "--not-a-flag"];

      expect(getFlagValue(args, "--message")).toBe("--not-a-flag");
    });

    it("handles empty string values", () => {
      const args = ["--output", ""];

      expect(getFlagValue(args, "--output")).toBe("");
    });
  });

  describe("getFlagValueOrDefault", () => {
    it("returns flag value when present", () => {
      const args = ["--output", "my-dir"];

      expect(getFlagValueOrDefault(args, "--output", "default-dir")).toBe("my-dir");
    });

    it("returns default when flag is not present", () => {
      const args = ["--verbose"];

      expect(getFlagValueOrDefault(args, "--output", "default-dir")).toBe("default-dir");
    });

    it("returns default when flag has no value", () => {
      const args = ["--output"];

      expect(getFlagValueOrDefault(args, "--output", "default-dir")).toBe("default-dir");
    });

    it("returns empty string value over default", () => {
      const args = ["--output", ""];

      expect(getFlagValueOrDefault(args, "--output", "default-dir")).toBe("");
    });

    it("handles various default types", () => {
      const args: string[] = [];

      expect(getFlagValueOrDefault(args, "--count", "10")).toBe("10");
      expect(getFlagValueOrDefault(args, "--path", "/default/path")).toBe("/default/path");
    });
  });
});

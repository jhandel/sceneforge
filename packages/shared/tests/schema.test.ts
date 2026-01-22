import { describe, it, expect } from "vitest";
import {
  demoDefinitionSchema,
  parseDemoDefinition,
  safeParseDemoDefinition,
  formatValidationError,
  DEMO_SCHEMA_VERSION,
} from "../src/schema";

describe("schema validation", () => {
  describe("DEMO_SCHEMA_VERSION", () => {
    it("exports the current schema version", () => {
      expect(DEMO_SCHEMA_VERSION).toBe(1);
    });
  });

  describe("demoDefinitionSchema", () => {
    const minimalDemo = {
      name: "test-demo",
      title: "Test Demo",
      steps: [
        {
          id: "step-1",
          script: "First step",
          actions: [{ action: "click", target: { type: "selector", selector: "#btn" } }],
        },
      ],
    };

    it("validates minimal demo definition", () => {
      const result = demoDefinitionSchema.safeParse(minimalDemo);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.version).toBe(1); // default
        expect(result.data.name).toBe("test-demo");
      }
    });

    it("validates demo with explicit version", () => {
      const demo = { ...minimalDemo, version: 1 };
      const result = demoDefinitionSchema.safeParse(demo);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.version).toBe(1);
      }
    });

    it("validates demo with description", () => {
      const demo = {
        ...minimalDemo,
        description: "A test demo for validation",
      };
      const result = demoDefinitionSchema.safeParse(demo);

      expect(result.success).toBe(true);
    });

    it("validates demo with multiple steps", () => {
      const demo = {
        ...minimalDemo,
        steps: [
          {
            id: "step-1",
            script: "First step",
            actions: [{ action: "click", target: { type: "selector", selector: "#btn1" } }],
          },
          {
            id: "step-2",
            script: "Second step",
            actions: [{ action: "click", target: { type: "selector", selector: "#btn2" } }],
          },
        ],
      };
      const result = demoDefinitionSchema.safeParse(demo);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.steps).toHaveLength(2);
      }
    });

    it("rejects demo without name", () => {
      const demo = {
        title: "Test Demo",
        steps: minimalDemo.steps,
      };
      const result = demoDefinitionSchema.safeParse(demo);

      expect(result.success).toBe(false);
    });

    it("rejects demo without title", () => {
      const demo = {
        name: "test-demo",
        steps: minimalDemo.steps,
      };
      const result = demoDefinitionSchema.safeParse(demo);

      expect(result.success).toBe(false);
    });

    it("allows demo with empty steps", () => {
      // Note: The schema allows empty steps arrays
      const demo = {
        name: "test-demo",
        title: "Test Demo",
        steps: [],
      };
      const result = demoDefinitionSchema.safeParse(demo);

      expect(result.success).toBe(true);
    });

    it("validates click action with target", () => {
      const demo = {
        ...minimalDemo,
        steps: [
          {
            id: "step-1",
            script: "Click test",
            actions: [
              {
                action: "click",
                target: { type: "selector", selector: "#button" },
                highlight: true,
              },
            ],
          },
        ],
      };
      const result = demoDefinitionSchema.safeParse(demo);

      expect(result.success).toBe(true);
    });

    it("validates type action", () => {
      const demo = {
        ...minimalDemo,
        steps: [
          {
            id: "step-1",
            script: "Type test",
            actions: [
              {
                action: "type",
                target: { type: "selector", selector: "#input" },
                text: "Hello world",
              },
            ],
          },
        ],
      };
      const result = demoDefinitionSchema.safeParse(demo);

      expect(result.success).toBe(true);
    });

    it("validates navigate action", () => {
      const demo = {
        ...minimalDemo,
        steps: [
          {
            id: "step-1",
            script: "Navigate test",
            actions: [{ action: "navigate", path: "/dashboard" }],
          },
        ],
      };
      const result = demoDefinitionSchema.safeParse(demo);

      expect(result.success).toBe(true);
    });

    it("validates wait action with duration", () => {
      const demo = {
        ...minimalDemo,
        steps: [
          {
            id: "step-1",
            script: "Wait test",
            actions: [{ action: "wait", duration: 1000 }],
          },
        ],
      };
      const result = demoDefinitionSchema.safeParse(demo);

      expect(result.success).toBe(true);
    });

    it("validates wait action with waitFor text condition", () => {
      const demo = {
        ...minimalDemo,
        steps: [
          {
            id: "step-1",
            script: "Wait for text",
            actions: [
              {
                action: "wait",
                waitFor: { type: "text", value: "Done" },
              },
            ],
          },
        ],
      };
      const result = demoDefinitionSchema.safeParse(demo);

      expect(result.success).toBe(true);
    });

    it("validates wait action with waitFor selector condition", () => {
      const demo = {
        ...minimalDemo,
        steps: [
          {
            id: "step-1",
            script: "Wait for selector",
            actions: [
              {
                action: "wait",
                // Note: waitFor uses 'value' property for both text and selector types
                waitFor: { type: "selector", value: ".loaded", timeout: 5000 },
              },
            ],
          },
        ],
      };
      const result = demoDefinitionSchema.safeParse(demo);

      expect(result.success).toBe(true);
    });

    it("validates hover action", () => {
      const demo = {
        ...minimalDemo,
        steps: [
          {
            id: "step-1",
            script: "Hover test",
            actions: [
              {
                action: "hover",
                target: { type: "selector", selector: ".menu" },
              },
            ],
          },
        ],
      };
      const result = demoDefinitionSchema.safeParse(demo);

      expect(result.success).toBe(true);
    });

    it("validates scroll action", () => {
      const demo = {
        ...minimalDemo,
        steps: [
          {
            id: "step-1",
            script: "Scroll test",
            actions: [{ action: "scroll", duration: 500 }],
          },
        ],
      };
      const result = demoDefinitionSchema.safeParse(demo);

      expect(result.success).toBe(true);
    });

    it("validates scrollTo action", () => {
      const demo = {
        ...minimalDemo,
        steps: [
          {
            id: "step-1",
            script: "ScrollTo test",
            actions: [
              {
                action: "scrollTo",
                target: { type: "selector", selector: "#footer" },
              },
            ],
          },
        ],
      };
      const result = demoDefinitionSchema.safeParse(demo);

      expect(result.success).toBe(true);
    });

    it("validates upload action", () => {
      const demo = {
        ...minimalDemo,
        steps: [
          {
            id: "step-1",
            script: "Upload test",
            actions: [{ action: "upload", file: "test.pdf" }],
          },
        ],
      };
      const result = demoDefinitionSchema.safeParse(demo);

      expect(result.success).toBe(true);
    });

    it("validates drag action", () => {
      const demo = {
        ...minimalDemo,
        steps: [
          {
            id: "step-1",
            script: "Drag test",
            actions: [
              {
                action: "drag",
                target: { type: "selector", selector: ".draggable" },
                drag: { deltaX: 100, deltaY: 50, steps: 10 },
              },
            ],
          },
        ],
      };
      const result = demoDefinitionSchema.safeParse(demo);

      expect(result.success).toBe(true);
    });

    it("rejects invalid action type", () => {
      const demo = {
        ...minimalDemo,
        steps: [
          {
            id: "step-1",
            script: "Invalid action",
            actions: [{ action: "explode" }],
          },
        ],
      };
      const result = demoDefinitionSchema.safeParse(demo);

      expect(result.success).toBe(false);
    });

    it("validates media configuration with intro", () => {
      const demo = {
        ...minimalDemo,
        media: {
          intro: {
            file: "intro.mp4",
            fade: true,
            fadeDuration: 0.5,
          },
        },
      };
      const result = demoDefinitionSchema.safeParse(demo);

      expect(result.success).toBe(true);
    });

    it("validates media configuration with outro", () => {
      const demo = {
        ...minimalDemo,
        media: {
          outro: {
            file: "outro.mp4",
          },
        },
      };
      const result = demoDefinitionSchema.safeParse(demo);

      expect(result.success).toBe(true);
    });

    it("validates media configuration with background music", () => {
      const demo = {
        ...minimalDemo,
        media: {
          backgroundMusic: {
            file: "music.mp3",
            volume: 0.15,
            loop: true,
            fadeIn: 1.5,
            fadeOut: 2.0,
          },
        },
      };
      const result = demoDefinitionSchema.safeParse(demo);

      expect(result.success).toBe(true);
    });

    it("validates text target type", () => {
      const demo = {
        ...minimalDemo,
        steps: [
          {
            id: "step-1",
            script: "Text target test",
            actions: [
              {
                action: "click",
                target: { type: "text", text: "Click me" },
              },
            ],
          },
        ],
      };
      const result = demoDefinitionSchema.safeParse(demo);

      expect(result.success).toBe(true);
    });

    it("rejects selector target without selector", () => {
      const demo = {
        ...minimalDemo,
        steps: [
          {
            id: "step-1",
            script: "Invalid target",
            actions: [
              {
                action: "click",
                target: { type: "selector" },
              },
            ],
          },
        ],
      };
      const result = demoDefinitionSchema.safeParse(demo);

      expect(result.success).toBe(false);
    });
  });

  describe("parseDemoDefinition", () => {
    it("parses valid demo definition", () => {
      const input = {
        name: "test",
        title: "Test",
        steps: [
          {
            id: "s1",
            script: "Step",
            actions: [{ action: "click", target: { type: "selector", selector: "#x" } }],
          },
        ],
      };

      const result = parseDemoDefinition(input);

      expect(result.name).toBe("test");
      expect(result.version).toBe(1);
    });

    it("throws on invalid input", () => {
      const input = { name: "test" }; // missing required fields

      expect(() => parseDemoDefinition(input)).toThrow();
    });
  });

  describe("safeParseDemoDefinition", () => {
    it("returns success for valid input", () => {
      const input = {
        name: "test",
        title: "Test",
        steps: [
          {
            id: "s1",
            script: "Step",
            actions: [{ action: "click", target: { type: "selector", selector: "#x" } }],
          },
        ],
      };

      const result = safeParseDemoDefinition(input);

      expect(result.success).toBe(true);
    });

    it("returns failure for invalid input", () => {
      const input = { name: "test" };

      const result = safeParseDemoDefinition(input);

      expect(result.success).toBe(false);
    });
  });

  describe("formatValidationError", () => {
    it("formats validation errors", () => {
      const input = { name: "test" };
      const result = safeParseDemoDefinition(input);

      if (!result.success) {
        const formatted = formatValidationError(result.error);
        expect(typeof formatted).toBe("string");
        expect(formatted.length).toBeGreaterThan(0);
      }
    });

    it("handles non-Zod errors", () => {
      const error = new Error("Generic error");
      const formatted = formatValidationError(error);

      // Non-Zod errors return a generic message
      expect(formatted).toBe("Invalid demo definition");
    });
  });
});

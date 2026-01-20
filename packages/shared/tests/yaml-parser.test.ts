import { describe, it, expect } from "vitest";
import { parseFromYAML, validateDemoDefinition } from "../src/yaml-parser";

describe("demo YAML parsing", () => {
  it("parses YAML and applies defaults", () => {
    const yaml = `
name: demo
title: Demo Title
steps:
  - id: step-1
    script: Hello
    actions:
      - action: click
        target:
          type: selector
          selector: "#button"
`;
    const demo = parseFromYAML(yaml);
    expect(demo.version).toBe(1);
    expect(demo.name).toBe("demo");
    expect(demo.steps).toHaveLength(1);
    expect(demo.steps[0].actions[0].action).toBe("click");
  });

  it("rejects unsupported actions", () => {
    const yaml = `
name: demo
title: Demo
steps:
  - id: step-1
    script: Hello
    actions:
      - action: explode
`;
    expect(() => parseFromYAML(yaml)).toThrow(/action/i);
  });

  it("validates demo definitions", () => {
    const demo = parseFromYAML(`
name: demo
title: Demo
steps:
  - id: step-1
    script: Hello
    actions:
      - action: wait
        duration: 500
`);
    expect(() => validateDemoDefinition(demo)).not.toThrow();
  });

  it("replaces secret placeholders when resolver is provided", () => {
    const yaml = `
name: demo
title: Demo
steps:
  - id: step-1
    script: Hello
    actions:
      - action: type
        target:
          type: selector
          selector: "#email"
        text: "\${SECRET:USER_EMAIL}"
`;
    const demo = parseFromYAML(yaml, {
      resolveSecrets: (key) => (key === "USER_EMAIL" ? "user@example.com" : undefined),
    });
    expect(demo.steps[0].actions[0].text).toBe("user@example.com");
  });

  it("throws when a secret placeholder cannot be resolved", () => {
    const yaml = `
name: demo
title: Demo
steps:
  - id: step-1
    script: Hello
    actions:
      - action: type
        target:
          type: selector
          selector: "#password"
        text: "\${SECRET:USER_PASSWORD}"
`;
    expect(
      () =>
        parseFromYAML(yaml, {
          resolveSecrets: () => undefined,
        })
    ).toThrow(/Missing secret/i);
  });
});

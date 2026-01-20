import { test, expect } from "@playwright/test";
import type { DemoDefinition } from "@jhandel/sceneforge-shared";
import { runDemo } from "../src/demo-runner";

test("runDemo executes recorded actions", async ({ page }, testInfo) => {
  await page.setContent(`
    <button id="start">Start</button>
    <input id="name" />
    <script>
      document.getElementById("start").addEventListener("click", () => {
        document.body.setAttribute("data-started", "true");
      });
    </script>
  `);

  const definition: DemoDefinition = {
    version: 1,
    name: "test-demo",
    title: "Test Demo",
    steps: [
      {
        id: "step-1",
        script: "Click and type",
        actions: [
          {
            action: "click",
            target: { type: "selector", selector: "#start" },
          },
          {
            action: "type",
            target: { type: "selector", selector: "#name" },
            text: "Ada",
          },
        ],
      },
    ],
  };

  const result = await runDemo(
    definition,
    {
      page,
      baseURL: "http://localhost",
      outputDir: testInfo.outputDir,
    },
    { generateScripts: false }
  );

  expect(result.success).toBe(true);
  await expect(page.locator("#name")).toHaveValue("Ada");
  await expect(page.locator("body")).toHaveAttribute("data-started", "true");
});

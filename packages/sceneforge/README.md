# @t3lnet/sceneforge

SceneForge is a small toolkit for running YAML-driven browser demos and generating script/audio metadata. This package is the **runtime library** for programmatic playback and voice/script generation.

If you want the recorder extension or full CLI pipeline, see the source repo: https://github.com/jhandel/sceneforge

## Install

```bash
npm i -D @t3lnet/sceneforge @playwright/test
```

## Programmatic Usage

```ts
import { chromium } from "@playwright/test";
import { runDemoFromFile } from "@t3lnet/sceneforge";

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

await runDemoFromFile("./examples/create-dxf-quote.yaml", {
  page,
  baseURL: "http://localhost:5173",
  outputDir: "./output",
});
```

## CLI

The CLI is included in this package. After install you can run `sceneforge` via `npx` or your package manager:

```bash
npx sceneforge record --definition examples/create-dxf-quote.yaml --base-url http://localhost:5173
npx sceneforge pipeline --definition examples/create-dxf-quote.yaml --base-url http://localhost:5173 --clean
```

## Extension (optional)

The Chrome extension for recording demos is part of the source repo under `packages/extension`. Build it with:

```bash
bun run build:extension
```

Then load the `dist/` folder in `chrome://extensions`.

## Notes

- Voiceover generation uses ElevenLabs and requires `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID`.
- Video pipeline steps require FFmpeg installed locally.

## Repository

https://github.com/jhandel/sceneforge

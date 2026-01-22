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
# Record a demo
npx sceneforge record --definition examples/create-dxf-quote.yaml --base-url http://localhost:5173

# Run full pipeline
npx sceneforge pipeline --definition examples/create-dxf-quote.yaml --base-url http://localhost:5173 --clean

# Generate voiceover (with caching enabled by default)
npx sceneforge voiceover --demo my-demo

# Manage voice cache
npx sceneforge voice-cache stats
```

## Extension (optional)

The Chrome extension for recording demos is part of the source repo under `packages/extension`. Build it with:

```bash
bun run build:extension
```

Then load the `dist/` folder in `chrome://extensions`.

## Voice Cache

SceneForge automatically caches synthesized voice audio to reduce ElevenLabs API costs. When the same text is synthesized with the same voice and settings, the cached audio is reused instead of making a new API call.

```bash
# Cache is enabled by default. To disable:
npx sceneforge voiceover --demo my-demo --no-cache

# Manage the cache:
npx sceneforge voice-cache stats    # View statistics
npx sceneforge voice-cache list     # List cached entries
npx sceneforge voice-cache clear    # Clear the cache
npx sceneforge voice-cache prune --days 7  # Remove old entries
```

Cache is stored in `.voice-cache/` in your project root.

## Notes

- Voiceover generation uses ElevenLabs and requires `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID`.
- Voice cache reduces API costs by reusing previously synthesized audio.
- Video pipeline steps require FFmpeg installed locally.

## LLM Context Tooling

SceneForge includes tooling to deploy instruction files for AI coding assistants, helping them understand your project and assist with demo creation.

### Supported AI Tools

| Tool | File | Description |
|------|------|-------------|
| Cursor | `.cursorrules` | Cursor AI IDE |
| GitHub Copilot | `.github/copilot-instructions.md` | GitHub Copilot |
| Claude Code | `CLAUDE.md` | Claude Code CLI |
| Codex | `AGENTS.md` | OpenAI Codex |

### Deploy Context Files

```bash
# Interactive wizard (recommended)
npx sceneforge context deploy

# Or with options
npx sceneforge context deploy --target claude
npx sceneforge context deploy --target all --format split
```

### Available Skills

Skills are prompt templates for specific tasks:

```bash
# List available skills
npx sceneforge context skill --list

# View a skill
npx sceneforge context skill --show generate-actions

# Copy skill to clipboard
npx sceneforge context skill --copy debug-selector
```

Available skills:
- `generate-actions` - Generate demo actions for a page
- `write-step-script` - Write voiceover scripts
- `balance-timing` - Analyze and balance timing
- `review-demo-yaml` - Review demo definitions
- `debug-selector` - Debug failing selectors
- `optimize-demo` - Optimize demo flow

### Context Commands

```bash
sceneforge context deploy    # Deploy context files
sceneforge context list      # List deployed files
sceneforge context remove    # Remove context files
sceneforge context preview   # Preview content
sceneforge context skill     # Manage skills
```

## Repository

https://github.com/jhandel/sceneforge

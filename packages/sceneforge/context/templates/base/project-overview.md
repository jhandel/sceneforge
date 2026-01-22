# SceneForge Project Overview

SceneForge is a toolkit for creating automated browser demo videos with voiceover narration. It uses YAML definitions to describe demo workflows that are executed via Playwright, then processes the recordings into polished video content with synthesized voice narration.

## Core Concepts

### Demo Definition
A YAML file that describes a complete demo workflow. It contains:
- **Metadata**: name, title, description
- **Steps**: logical groupings of actions with voiceover scripts
- **Media config** (optional): intro/outro videos, background music

### Demo Step
A logical unit within a demo. Each step contains:
- **id**: Unique identifier for the step
- **script**: Voiceover text that will be synthesized to speech
- **actions**: Array of browser interactions to execute

### Demo Action
A single browser interaction within a step:
- **navigate**: Go to a URL
- **click**: Click an element
- **type**: Enter text into an input
- **hover**: Hover over an element
- **scroll/scrollTo**: Scroll the page or to an element
- **wait**: Pause for duration or condition
- **upload**: Upload a file
- **drag**: Drag and drop interaction

## Project Architecture

```
packages/
  sceneforge/       # Main CLI and runtime library
    cli/            # CLI commands
    context/        # LLM context generation (this module)
    src/            # Public API exports
  shared/           # Shared types and schemas
  playwright/       # Playwright demo runner
  generation/       # Voice synthesis and script generation
  extension/        # Chrome extension for recording
```

## Typical Workflow

1. **Define demo** - Create a YAML file with steps and actions
2. **Record** - Run `sceneforge record` to execute actions and capture video
3. **Generate voiceover** - Run `sceneforge voiceover` to synthesize speech
4. **Process video** - Run `sceneforge pipeline` for the full process
5. **Iterate** - Adjust timing, scripts, and actions as needed

## Key Files

- `*.yaml` - Demo definition files
- `output/videos/` - Recorded video clips per step
- `output/audio/` - Synthesized voiceover audio
- `output/scripts/` - Generated script JSON with timing data
- `output/final/` - Final concatenated video output

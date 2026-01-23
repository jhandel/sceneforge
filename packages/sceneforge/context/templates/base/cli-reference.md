# SceneForge CLI Reference

## Overview

```bash
sceneforge <command> [options]
```

## Commands

### record
Execute a demo definition and record video.

```bash
sceneforge record --definition <path> [options]
```

**Options:**
| Flag | Description |
|------|-------------|
| `--definition`, `-d` | Path to demo YAML file |
| `--base-url`, `-b` | Base URL for the application |
| `--output`, `-o` | Output directory (default: ./output) |
| `--headed` | Run browser in headed mode (visible) |
| `--storage` | Path to storage state JSON |
| `--slowmo` | Slow down actions by ms |
| `--env-file` | Path to .env file |
| `--viewport` | Target video resolution (preset or WxH, default: 1440x900) |
| `--width` | Video width (overrides --viewport) |
| `--height` | Video height (overrides --viewport) |

**Viewport Presets:** 720p (1280x720), 1080p (1920x1080), 1440p (2560x1440), 4k (3840x2160)

**Examples:**
```bash
# Basic recording
sceneforge record -d demo.yaml -b http://localhost:3000

# Headed mode for debugging
sceneforge record -d demo.yaml -b http://localhost:3000 --headed

# With auth state
sceneforge record -d demo.yaml -b http://localhost:3000 --storage ./auth.json

# Record at 1080p resolution
sceneforge record -d demo.yaml -b http://localhost:3000 --viewport 1080p

# Record at 4K resolution
sceneforge record -d demo.yaml -b http://localhost:3000 --viewport 4k
```

### setup
Run a setup definition to create authentication state.

```bash
sceneforge setup --definition <path> [options]
```

**Options:**
| Flag | Description |
|------|-------------|
| `--definition`, `-d` | Path to setup YAML file |
| `--base-url`, `-b` | Base URL for the application |
| `--output`, `-o` | Output path for storage state |
| `--headed` | Run browser in headed mode |

**Example:**
```bash
sceneforge setup -d login-setup.yaml -b http://localhost:3000 -o ./auth.json
```

### pipeline
Run the complete demo pipeline (record + voiceover + video processing).

```bash
sceneforge pipeline --definition <path> [options]
```

**Options:**
| Flag | Description |
|------|-------------|
| `--definition`, `-d` | Path to demo YAML file |
| `--base-url`, `-b` | Base URL for the application |
| `--output`, `-o` | Output directory |
| `--clean` | Clean output directory before running |
| `--headed` | Run browser in headed mode |
| `--storage` | Path to storage state JSON |
| `--skip-record` | Skip recording step |
| `--skip-voiceover` | Skip voiceover generation |
| `--skip-concat` | Skip final concatenation |
| `--resume` | Resume from last successful step |
| `--quality` | Quality preset: low, medium, high |
| `--crf` | Override CRF value |
| `--codec` | Video codec: libx264, libx265 |
| `--viewport` | Target video resolution (preset or WxH) |
| `--output-size` | Final output dimensions (preset or WxH) |
| `--output-width` | Output width (-1 for auto) |
| `--output-height` | Output height (-1 for auto) |

**Examples:**
```bash
# Full pipeline with clean output
sceneforge pipeline -d demo.yaml -b http://localhost:3000 --clean

# Resume after fixing issues
sceneforge pipeline -d demo.yaml -b http://localhost:3000 --resume

# Skip recording (use existing videos)
sceneforge pipeline -d demo.yaml --skip-record

# High quality 1080p output
sceneforge pipeline -d demo.yaml -b http://localhost:3000 --quality high --output-size 1080p

# TikTok/YouTube Shorts format
sceneforge pipeline -d demo.yaml -b http://localhost:3000 --output-size tiktok --quality high

# Full options: viewport + output scaling
sceneforge pipeline -d demo.yaml -b http://localhost:3000 \
  --viewport 1080p \
  --output-size 1080p \
  --quality high
```

### split
Split recorded video into per-step clips.

```bash
sceneforge split --demo <name> [options]
```

**Options:**
| Flag | Description |
|------|-------------|
| `--demo` | Demo name (folder in output) |
| `--output`, `-o` | Output directory |
| `--quality` | Quality preset: low, medium, high (default: medium) |
| `--crf` | Override CRF value (0-51, lower = better) |
| `--codec` | Video codec: libx264, libx265 (default: libx264) |
| `--output-size` | Output video dimensions (preset or WxH) |
| `--output-width` | Output width (-1 for auto) |
| `--output-height` | Output height (-1 for auto) |

**Video Quality:** Configurable via `--quality` preset or `--crf`/`--codec` flags. Default: medium preset (CRF 18, libx264).

**Output Presets:** 720p, 1080p, 1440p, 4k (landscape), tiktok/shorts/reels (1080x1920 portrait), square (1080x1080)

### voiceover
Generate voiceover audio from scripts.

```bash
sceneforge voiceover --demo <name> [options]
```

**Options:**
| Flag | Description |
|------|-------------|
| `--demo` | Demo name |
| `--output`, `-o` | Output directory |
| `--voice-id` | ElevenLabs voice ID |
| `--no-cache` | Disable voice cache |

**Environment Variables:**
- `ELEVENLABS_API_KEY` - Your ElevenLabs API key
- `ELEVENLABS_VOICE_ID` - Default voice ID

### add-audio
Merge audio tracks with video clips.

```bash
sceneforge add-audio --demo <name> [options]
```

**Options:**
| Flag | Description |
|------|-------------|
| `--demo` | Demo name |
| `--output`, `-o` | Output directory |
| `--quality` | Quality preset: low, medium, high (default: medium) |
| `--crf` | Override CRF value (0-51, lower = better) |
| `--codec` | Video codec: libx264, libx265 (default: libx264) |
| `--output-size` | Output video dimensions (preset or WxH) |
| `--output-width` | Output width (-1 for auto) |
| `--output-height` | Output height (-1 for auto) |

**Video Quality:** Configurable via `--quality` preset. Default: medium (CRF 18, libx264). Audio: AAC 192kbps.

**Output Presets:** 720p, 1080p, 1440p, 4k (landscape), tiktok/shorts/reels (1080x1920 portrait), square (1080x1080)

### concat
Concatenate step clips into final video.

```bash
sceneforge concat --demo <name> [options]
```

**Options:**
| Flag | Description |
|------|-------------|
| `--demo` | Demo name |
| `--output`, `-o` | Output directory |
| `--quality` | Quality preset: low, medium, high (default: medium) |
| `--crf` | Override CRF value (0-51, lower = better) |
| `--codec` | Video codec: libx264, libx265 (default: libx264) |
| `--output-size` | Output video dimensions (preset or WxH) |
| `--output-width` | Output width (-1 for auto) |
| `--output-height` | Output height (-1 for auto) |
| `--intro` | Intro video to prepend |
| `--outro` | Outro video to append |
| `--music` | Background music file |
| `--music-volume` | Music volume 0-1 (default: 0.15) |

**Video Quality:** Configurable via `--quality` preset. Default: medium (CRF 18, libx264). Includes `+faststart` for web streaming. Audio: AAC 192kbps.

**Output Presets:** 720p, 1080p, 1440p, 4k (landscape), tiktok/shorts/reels (1080x1920 portrait), square (1080x1080)

### doctor
Run environment diagnostics.

```bash
sceneforge doctor [options]
```

**Options:**
| Flag | Description |
|------|-------------|
| `--root` | Project root directory |
| `--env-file` | Environment file path |
| `--json` | Output as JSON |

**Checks:**
- ffmpeg installation
- ffprobe installation
- Environment variables (ELEVENLABS_API_KEY, etc.)

### context
Manage LLM context files for AI coding assistants.

```bash
sceneforge context <subcommand> [options]
```

**Subcommands:**
- `deploy` - Deploy context files (additive - preserves existing content)
- `list` - List deployed context
- `remove` - Remove context files
- `preview` - Preview context content
- `skill` - Manage skills

**Additive Deployment:**
SceneForge uses markers to identify its content in instruction files:
- `<!-- SCENEFORGE_CONTEXT_START -->` and `<!-- SCENEFORGE_CONTEXT_END -->`
- Existing content outside these markers is preserved
- Re-running deploy updates only the SceneForge section

See dedicated context documentation for details.

## Output Structure

```
output/
  <demo-name>/
    videos/           # Raw step recordings
    scripts/          # Generated script JSON
    audio/            # Synthesized voiceover
    final/            # Concatenated output
    test-results/     # Playwright artifacts
```

## Common Workflows

### First-time Demo Creation

```bash
# 1. Create auth state if needed
sceneforge setup -d setup.yaml -b http://localhost:3000 -o auth.json

# 2. Record demo
sceneforge record -d demo.yaml -b http://localhost:3000 --storage auth.json --headed

# 3. Generate voiceover
sceneforge voiceover --demo my-demo

# 4. Process video
sceneforge add-audio --demo my-demo
sceneforge concat --demo my-demo
```

### Using Pipeline

```bash
# Full automated pipeline
sceneforge pipeline -d demo.yaml -b http://localhost:3000 --clean

# After making script changes
sceneforge pipeline -d demo.yaml -b http://localhost:3000 --skip-record
```

### Debugging

```bash
# Run diagnostics
sceneforge doctor

# Record in headed mode with slow motion
sceneforge record -d demo.yaml -b http://localhost:3000 --headed --slowmo 500
```

## Video Quality

SceneForge provides configurable video quality settings via CLI flags on `split`, `add-audio`, and `concat` commands.

### Quality Presets

| Preset | CRF | Encoding | Use Case |
|--------|-----|----------|----------|
| `low` | 28 | fast | Quick drafts, smaller files |
| `medium` | 18 | medium | Default - balanced quality and size |
| `high` | 10 | slow | Final delivery, best quality |

### Supported Codecs

| Codec | Name | Description |
|-------|------|-------------|
| `libx264` | H.264 | Excellent compatibility (default) |
| `libx265` | H.265/HEVC | ~50% smaller files, slower encoding |

### CLI Flags

```bash
--quality <preset>    # low, medium, high (default: medium)
--crf <value>         # Override CRF (0-51, lower = better)
--codec <codec>       # libx264 or libx265 (default: libx264)
```

### Examples

```bash
# High quality for final output
sceneforge concat --demo my-demo --quality high

# Smaller files with H.265 codec
sceneforge concat --demo my-demo --codec libx265

# Custom CRF for fine control
sceneforge split --demo my-demo --crf 15
```

### Why Quality Matters

- Videos go through multiple processing stages (split → add-audio → concat)
- Each re-encoding can degrade quality (generation loss)
- Higher quality settings (lower CRF) preserve fidelity across stages
- The `high` preset (CRF 10) produces near-lossless quality

### CRF Reference

- 0 = Lossless (huge files)
- 10 = Near-lossless (high preset)
- 18 = Visually lossless (medium preset, default)
- 23 = FFmpeg default
- 28 = Lower quality (low preset)

## Viewport Settings

Control output video resolution during recording.

### CLI Flags (record, pipeline)

```bash
--viewport <WxH|preset>      # Target video resolution (default: 1440x900)
--width <px>                 # Video width (overrides --viewport)
--height <px>                # Video height (overrides --viewport)
```

### Viewport Presets

| Preset | Resolution |
|--------|------------|
| `720p` | 1280x720 |
| `1080p` | 1920x1080 |
| `1440p` | 2560x1440 |
| `4k` | 3840x2160 |

## Output Dimensions

Control final video resolution after processing. Supports landscape, portrait, and square formats.

### CLI Flags (split, add-audio, concat, pipeline)

```bash
--output-size <WxH|preset>   # Output video dimensions
--output-width <px>          # Output width (-1 for auto)
--output-height <px>         # Output height (-1 for auto)
```

### Output Presets

| Preset | Resolution | Use Case |
|--------|------------|----------|
| `720p` | 1280x720 | HD landscape |
| `1080p` | 1920x1080 | Full HD landscape |
| `1440p` | 2560x1440 | QHD landscape |
| `4k` | 3840x2160 | 4K UHD landscape |
| `720p-portrait` | 720x1280 | HD portrait |
| `1080p-portrait` | 1080x1920 | Full HD portrait |
| `tiktok` | 1080x1920 | TikTok/Instagram Reels |
| `shorts` | 1080x1920 | YouTube Shorts |
| `reels` | 1080x1920 | Instagram Reels |
| `square` | 1080x1080 | Square format |
| `square-720` | 720x720 | Square format (smaller) |

### How Scaling Works

- Videos are scaled while maintaining aspect ratio
- Black padding (letterboxing/pillarboxing) is added when aspect ratios don't match
- For portrait formats, landscape recordings will have vertical black bars
- For auto-scale (`-1`), the dimension is calculated to maintain aspect ratio

### Examples

```bash
# Standard 1080p output
sceneforge concat --demo my-demo --output-size 1080p

# TikTok/YouTube Shorts (portrait)
sceneforge pipeline -d demo.yaml -b http://localhost:3000 --output-size tiktok

# Square for Instagram
sceneforge concat --demo my-demo --output-size square

# Full pipeline with all options
sceneforge pipeline -d demo.yaml -b http://localhost:3000 \
  --viewport 1080p \
  --output-size 1080p \
  --quality high
```

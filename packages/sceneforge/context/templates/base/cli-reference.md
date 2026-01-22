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

**Examples:**
```bash
# Basic recording
sceneforge record -d demo.yaml -b http://localhost:3000

# Headed mode for debugging
sceneforge record -d demo.yaml -b http://localhost:3000 --headed

# With auth state
sceneforge record -d demo.yaml -b http://localhost:3000 --storage ./auth.json
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

**Examples:**
```bash
# Full pipeline with clean output
sceneforge pipeline -d demo.yaml -b http://localhost:3000 --clean

# Resume after fixing issues
sceneforge pipeline -d demo.yaml -b http://localhost:3000 --resume

# Skip recording (use existing videos)
sceneforge pipeline -d demo.yaml --skip-record
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
- `deploy` - Deploy context files
- `list` - List deployed context
- `remove` - Remove context files
- `preview` - Preview context content
- `skill` - Manage skills

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

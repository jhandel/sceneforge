# Stage 4: Rebalancing

This stage focuses on the iteration cycle after audio generation, using actual audio durations to fine-tune synchronization.

## Objectives

1. Analyze audio manifest with actual durations
2. Compare actual audio vs. video timing
3. Make final timing adjustments
4. Achieve polished final output

## Audio Manifest Format

After running `sceneforge voiceover`, the audio manifest is saved to:
```
output/<demo-name>/audio/manifest.json
```

### Manifest Structure

```json
{
  "demoName": "my-demo",
  "generatedAt": "2024-01-15T11:00:00Z",
  "voiceId": "21m00Tcm4TlvDq8ikWAM",
  "segments": [
    {
      "stepId": "intro",
      "script": "Welcome to this demo...",
      "audioFile": "intro.mp3",
      "durationMs": 4850,
      "estimatedDurationMs": 4800,
      "variance": 50
    }
  ],
  "totalDurationMs": 47200,
  "totalEstimatedMs": 45000
}
```

### Key Fields

| Field | Description |
|-------|-------------|
| `durationMs` | Actual audio duration from ElevenLabs |
| `estimatedDurationMs` | Our word count estimate |
| `variance` | Difference (actual - estimated) |
| `audioFile` | Generated audio file path |

## Rebalancing Workflow

### 1. Generate Voiceover
```bash
sceneforge voiceover --demo my-demo
```

### 2. Analyze Manifest
```bash
cat output/my-demo/audio/manifest.json | jq '.segments[] | {stepId, durationMs, variance}'
```

### 3. Identify Problem Steps

**Audio longer than video:**
```
stepTimingMs: 3000
audioDurationMs: 4500
Problem: Voiceover will be cut off or overlap
```

**Audio shorter than video:**
```
stepTimingMs: 5000
audioDurationMs: 2000
Problem: Silent gap in demo
```

### 4. Make Adjustments

Adjust the YAML based on actual audio durations.

### 5. Re-run Pipeline
```bash
sceneforge pipeline -d demo.yaml -b http://localhost:3000 --resume
```

The `--resume` flag skips completed steps and re-processes from where changes are needed.

## Adjustment Strategies

### Audio Too Long

**Option A: Add wait action to extend step**
```yaml
- id: explain-feature
  script: "This feature provides comprehensive analytics..."
  actions:
    - action: hover
      target: { type: selector, selector: ".analytics-panel" }
    - action: wait
      duration: 2000  # Added to match audio duration
```

**Option B: Shorten script**
```yaml
# Before (estimated 6s, actual 7.2s)
script: "This feature provides comprehensive analytics including detailed breakdowns of user engagement metrics."

# After (shorter to match available time)
script: "This feature provides comprehensive analytics on user engagement."
```

### Audio Too Short

**Option A: Expand script**
```yaml
# Before (estimated 3s, actual 2.5s, but step is 5s)
script: "Click Save to finish."

# After (expanded to fill time)
script: "Click the Save button to store your changes. The system will confirm once saved."
```

**Option B: Split into multiple steps**
```yaml
# Before: One step with long video and short script
- id: complex-workflow
  script: "Complete the workflow."
  actions:
    # ... many actions

# After: Split into logical parts
- id: workflow-part-1
  script: "First, configure the basic settings."
  actions:
    # ... first set of actions

- id: workflow-part-2
  script: "Next, set up the advanced options."
  actions:
    # ... second set of actions
```

## Iteration Cycle

```
┌─────────────────────────────────┐
│  1. Edit YAML (scripts/waits)   │
└───────────────┬─────────────────┘
                │
                ▼
┌─────────────────────────────────┐
│  2. Run pipeline with --resume  │
│     (re-records if needed)      │
└───────────────┬─────────────────┘
                │
                ▼
┌─────────────────────────────────┐
│  3. Generate new voiceover      │
│     (or use cache if unchanged) │
└───────────────┬─────────────────┘
                │
                ▼
┌─────────────────────────────────┐
│  4. Check manifest for timing   │
└───────────────┬─────────────────┘
                │
                ▼
        ┌───────┴───────┐
        │  Acceptable?  │
        └───────┬───────┘
           No ──┼── Yes
                │    │
                │    ▼
         Loop   │  Done!
         back ──┘
```

## Using --resume Flag

The `--resume` flag is essential for efficient iteration:

```bash
# First run: full pipeline
sceneforge pipeline -d demo.yaml -b http://localhost:3000 --clean

# After editing scripts only (no action changes)
sceneforge pipeline -d demo.yaml -b http://localhost:3000 --resume --skip-record

# After editing actions
sceneforge pipeline -d demo.yaml -b http://localhost:3000 --resume
```

**Resume behavior:**
- Detects which steps have changes
- Re-uses cached voiceover for unchanged scripts
- Only re-records steps with action changes
- Regenerates final video

## Quality Checks

### Visual Sync Check
Watch the final video and note:
- [ ] Voiceover starts match action starts
- [ ] No awkward silences
- [ ] No cut-off narration
- [ ] Transitions feel natural

### Timing Tolerance
Aim for variance within ±500ms per step:
- Under 500ms: Usually acceptable
- 500-1000ms: Consider adjustment
- Over 1000ms: Definitely adjust

### Audio Quality Check
- [ ] No clipped words at step boundaries
- [ ] Volume consistent across steps
- [ ] No unexpected pauses

## Final Checklist

- [ ] All steps have acceptable timing variance
- [ ] Final video plays smoothly
- [ ] Voiceover syncs with actions
- [ ] No dead air or overlap issues
- [ ] Intro provides adequate context
- [ ] Outro concludes naturally
- [ ] Overall demo flows professionally

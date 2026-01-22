# Skill: Balance Timing

Analyze and balance the timing between script duration and action duration in a SceneForge demo.

## Task

Review timing data from the scripts JSON and suggest adjustments to achieve better synchronization.

## Input Required

Provide the following:
- **Scripts JSON data**: Content from `output/<demo>/scripts/<demo>-scripts.json`
- **Problem steps**: Steps with timing issues (optional)
- **Constraints**: Any timing requirements (optional)

## Analysis Process

### Step 1: Calculate Timing Difference

For each step:
```
difference = stepTimingMs - estimatedDurationMs
```

- **Positive**: Actions take longer than voiceover
- **Negative**: Voiceover takes longer than actions

### Step 2: Categorize Issues

| Difference | Severity | Action Needed |
|------------|----------|---------------|
| ±500ms | Minor | Usually acceptable |
| 500-1500ms | Moderate | Consider adjustment |
| >1500ms | Significant | Must adjust |

### Step 3: Recommend Solutions

## Output Format

Provide a timing analysis report with:
1. Summary of all steps with issues
2. Recommended adjustments per step
3. Updated YAML snippets

## Example Analysis

### Input Data
```json
{
  "steps": [
    {
      "stepId": "intro",
      "estimatedDurationMs": 4800,
      "stepTimingMs": 2000,
      "wordCount": 12
    },
    {
      "stepId": "fill-form",
      "estimatedDurationMs": 3600,
      "stepTimingMs": 6000,
      "wordCount": 9
    }
  ]
}
```

### Analysis Output

```
## Timing Analysis Report

### Step: intro
- Script duration: 4800ms (12 words)
- Video duration: 2000ms
- Difference: -2800ms (voiceover too long)

**Recommendation:** Add wait action to extend step duration

```yaml
- id: intro
  script: "Welcome to this demo..."
  actions:
    - action: wait
      duration: 5000  # Extended from 2000ms
```

### Step: fill-form
- Script duration: 3600ms (9 words)
- Video duration: 6000ms
- Difference: +2400ms (video has dead air)

**Recommendation:** Expand script to fill time

**Current script (9 words):**
"Enter your details in the form below."

**Suggested script (15 words):**
"Enter your details in the form below. We'll add your name, email, and message."
```

## Adjustment Strategies

### When Video > Script (Dead Air)

**Option 1: Expand script**
- Add more context or explanation
- Describe what user should notice
- Preview next step

**Option 2: Split into multiple steps**
- If step has distinct phases
- Each gets focused narration

### When Script > Video (Overlap Risk)

**Option 1: Add wait action**
```yaml
actions:
  - action: click
    target: ...
  - action: wait
    duration: 2000  # Added padding
```

**Option 2: Shorten script**
- Remove redundant words
- Focus on essential information
- Split long sentences

## Checklist

- [ ] All steps analyzed for timing variance
- [ ] Significant issues identified
- [ ] Solutions provided for each issue
- [ ] Updated YAML snippets included
- [ ] Total runtime remains reasonable

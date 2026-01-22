# Stage 3: Step Balancing

This stage focuses on analyzing timing data and adjusting scripts/actions to achieve optimal synchronization between voiceover and video.

## Objectives

1. Analyze script JSON output for timing data
2. Compare estimated vs. actual durations
3. Adjust scripts or add wait actions
4. Achieve smooth synchronization

## Understanding Timing Data

After running `sceneforge record`, timing data is saved to:
```
output/<demo-name>/scripts/<demo-name>-scripts.json
```

### Script JSON Format

```json
{
  "demoName": "my-demo",
  "generatedAt": "2024-01-15T10:30:00Z",
  "steps": [
    {
      "stepId": "intro",
      "script": "Welcome to this demo...",
      "wordCount": 12,
      "estimatedDurationMs": 4800,
      "stepTimingMs": 3000,
      "actions": [
        {
          "action": "wait",
          "duration": 3000
        }
      ]
    }
  ],
  "totalEstimatedDurationMs": 45000,
  "totalWordCount": 112
}
```

### Key Metrics

| Metric | Description |
|--------|-------------|
| `estimatedDurationMs` | Expected voiceover duration (wordCount × 400ms) |
| `stepTimingMs` | Actual recorded step duration |
| `wordCount` | Number of words in script |

## Balancing Strategy

### Step Duration Analysis

For each step, compare:
```
Difference = stepTimingMs - estimatedDurationMs
```

**If positive (actions longer than script):**
- Video has "dead air"
- Options: Expand script OR add wait action at start

**If negative (script longer than actions):**
- Voiceover will overlap next step
- Options: Shorten script OR add wait action at end

### Adjustment Options

#### 1. Expand Script (actions > script)

**Before:**
```yaml
- id: create-project
  script: "Click Create to make a new project."
  actions:
    - action: click
      target: { type: button, text: "Create" }
    - action: wait
      waitFor: { type: selector, value: ".modal" }
    - action: type
      target: { type: input, name: "name" }
      text: "My Project"
```

**After (expanded script):**
```yaml
- id: create-project
  script: "Click the Create button to start a new project. In the dialog that appears, enter a descriptive name for your project."
  actions:
    - action: click
      target: { type: button, text: "Create" }
    - action: wait
      waitFor: { type: selector, value: ".modal" }
    - action: type
      target: { type: input, name: "name" }
      text: "My Project"
```

#### 2. Add Wait Action (actions < script)

**Before:**
```yaml
- id: quick-action
  script: "This powerful feature allows you to quickly process multiple items at once, saving significant time in your workflow."
  actions:
    - action: click
      target: { type: button, text: "Process All" }
```

**After (with wait):**
```yaml
- id: quick-action
  script: "This powerful feature allows you to quickly process multiple items at once, saving significant time in your workflow."
  actions:
    - action: click
      target: { type: button, text: "Process All" }
    - action: wait
      duration: 3000  # Allow voiceover to complete
```

#### 3. Shorten Script (script too long)

**Before:**
```yaml
- id: save-settings
  script: "Now we need to click the Save button located at the bottom of the form to save all of our configuration changes to the system."
  actions:
    - action: click
      target: { type: button, text: "Save" }
```

**After (shortened):**
```yaml
- id: save-settings
  script: "Click Save to apply your changes."
  actions:
    - action: click
      target: { type: button, text: "Save" }
```

## Timing Formulas

### Estimate Script Duration
```
estimatedMs = wordCount × 400
```

### Calculate Required Wait
```
waitMs = estimatedDurationMs - stepTimingMs
```
If `waitMs > 0`, add wait action with that duration.

### Words Per Second
```
wordsPerSecond = 2.5  (150 WPM)
```

## Balancing Workflow

1. **Record demo:**
   ```bash
   sceneforge record -d demo.yaml -b http://localhost:3000
   ```

2. **Review timing data:**
   ```bash
   cat output/my-demo/scripts/my-demo-scripts.json
   ```

3. **Identify imbalances:**
   - Steps where `stepTimingMs << estimatedDurationMs`
   - Steps where `stepTimingMs >> estimatedDurationMs`

4. **Make adjustments:**
   - Edit YAML to modify scripts
   - Add/remove wait actions

5. **Re-record and verify:**
   ```bash
   sceneforge record -d demo.yaml -b http://localhost:3000
   ```

## Common Adjustments

### Add Intro Padding
```yaml
- id: intro
  script: "Welcome to the Product Tour. In this demo, we'll explore the key features."
  actions:
    - action: wait
      duration: 4000  # Match script duration
```

### Extend Transition
```yaml
- id: navigate-dashboard
  script: "Navigate to the dashboard to see your analytics overview."
  actions:
    - action: click
      target: { type: link, text: "Dashboard" }
    - action: wait
      waitFor: { type: idle }
    - action: wait
      duration: 1500  # Extra time for voiceover
```

### Quick Action Padding
```yaml
- id: single-click
  script: "Enable notifications to stay updated on project changes."
  actions:
    - action: click
      target: { type: selector, selector: "[data-testid='notifications-toggle']" }
    - action: wait
      duration: 2500  # Voiceover needs time
```

## Checklist Before Stage 4

- [ ] All steps reviewed for timing balance
- [ ] Scripts match action durations (within ~20%)
- [ ] Wait actions added where needed
- [ ] No rapid-fire short steps
- [ ] Intro/outro have adequate duration
- [ ] Demo flows naturally when watched

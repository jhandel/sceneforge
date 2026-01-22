# Skill: Review Demo YAML

Review and improve a SceneForge demo definition for quality, reliability, and best practices.

## Task

Analyze a demo YAML file and provide feedback on:
- Action reliability
- Selector stability
- Script quality
- Timing considerations
- Overall structure

## Input Required

Provide the following:
- **Demo YAML content**: The full demo definition
- **Issues encountered**: Any known problems (optional)
- **Focus areas**: Specific aspects to review (optional)

## Review Categories

### 1. Schema Compliance
- Valid YAML syntax
- Required fields present
- Correct action types
- Valid target types

### 2. Selector Quality
- Stability score (data-testid > aria-label > text)
- Specificity (not too broad or narrow)
- Brittleness risk

### 3. Wait Conditions
- Present after async operations
- Appropriate condition types
- Reasonable timeouts

### 4. Script Quality
- Clarity and tone
- Length vs. action duration
- Grammar and punctuation

### 5. Step Organization
- Logical groupings
- Descriptive IDs
- Appropriate granularity

## Output Format

```markdown
## Demo Review: [demo-name]

### Summary
- Overall quality: Good/Needs Work/Poor
- Critical issues: X
- Warnings: Y
- Suggestions: Z

### Critical Issues
[List of must-fix problems]

### Warnings
[List of should-fix problems]

### Suggestions
[List of nice-to-have improvements]

### Detailed Review

#### Step: [step-id]
- Actions: [assessment]
- Selectors: [assessment]
- Script: [assessment]
- Recommendations: [list]

[Repeat for each step]

### Recommended Changes
[YAML snippets with improvements]
```

## Review Checklist

### Schema
- [ ] Version field present
- [ ] Name follows naming convention
- [ ] Title is descriptive
- [ ] All steps have IDs
- [ ] All steps have script field
- [ ] All steps have actions array

### Selectors
- [ ] No fragile CSS class selectors
- [ ] No position-based selectors
- [ ] Uses data-testid where available
- [ ] Fallbacks use semantic selectors

### Wait Conditions
- [ ] Navigation actions have waitFor
- [ ] Clicks that trigger async have waitFor
- [ ] Timeouts are reasonable (not too short)

### Scripts
- [ ] All steps have non-empty scripts (or intentionally empty)
- [ ] Language is clear and natural
- [ ] No spelling/grammar errors
- [ ] Appropriate length for actions

### Structure
- [ ] Steps grouped logically
- [ ] IDs are descriptive
- [ ] Not too many actions per step
- [ ] Intro/outro provide context

## Example Review

```markdown
## Demo Review: onboarding-flow

### Summary
- Overall quality: Needs Work
- Critical issues: 2
- Warnings: 3
- Suggestions: 4

### Critical Issues

1. **Step "click-button" uses fragile selector**
   ```yaml
   # Current
   selector: ".btn.btn-primary.mt-4"

   # Recommended
   selector: "[data-testid='submit-btn']"
   ```

2. **Step "load-data" missing wait condition**
   ```yaml
   # Current
   - action: click
     target: { type: button, text: "Load" }

   # Recommended
   - action: click
     target: { type: button, text: "Load" }
     waitFor:
       type: selector
       value: ".data-table"
   ```

### Warnings

1. Script in step "intro" may be too short for video duration
2. Step IDs not descriptive: "step1", "step2"
3. No timeout on slow API wait condition

### Suggestions

1. Add highlight to key click actions
2. Consider splitting "fill-large-form" into multiple steps
3. Add brief pause after modal opens
4. Include conclusion step
```

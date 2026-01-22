# Skill: Optimize Demo

Optimize a SceneForge demo for better flow, reliability, and viewer experience.

## Task

Review and optimize a demo definition for:
- Smoother transitions
- Better pacing
- Improved reliability
- Enhanced viewer experience

## Input Required

Provide the following:
- **Demo YAML content**: The full demo definition
- **Problem areas**: Known issues with flow/pacing (optional)
- **Target duration**: Desired total runtime (optional)
- **Audience**: Who will watch this demo (optional)

## Optimization Areas

### 1. Pacing Optimization
- Step duration balance
- Transition timing
- Information density

### 2. Visual Flow
- Highlights for key actions
- Hover states for context
- Scroll to show content

### 3. Reliability
- Selector stability
- Wait condition coverage
- Error resilience

### 4. Narrative Flow
- Script coherence
- Logical progression
- Clear purpose

## Output Format

```markdown
## Demo Optimization Report

### Overview
- Current duration: ~Xm Xs
- Recommended duration: ~Ym Ys
- Optimization potential: High/Medium/Low

### Pacing Issues
[List of pacing problems]

### Flow Improvements
[Suggested improvements]

### Reliability Enhancements
[Stability improvements]

### Optimized YAML
[Updated demo definition]
```

## Optimization Techniques

### Improve Transitions

**Add smooth navigation waits:**
```yaml
# Before
- action: click
  target: { type: link, text: "Dashboard" }

# After
- action: click
  target: { type: link, text: "Dashboard" }
  waitFor:
    type: idle
- action: wait
  duration: 500  # Let page settle
```

### Add Visual Emphasis

**Highlight important clicks:**
```yaml
- action: click
  target:
    type: button
    text: "Create Project"
  highlight: true  # Visual indicator for viewers
```

**Add hover for context:**
```yaml
# Before click, hover to draw attention
- action: hover
  target:
    type: selector
    selector: "[data-testid='important-button']"
- action: wait
  duration: 500
- action: click
  target:
    type: selector
    selector: "[data-testid='important-button']"
```

### Optimize Step Grouping

**Split complex steps:**
```yaml
# Before: One step with 8 actions
- id: complete-form
  script: "Fill out the entire form."
  actions: [... 8 actions ...]

# After: Logical groupings
- id: fill-personal-info
  script: "Start by entering your personal information."
  actions:
    - action: type
      target: { type: input, name: "name" }
      text: "John Smith"
    - action: type
      target: { type: input, name: "email" }
      text: "john@example.com"

- id: fill-company-info
  script: "Next, add your company details."
  actions:
    - action: type
      target: { type: input, name: "company" }
      text: "Acme Corp"
    - action: type
      target: { type: input, name: "role" }
      text: "Developer"
```

### Add Breathing Room

**Pause between major sections:**
```yaml
- id: section-transition
  script: "Now let's look at the reporting features."
  actions:
    - action: wait
      duration: 1500
    - action: click
      target: { type: link, text: "Reports" }
```

### Improve Script Flow

**Connect steps narratively:**
```yaml
# Step 1 ending
script: "...and that completes the basic setup."

# Step 2 beginning (flows from step 1)
script: "With the foundation in place, we can now configure advanced options."
```

### Add Recovery Points

**Ensure stable states:**
```yaml
# After potentially flaky operations
- action: click
  target: { type: button, text: "Process" }
  waitFor:
    type: selectorHidden
    value: ".processing-spinner"
    timeout: 30000  # Generous timeout
- action: wait
  waitFor:
    type: selector
    value: ".success-indicator"
```

## Pacing Guidelines

| Step Type | Recommended Duration |
|-----------|---------------------|
| Intro | 5-10 seconds |
| Simple action | 3-5 seconds |
| Form entry | 8-15 seconds |
| Feature explanation | 10-20 seconds |
| Transition | 2-4 seconds |
| Outro | 5-10 seconds |

## Optimization Checklist

### Pacing
- [ ] No rushed steps (< 2 seconds)
- [ ] No overly long steps (> 30 seconds)
- [ ] Smooth transitions between sections
- [ ] Adequate intro and outro

### Visual
- [ ] Key actions have highlights
- [ ] Complex UI has hover indicators
- [ ] Content scrolled into view
- [ ] No jarring jumps

### Reliability
- [ ] All async operations have waits
- [ ] Timeouts are reasonable
- [ ] Selectors are stable
- [ ] Error states considered

### Narrative
- [ ] Scripts connect logically
- [ ] Purpose is clear throughout
- [ ] Technical terms explained
- [ ] Conclusion summarizes value

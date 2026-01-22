# Stage 2: Script Writing

This stage focuses on writing voiceover scripts that will be synthesized to speech and synchronized with the recorded actions.

## Objectives

1. Write clear, engaging voiceover scripts
2. Match script duration to action timing
3. Optimize for voice synthesis
4. Create natural pacing

## Script Writing Guidelines

### Target Speaking Rate

**~150 words per minute** is the ideal speaking rate for clarity.

Quick estimation:
- 5 words ≈ 2 seconds
- 15 words ≈ 6 seconds
- 30 words ≈ 12 seconds

### Script Format

```yaml
steps:
  - id: navigate-to-dashboard
    script: "Let's start by navigating to the dashboard where we can see an overview of all our projects."
    actions:
      - action: navigate
        path: /dashboard
```

### Writing Style

**Do:**
- Use conversational, natural language
- Start sentences with action words ("Click", "Notice", "Let's")
- Explain the purpose of actions
- Add context for viewers unfamiliar with the app

**Don't:**
- Use overly technical jargon without explanation
- Write long, complex sentences
- Include filler words ("um", "uh", "basically")
- Repeat obvious visual information

### Script Examples

**Good:**
```yaml
script: "Click the Create button to open the new project form. Here we'll enter the basic details for our project."
```

**Avoid:**
```yaml
script: "So basically what we're going to do now is we're going to click on this button here that says Create and that's going to open up a form."
```

### Timing Alignment

Match script length to action complexity:

**Short actions (click, hover):**
```yaml
- id: click-save
  script: "Click Save to store your changes."
  actions:
    - action: click
      target:
        type: button
        text: "Save"
```

**Longer actions (form filling):**
```yaml
- id: fill-user-details
  script: "Enter the user's information in the form. We'll add their name, email address, and select their role from the dropdown menu."
  actions:
    - action: type
      target: { type: input, name: "name" }
      text: "Jane Smith"
    - action: type
      target: { type: input, name: "email" }
      text: "jane@company.com"
    - action: click
      target: { type: selector, selector: "[data-testid='role-select']" }
    - action: click
      target: { type: text, text: "Administrator" }
```

### Voice Synthesis Considerations

ElevenLabs handles most natural speech patterns, but consider:

**Punctuation affects pacing:**
- Periods (.) create full pauses
- Commas (,) create brief pauses
- Ellipsis (...) creates hesitation

**Emphasis:**
- Use sentence structure for emphasis
- Place important words at sentence start/end

**Numbers and abbreviations:**
- Write out numbers for clarity: "three" not "3"
- Spell out abbreviations: "API" → "A P I" or "application programming interface"

## Common Patterns

### Introduction Step
```yaml
- id: intro
  script: "Welcome to this demo of the Project Management dashboard. I'll show you how to create a new project and assign team members."
  actions:
    - action: wait
      duration: 2000
```

### Navigation Narration
```yaml
- id: go-to-settings
  script: "Let's head over to the Settings page where we can configure our preferences."
  actions:
    - action: click
      target:
        type: link
        text: "Settings"
    - action: wait
      waitFor:
        type: idle
```

### Feature Highlight
```yaml
- id: show-filter
  script: "Notice the filter panel on the left. This allows you to narrow down results by date, status, or category."
  actions:
    - action: hover
      target:
        type: selector
        selector: ".filter-panel"
      highlight: true
    - action: wait
      duration: 1500
```

### Form Walkthrough
```yaml
- id: complete-form
  script: "Fill in the required fields. Start with the project name, then add a description. Finally, select a category from the dropdown."
  actions:
    - action: type
      target: { type: input, name: "name" }
      text: "Q1 Marketing Campaign"
    - action: type
      target: { type: selector, selector: "textarea[name='description']" }
      text: "Campaign planning and execution for Q1 product launch."
    - action: click
      target: { type: selector, selector: "[data-testid='category-select']" }
    - action: click
      target: { type: text, text: "Marketing" }
```

### Conclusion Step
```yaml
- id: outro
  script: "That completes our walkthrough. You've learned how to create projects, assign team members, and configure basic settings. For more tutorials, visit our documentation."
  actions:
    - action: wait
      duration: 2000
```

## Duration Estimation

Calculate approximate script duration:

```
word_count / 2.5 = seconds
```

Example: 25 words / 2.5 = 10 seconds

Compare with expected action duration and adjust:
- Add detail if actions take longer
- Trim script if too long
- Add `wait` actions for padding

## Checklist Before Stage 3

- [ ] All steps have scripts (none empty)
- [ ] Scripts explain what's happening
- [ ] Language is clear and conversational
- [ ] Technical terms are explained
- [ ] Script length roughly matches action duration
- [ ] No spelling or grammar errors
- [ ] Intro and outro provide context

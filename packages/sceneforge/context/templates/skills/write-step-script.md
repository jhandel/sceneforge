# Skill: Write Step Script

Write voiceover script text for a SceneForge demo step.

## Task

Create engaging, clear voiceover script that explains the actions in a demo step.

## Input Required

Provide the following:
- **Step ID**: The identifier of the step
- **Actions**: The actions that will be performed
- **Context**: What has happened before this step
- **Target duration**: Approximate time (optional)

## Output Format

A single `script` field value suitable for voice synthesis:
- Natural, conversational tone
- Explains what's happening and why
- Matches approximate action timing
- Clean punctuation for speech synthesis

## Writing Guidelines

### Speaking Rate
- Target: ~150 words per minute
- 5 words ≈ 2 seconds
- 15 words ≈ 6 seconds

### Tone
- Conversational, not robotic
- Second person ("you") or first person plural ("we")
- Action-oriented ("Click", "Enter", "Notice")

### Structure
- Start with action verb when possible
- Explain purpose, not just mechanics
- Add context for unfamiliar features

## Examples

### Simple Click Action

**Actions:**
```yaml
- action: click
  target:
    type: button
    text: "Save"
```

**Script:**
```
"Click Save to store your changes."
```

### Form Entry

**Actions:**
```yaml
- action: type
  target: { type: input, name: "email" }
  text: "user@example.com"
- action: type
  target: { type: input, name: "password" }
  text: "********"
```

**Script:**
```
"Enter your email address and password to sign in to your account."
```

### Feature Introduction

**Actions:**
```yaml
- action: hover
  target:
    type: selector
    selector: ".analytics-panel"
- action: wait
  duration: 2000
```

**Script:**
```
"The analytics panel provides real-time insights into your project's performance. You can see visitor counts, engagement metrics, and conversion rates at a glance."
```

### Navigation

**Actions:**
```yaml
- action: click
  target:
    type: link
    text: "Settings"
- action: wait
  waitFor:
    type: idle
```

**Script:**
```
"Navigate to Settings to customize your preferences and configure your account options."
```

## Anti-Patterns to Avoid

**Too mechanical:**
```
"Click the button that says Save."
```

**Too verbose:**
```
"Now what we're going to do is we're going to click on this Save button here to save all of the changes that we've made."
```

**Stating the obvious:**
```
"You can see there is a button. The button is blue. Click on it."
```

## Checklist

Before finalizing:
- [ ] Natural, conversational language
- [ ] Appropriate length for action duration
- [ ] Explains purpose, not just action
- [ ] No filler words
- [ ] Proper punctuation for speech
- [ ] Consistent tone with other steps

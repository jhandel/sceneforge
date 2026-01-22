# SceneForge YAML Schema Reference

## Demo Definition Structure

```yaml
version: 1
name: demo-name           # Identifier (used for output folders)
title: "Demo Title"       # Display title
description: "Optional description"
steps:
  - id: step-1
    script: "Voiceover text for this step"
    actions:
      - action: navigate
        path: /page-path
      - action: click
        target:
          type: button
          text: "Click Me"
```

## Root Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `version` | number | No | Schema version (default: 1) |
| `name` | string | Yes | Demo identifier for output folders |
| `title` | string | Yes | Display title for the demo |
| `description` | string | No | Optional description |
| `steps` | DemoStep[] | Yes | Array of demo steps |
| `media` | MediaConfig | No | Intro/outro and music config |

## DemoStep

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes | Unique step identifier |
| `script` | string | Yes | Voiceover text (can be empty string) |
| `actions` | DemoAction[] | Yes | Array of actions to execute |

## DemoAction Types

### navigate
Navigate to a URL path.
```yaml
- action: navigate
  path: /dashboard
  waitFor:              # Optional
    type: idle
```

### click
Click on an element.
```yaml
- action: click
  target:
    type: button
    text: "Submit"
  highlight: true       # Optional: visual highlight
  waitFor:              # Optional
    type: selector
    value: ".success-message"
```

### type
Type text into an input.
```yaml
- action: type
  target:
    type: input
    name: email
  text: "user@example.com"
```

### hover
Hover over an element.
```yaml
- action: hover
  target:
    type: selector
    selector: "[data-testid='menu']"
```

### scroll
Scroll the page by duration.
```yaml
- action: scroll
  duration: 1000        # Scroll for 1 second
```

### scrollTo
Scroll to bring an element into view.
```yaml
- action: scrollTo
  target:
    type: text
    text: "Section Title"
```

### wait
Wait for duration or condition.
```yaml
# Wait for fixed duration
- action: wait
  duration: 2000        # 2 seconds

# Wait for condition
- action: wait
  waitFor:
    type: selector
    value: ".loaded"
    timeout: 10000      # Optional timeout
```

### upload
Upload a file.
```yaml
- action: upload
  file: ./assets/document.pdf
  target:               # Optional: specific file input
    type: selector
    selector: "input[type='file']"
```

### drag
Drag an element.
```yaml
- action: drag
  target:
    type: selector
    selector: ".draggable"
  drag:
    deltaX: 100
    deltaY: 50
    steps: 10           # Optional: smoothness
```

## StepTarget Types

| Type | Required Fields | Description |
|------|-----------------|-------------|
| `button` | `text`, `name`, or `selector` | Match a button element |
| `link` | `text`, `name`, or `selector` | Match a link element |
| `input` | `text`, `name`, or `selector` | Match an input element |
| `text` | `text` | Match element containing text |
| `selector` | `selector` | Match by CSS selector |

### Target Examples
```yaml
# By visible text
target:
  type: button
  text: "Save Changes"

# By name attribute
target:
  type: input
  name: "username"

# By CSS selector
target:
  type: selector
  selector: "[data-testid='submit-btn']"
```

## WaitCondition Types

| Type | Requires Value | Description |
|------|----------------|-------------|
| `text` | Yes | Wait for text to appear |
| `selector` | Yes | Wait for selector to match |
| `textHidden` | Yes | Wait for text to disappear |
| `selectorHidden` | Yes | Wait for selector to disappear |
| `navigation` | No | Wait for page navigation |
| `idle` | No | Wait for network idle |

### WaitCondition Examples
```yaml
waitFor:
  type: text
  value: "Success!"
  timeout: 5000

waitFor:
  type: selectorHidden
  value: ".loading-spinner"
```

## Media Configuration

```yaml
media:
  intro:
    file: ./assets/intro.mp4
    duration: 5           # Optional: trim to seconds
    fade: true
    fadeDuration: 0.5
  outro:
    file: ./assets/outro.mp4
  backgroundMusic:
    file: ./assets/music.mp3
    volume: 0.15
    loop: true
    fadeIn: 2
    fadeOut: 2
    startAt:
      type: afterIntro
    endAt:
      type: beforeOutro
```

# Stage 1: Action Generation

This stage focuses on creating the action sequences that will be executed by Playwright to record the demo video.

## Objectives

1. Define clear, reliable action sequences
2. Choose stable, maintainable selectors
3. Add appropriate wait conditions
4. Structure steps logically

## Action Generation Guidelines

### Step Structure

Each step should represent a logical unit of the demo:

```yaml
- id: create-new-item
  script: ""  # Leave empty for now, fill in Stage 2
  actions:
    - action: click
      target:
        type: button
        text: "New Item"
    - action: wait
      waitFor:
        type: selector
        value: ".modal-content"
    - action: type
      target:
        type: input
        name: "item-name"
      text: "My New Item"
    - action: click
      target:
        type: button
        text: "Create"
```

### Selector Selection Strategy

**Priority Order:**
1. `[data-testid="..."]` - Best stability
2. `[aria-label="..."]` - Good for accessible UIs
3. `role=button[name="..."]` - Semantic, readable
4. `button:has-text("...")` - Text-based fallback
5. CSS selectors - Last resort

**Examples:**
```yaml
# Best: data-testid
target:
  type: selector
  selector: "[data-testid='submit-btn']"

# Good: aria-label
target:
  type: selector
  selector: "[aria-label='Close dialog']"

# Acceptable: role with text
target:
  type: button
  text: "Submit"

# Avoid: complex CSS paths
target:
  type: selector
  selector: "div.container > form > div:nth-child(3) > button"
```

### Wait Conditions

Always add wait conditions after actions that trigger:
- Network requests
- Animations/transitions
- Modal dialogs
- Dynamic content loading

```yaml
# After navigation
- action: navigate
  path: /dashboard
  waitFor:
    type: idle

# After click that loads content
- action: click
  target:
    type: button
    text: "Load Data"
  waitFor:
    type: selector
    value: ".data-table"

# After click that opens modal
- action: click
  target:
    type: button
    text: "Settings"
  waitFor:
    type: selector
    value: ".settings-modal"

# Wait for spinner to disappear
- action: wait
  waitFor:
    type: selectorHidden
    value: ".loading-spinner"
```

## Common Patterns

### Form Filling
```yaml
- id: fill-contact-form
  script: ""
  actions:
    - action: type
      target:
        type: input
        name: "name"
      text: "John Smith"
    - action: type
      target:
        type: input
        name: "email"
      text: "john@example.com"
    - action: type
      target:
        type: selector
        selector: "textarea[name='message']"
      text: "Hello, I would like to inquire about..."
    - action: click
      target:
        type: button
        text: "Send Message"
      waitFor:
        type: text
        value: "Message sent!"
```

### Dropdown Selection
```yaml
- id: select-country
  script: ""
  actions:
    - action: click
      target:
        type: selector
        selector: "[data-testid='country-dropdown']"
    - action: wait
      waitFor:
        type: selector
        value: ".dropdown-menu"
    - action: click
      target:
        type: text
        text: "United States"
```

### Modal Workflow
```yaml
- id: confirm-deletion
  script: ""
  actions:
    - action: click
      target:
        type: button
        text: "Delete"
    - action: wait
      waitFor:
        type: selector
        value: ".confirmation-modal"
    - action: click
      target:
        type: selector
        selector: ".confirmation-modal >> button:has-text('Confirm')"
    - action: wait
      waitFor:
        type: selectorHidden
        value: ".confirmation-modal"
```

### Async Content
```yaml
- id: load-report
  script: ""
  actions:
    - action: click
      target:
        type: button
        text: "Generate Report"
    - action: wait
      waitFor:
        type: selectorHidden
        value: ".generating-spinner"
        timeout: 30000
    - action: wait
      waitFor:
        type: selector
        value: ".report-content"
```

## Testing Actions

Run in headed mode to verify actions work correctly:

```bash
sceneforge record --definition demo.yaml --base-url http://localhost:3000 --headed
```

**Debugging tips:**
- Add `--slowmo 500` to slow down execution
- Watch for selector failures in the console
- Check if wait conditions are adequate
- Verify timing between actions

## Step ID Conventions

Use descriptive, kebab-case IDs:
- `login-to-dashboard`
- `create-new-project`
- `upload-document`
- `configure-settings`
- `submit-and-confirm`

## Checklist Before Stage 2

- [ ] All actions execute without errors
- [ ] Selectors are stable (use data-testid where possible)
- [ ] Wait conditions prevent race conditions
- [ ] Steps are logically grouped
- [ ] Step IDs are descriptive
- [ ] Demo completes successfully in headed mode

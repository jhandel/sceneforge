# SceneForge Actions Reference

## Action Type Summary

| Action | Purpose | Required Fields |
|--------|---------|-----------------|
| `navigate` | Go to URL | `path` |
| `click` | Click element | `target` |
| `type` | Enter text | `target`, `text` |
| `hover` | Hover element | `target` |
| `scroll` | Scroll page | `duration` |
| `scrollTo` | Scroll to element | `target` |
| `wait` | Pause execution | `duration` or `waitFor` |
| `upload` | Upload file | `file` |
| `drag` | Drag element | `target`, `drag` |

## Detailed Action Reference

### navigate

Navigate the browser to a URL path. The path is appended to the base URL.

```yaml
- action: navigate
  path: /dashboard
```

**Fields:**
- `path` (required): URL path to navigate to
- `waitFor` (optional): Condition to wait for after navigation

**Common patterns:**
```yaml
# Navigate and wait for network idle
- action: navigate
  path: /settings
  waitFor:
    type: idle

# Navigate and wait for specific element
- action: navigate
  path: /users
  waitFor:
    type: selector
    value: ".user-list"
```

### click

Click on an element identified by target.

```yaml
- action: click
  target:
    type: button
    text: "Submit"
```

**Fields:**
- `target` (required): Element to click
- `highlight` (optional): Show visual highlight before click
- `waitFor` (optional): Condition to wait for after click

**Common patterns:**
```yaml
# Click button with highlight
- action: click
  target:
    type: button
    text: "Save"
  highlight: true

# Click and wait for result
- action: click
  target:
    type: selector
    selector: "[data-testid='submit']"
  waitFor:
    type: text
    value: "Saved successfully"

# Click dropdown option
- action: click
  target:
    type: text
    text: "Option 1"
```

### type

Type text into an input field. Clears existing content first.

```yaml
- action: type
  target:
    type: input
    name: "email"
  text: "user@example.com"
```

**Fields:**
- `target` (required): Input element to type into
- `text` (required): Text to enter
- `waitFor` (optional): Condition to wait for after typing

**Common patterns:**
```yaml
# Type into named input
- action: type
  target:
    type: input
    name: "search"
  text: "query term"

# Type into input by placeholder
- action: type
  target:
    type: selector
    selector: "[placeholder='Enter email']"
  text: "test@example.com"

# Type and wait for autocomplete
- action: type
  target:
    type: input
    name: "city"
  text: "New York"
  waitFor:
    type: selector
    value: ".autocomplete-dropdown"
```

### hover

Move cursor to hover over an element. Useful for triggering hover states, tooltips, or dropdown menus.

```yaml
- action: hover
  target:
    type: selector
    selector: "[data-testid='menu']"
```

**Fields:**
- `target` (required): Element to hover over
- `waitFor` (optional): Condition to wait for after hover

**Common patterns:**
```yaml
# Hover to show tooltip
- action: hover
  target:
    type: selector
    selector: ".info-icon"
  waitFor:
    type: selector
    value: ".tooltip"

# Hover to open dropdown menu
- action: hover
  target:
    type: text
    text: "Products"
  waitFor:
    type: selector
    value: ".dropdown-menu"
```

### scroll

Scroll the page for a specified duration. Creates smooth scrolling animation.

```yaml
- action: scroll
  duration: 1500
```

**Fields:**
- `duration` (required): Scroll duration in milliseconds
- `waitFor` (optional): Condition to wait for after scrolling

### scrollTo

Scroll the page to bring an element into view.

```yaml
- action: scrollTo
  target:
    type: text
    text: "Contact Section"
```

**Fields:**
- `target` (required): Element to scroll to
- `waitFor` (optional): Condition to wait for after scrolling

### wait

Pause demo execution for a duration or until a condition is met.

```yaml
# Fixed duration wait
- action: wait
  duration: 2000

# Conditional wait
- action: wait
  waitFor:
    type: selector
    value: ".data-loaded"
```

**Fields:**
- `duration` (optional): Wait time in milliseconds
- `waitFor` (optional): Condition to wait for

**Note:** Either `duration` or `waitFor` must be specified.

**Common patterns:**
```yaml
# Wait for loading to complete
- action: wait
  waitFor:
    type: selectorHidden
    value: ".spinner"

# Wait for text to appear
- action: wait
  waitFor:
    type: text
    value: "Data loaded"
    timeout: 10000

# Add padding between actions
- action: wait
  duration: 500
```

### upload

Upload a file using a file input.

```yaml
- action: upload
  file: ./assets/image.png
```

**Fields:**
- `file` (required): Path to file (relative to YAML or absolute)
- `target` (optional): Specific file input element
- `waitFor` (optional): Condition to wait for after upload

**Common patterns:**
```yaml
# Upload to specific input
- action: upload
  file: ./documents/report.pdf
  target:
    type: selector
    selector: "#document-upload"

# Upload and wait for preview
- action: upload
  file: ./images/photo.jpg
  waitFor:
    type: selector
    value: ".preview-image"
```

### drag

Drag an element by specified delta.

```yaml
- action: drag
  target:
    type: selector
    selector: ".slider-handle"
  drag:
    deltaX: 100
    deltaY: 0
    steps: 20
```

**Fields:**
- `target` (required): Element to drag
- `drag` (required): Drag configuration
  - `deltaX`: Horizontal movement in pixels
  - `deltaY`: Vertical movement in pixels
  - `steps` (optional): Number of intermediate positions for smooth animation
- `waitFor` (optional): Condition to wait for after drag

## Best Practices

1. **Use specific selectors**: Prefer `data-testid` or unique attributes
2. **Add waitFor conditions**: Ensure UI is ready before next action
3. **Use highlight for important clicks**: Makes demos easier to follow
4. **Group related actions**: Keep logical operations in the same step
5. **Add wait actions for timing**: Control pacing of the demo

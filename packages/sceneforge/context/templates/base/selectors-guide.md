# SceneForge Selectors Guide

## Selector Priority

When targeting elements, use this priority order for reliability:

1. **data-testid** - Most reliable, designed for testing
2. **aria-label** - Good for accessibility-labeled elements
3. **role + text** - Semantic matching for buttons, links
4. **name attribute** - Form inputs
5. **placeholder** - Input placeholders
6. **text content** - Visible text (least stable)
7. **CSS selector** - Last resort, most brittle

## Target Types in SceneForge

### Using `type: selector`

Direct CSS selector - most flexible but requires maintenance.

```yaml
target:
  type: selector
  selector: "[data-testid='submit-button']"
```

**Good selectors:**
```yaml
# data-testid (best)
selector: "[data-testid='save-btn']"

# aria-label
selector: "[aria-label='Close dialog']"

# role with name
selector: "button[name='submit']"

# Unique ID
selector: "#main-header"

# Playwright-specific role selector
selector: "button:has-text('Save')"
selector: "role=button[name='Submit']"
```

**Avoid:**
```yaml
# Fragile class-based selectors
selector: ".btn.btn-primary.mt-4"

# Position-based
selector: "div > div > button:first-child"

# Generated class names
selector: ".css-1a2b3c"
```

### Using `type: button`

Match button elements by text, name, or selector.

```yaml
# By visible text
target:
  type: button
  text: "Save Changes"

# By name attribute
target:
  type: button
  name: "submit"

# By selector (fallback)
target:
  type: button
  selector: "[data-testid='save']"
```

### Using `type: link`

Match anchor elements.

```yaml
target:
  type: link
  text: "Learn More"
```

### Using `type: input`

Match form input elements.

```yaml
# By name (most common)
target:
  type: input
  name: "email"

# By placeholder text
target:
  type: input
  text: "Enter your email"

# By selector
target:
  type: input
  selector: "[data-testid='email-input']"
```

### Using `type: text`

Match any element containing specific text.

```yaml
target:
  type: text
  text: "Welcome back!"
```

**Use for:**
- Headings and labels
- Menu items
- Any element identified by its text content

## Playwright Selector Syntax

SceneForge uses Playwright under the hood. You can use Playwright's selector syntax:

### Role Selectors
```yaml
selector: "role=button[name='Submit']"
selector: "role=link[name='Dashboard']"
selector: "role=textbox[name='Email']"
```

### Text Selectors
```yaml
selector: "text=Click here"
selector: "text=/welcome/i"     # Regex, case-insensitive
```

### Has-text Selectors
```yaml
selector: "button:has-text('Save')"
selector: "div:has-text('Loading')"
```

### Combining Selectors
```yaml
selector: ".modal >> button:has-text('Confirm')"
selector: "[data-testid='form'] >> input[name='email']"
```

## Common Patterns

### Dropdown/Select
```yaml
# Click to open dropdown
- action: click
  target:
    type: selector
    selector: "[data-testid='country-select']"

# Click option
- action: click
  target:
    type: text
    text: "United States"
```

### Modal Dialog
```yaml
# Wait for modal
- action: wait
  waitFor:
    type: selector
    value: ".modal-content"

# Click modal button
- action: click
  target:
    type: selector
    selector: ".modal-content >> button:has-text('Confirm')"
```

### Dynamic Content
```yaml
# Wait for async content
- action: wait
  waitFor:
    type: selectorHidden
    value: ".skeleton-loader"

# Now interact with loaded content
- action: click
  target:
    type: selector
    selector: "[data-testid='data-row-1']"
```

### Form Inputs
```yaml
# Input with label
target:
  type: selector
  selector: "label:has-text('Email') >> input"

# Input by placeholder
target:
  type: selector
  selector: "[placeholder='Enter email address']"
```

## Debugging Selectors

Run the demo in headed mode to verify selectors:

```bash
sceneforge record --definition demo.yaml --headed
```

Use browser DevTools to:
1. Inspect element attributes
2. Test selectors in console: `document.querySelector('[data-testid="x"]')`
3. Check for unique identifiers

## Selector Stability Tips

1. **Request data-testid**: Ask developers to add test IDs
2. **Use aria-labels**: Good for accessibility anyway
3. **Avoid CSS classes**: Often change with styling updates
4. **Avoid deep nesting**: Use direct selectors when possible
5. **Test after UI changes**: Re-verify selectors periodically

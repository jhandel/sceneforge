# Skill: Debug Selector

Help diagnose and fix selector issues in SceneForge demo actions.

## Task

Analyze a failing selector and provide working alternatives.

## Input Required

Provide the following:
- **Current selector**: The selector that's not working
- **Target element description**: What element you're trying to select
- **Error message**: Error from Playwright (if available)
- **Page context**: What page/feature contains the element

## Debugging Process

### Step 1: Identify the Problem

Common selector issues:
- **Element not found**: Selector doesn't match anything
- **Multiple matches**: Selector is too broad
- **Timing issue**: Element not ready when selector runs
- **Dynamic content**: Element changes between loads

### Step 2: Analyze Current Selector

Evaluate the selector:
- Is it using stable attributes?
- Is it too specific or too broad?
- Does it depend on DOM structure?

### Step 3: Provide Alternatives

Generate multiple alternatives ordered by reliability.

## Output Format

```markdown
## Selector Debug Report

### Current Selector
`[selector]`

### Problem Analysis
[Description of why it's failing]

### Alternative Selectors (Best to Worst)

1. **Best: data-testid**
   ```yaml
   selector: "[data-testid='element-id']"
   ```
   Stability: High | Reason: Direct test identifier

2. **Good: aria-label**
   ```yaml
   selector: "[aria-label='Button description']"
   ```
   Stability: Good | Reason: Accessibility attribute

3. **Acceptable: role + text**
   ```yaml
   selector: "button:has-text('Click Me')"
   ```
   Stability: Medium | Reason: Text may change

### Recommended Wait Condition
[If timing is the issue]

### Implementation
[Complete YAML action with recommended selector]
```

## Common Issues and Solutions

### Issue: Element Not Found

**Cause**: Selector doesn't match element attributes

**Solution**: Inspect element in DevTools and find stable attributes

```yaml
# Instead of
selector: ".btn-submit"

# Use
selector: "[data-testid='submit-form']"
# or
selector: "button:has-text('Submit')"
```

### Issue: Multiple Elements Match

**Cause**: Selector too broad

**Solution**: Add context or use more specific selector

```yaml
# Instead of
selector: "button"

# Use
selector: ".modal-dialog >> button:has-text('Confirm')"
# or
selector: "[data-testid='modal-confirm-btn']"
```

### Issue: Timing/Race Condition

**Cause**: Element not yet in DOM when selector runs

**Solution**: Add wait condition before action

```yaml
# Add wait before the problematic action
- action: wait
  waitFor:
    type: selector
    value: ".content-loaded"
    timeout: 10000

- action: click
  target:
    type: selector
    selector: "[data-testid='element']"
```

### Issue: Dynamic ID/Classes

**Cause**: IDs like `element-abc123` change on each load

**Solution**: Use attribute starts-with or contains

```yaml
# Instead of
selector: "#user-abc123"

# Use
selector: "[id^='user-']"
# or find a stable attribute
selector: "[data-user-id]"
```

### Issue: Element Inside Shadow DOM

**Cause**: Element in web component shadow root

**Solution**: Use Playwright's pierce selector

```yaml
selector: "pierce/#shadow-element"
```

### Issue: Element in iframe

**Cause**: Element inside frame

**Solution**: Handle frames in Playwright

```yaml
# Note: May require code changes
# Consider if action can be restructured
selector: "iframe[name='frame'] >> [data-testid='element']"
```

## Selector Testing Commands

Test selectors in browser DevTools:

```javascript
// Test CSS selector
document.querySelector('[data-testid="element"]')

// Test multiple matches
document.querySelectorAll('button').length

// Test Playwright-style selector (conceptual)
// button:has-text('Submit')
Array.from(document.querySelectorAll('button'))
  .filter(b => b.textContent.includes('Submit'))
```

## Checklist

- [ ] Element exists in DOM (check DevTools)
- [ ] Selector syntax is valid
- [ ] No typos in attribute names/values
- [ ] Element is visible (not display:none)
- [ ] Element is not inside iframe
- [ ] Timing is adequate (add wait if needed)
- [ ] Selected correct element (not duplicate)

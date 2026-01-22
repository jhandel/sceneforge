# Skill: Generate Demo Actions

Generate SceneForge demo actions for a web page or workflow.

## Task

Create a complete set of demo actions for the specified page or user workflow.

## Input Required

Provide the following information:
- **Page URL or description**: What page/feature are we demoing?
- **User goal**: What should the user accomplish?
- **Key interactions**: What elements will be clicked/typed?
- **Expected outcome**: What happens when the workflow completes?

## Output Format

Generate a YAML steps array with:
- Logical step groupings
- Descriptive step IDs
- Empty script fields (to be filled later)
- Reliable selectors
- Appropriate wait conditions

## Process

1. **Analyze the workflow**: Break into logical steps
2. **Identify elements**: Determine selectors for each interaction
3. **Add wait conditions**: Ensure stability between actions
4. **Structure output**: Create valid YAML

## Example Output

```yaml
steps:
  - id: navigate-to-form
    script: ""
    actions:
      - action: navigate
        path: /contact
        waitFor:
          type: idle

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
        text: "I'm interested in learning more about your services."

  - id: submit-form
    script: ""
    actions:
      - action: click
        target:
          type: button
          text: "Send Message"
        highlight: true
        waitFor:
          type: text
          value: "Thank you"
```

## Selector Guidelines

Use this priority when choosing selectors:
1. `[data-testid="..."]` - Most reliable
2. `[aria-label="..."]` - Accessibility labels
3. `role=button[name="..."]` - Semantic roles
4. `input[name="..."]` - Form inputs by name
5. `button:has-text("...")` - Text fallback

## Checklist

Before finalizing, verify:
- [ ] All user interactions are captured
- [ ] Steps are logically grouped
- [ ] IDs are descriptive (kebab-case)
- [ ] Wait conditions prevent race conditions
- [ ] Selectors are as stable as possible
- [ ] YAML syntax is valid

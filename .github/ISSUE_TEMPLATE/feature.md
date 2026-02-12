---
name: Feature Request
about: ADW-compatible feature specification
title: '[FEATURE] '
labels: 'feature, adw-ready'
assignees: ''
---

## Feature Description
<!-- Describe the feature in detail -->

## User Story
As a **[type of user]**
I want to **[action/goal]**
So that **[benefit/value]**

## Problem Statement
<!-- What problem does this solve? -->

## Solution Overview
<!-- High-level approach to solving the problem -->

---

## ADW Configuration

### Command
```
/feature
```

### Agents
- **Plan**: Use `/ralph plan` with unlimited iterations
- **Build**: Use `/ralph build` with unlimited iterations
- **Test**: Use `/test` to run validation suite

### Database Impact
<!-- Check all that apply -->
- [ ] Creates new table(s)
- [ ] Modifies existing table(s)
- [ ] No database changes

### Affected Components
<!-- List files/directories that will be touched -->
- [ ] `api/*` - API endpoints
- [ ] `src/lib/*` - Utilities
- [ ] `src/services/*` - External services
- [ ] `src/types/*` - Type definitions
- [ ] `supabase/migrations/*` - Database schema

---

## Acceptance Criteria
<!-- List specific, measurable criteria -->
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Testing Requirements
<!-- Required tests for this feature -->

### Unit Tests
- [ ] Test case 1
- [ ] Test case 2

### E2E Tests
- [ ] E2E scenario 1
- [ ] E2E scenario 2

## Validation Commands
```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e
```

## Notes
<!-- Additional context, constraints, or considerations -->

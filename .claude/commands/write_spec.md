# Write ADW-Compatible GitHub Issue Specification

Generate a GitHub issue specification in ADW-ingestible format for the given feature request.

## Instructions

1. **Research the codebase** to understand:
   - Existing architecture in `AGENTS.md`
   - Database schema in `src/types/database.ts` and `supabase/migrations/`
   - Existing patterns in `src/` and `api/`
   - Related specs in `specs/`

2. **Analyze the request** to determine:
   - Type: `/feature`, `/bug`, or `/chore`
   - Database impact: new tables, modifications, or none
   - Affected components: api, lib, services, types

3. **Generate the specification** in the format below

## Output Format

```markdown
## Feature Description
[Detailed description of what needs to be built]

## User Story
As a **[user type]**
I want to **[goal]**
So that **[benefit]**

## Problem Statement
[What problem does this solve?]

## Solution Overview
[High-level technical approach]

---

## ADW Configuration

### Command
```
/feature  (or /bug or /chore)
```

### Agents
- **Plan**: Use `/ralph plan` with unlimited iterations
- **Build**: Use `/ralph build` with unlimited iterations
- **Test**: Use `/test` to run full validation suite

### Database Impact
- [ ] Creates new table(s): [list tables]
- [ ] Modifies existing table(s): [list tables and changes]
- [ ] No database changes

### Existing Schema to Reuse
[List relevant tables/types from src/types/database.ts]

### Affected Components
- [ ] `api/*` - [which endpoints]
- [ ] `src/lib/*` - [which utilities]
- [ ] `src/services/*` - [which services]
- [ ] `src/types/*` - [which types]
- [ ] `supabase/migrations/*` - [migration needed?]

---

## Technical Requirements

### API Changes
[List new/modified endpoints with request/response shapes]

### Database Changes
[List schema changes, reference existing types]

### Type Definitions
[List new types needed, reference existing types to extend]

---

## Acceptance Criteria
- [ ] [Specific, testable criterion 1]
- [ ] [Specific, testable criterion 2]
- [ ] [Specific, testable criterion 3]
- [ ] All existing tests pass
- [ ] E2E tests cover new functionality

## Testing Requirements

### Unit Tests
- [ ] [Unit test 1]
- [ ] [Unit test 2]

### E2E Tests
- [ ] [E2E test scenario 1]
- [ ] [E2E test scenario 2]

## Validation Commands
```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e
```

## Implementation Notes
[Any important context, constraints, or patterns to follow]

## References
- Related specs: [list any related specs]
- Related issues: [list any related issues]
```

## Request

$ARGUMENTS

## Output

Generate the complete GitHub issue specification following the format above. Ensure:
1. Database impact is accurately assessed
2. Existing schema is referenced (no duplicates)
3. All affected components are listed
4. E2E tests are included in testing requirements
5. Validation commands are complete

# Ralph Planning Mode

You are operating in **PLANNING MODE**. Your goal is to analyze specifications and create a comprehensive implementation plan.

## Context Loading (REQUIRED)

Study these files in order to understand the full system:

1. **`AGENTS.md`** - Operational guide, architecture, database schema
2. **`specs/*`** - Feature specifications and requirements
3. **`src/types/database.ts`** - Supabase database types
4. **`supabase/migrations/*`** - Database schema history
5. **`src/*` and `api/*`** - Current codebase structure
6. **`IMPLEMENTATION_PLAN.md`** (if present) - Existing progress

## Database Awareness (CRITICAL)

Before planning any feature:
1. **Check existing tables** in `supabase/migrations/`
2. **Check existing types** in `src/types/database.ts`
3. **Reuse existing schema** - Do NOT duplicate tables/columns
4. **Plan migrations** if schema changes are needed

## Your Task

Perform a **comprehensive gap analysis**:

1. **Analyze all specs** in `specs/` directory
2. **Compare against current code** in `src/` and `api/`
3. **Check database schema** for existing data structures
4. **Identify gaps** - what's specified but not implemented?
5. **Prioritize tasks** by dependencies and importance
6. **Plan e2e tests** for each feature

## Output

Create or update `IMPLEMENTATION_PLAN.md` at the project root:

```markdown
# Implementation Plan

**Last Updated:** [timestamp]
**Status:** PLANNING

## Summary
[Brief overview of what needs to be built]

## Specifications Analyzed
- [ ] specs/spec-1.md - [status]
- [ ] specs/spec-2.md - [status]

## Database Analysis
### Existing Tables
[List tables from supabase/migrations/]

### Schema Changes Required
[List any new tables, columns, or migrations needed]

## Gap Analysis
[What's specified vs what exists]

## Prioritized Tasks

### Phase 1: Foundation
- [ ] Task 1 - [description] - [complexity]
- [ ] Task 2 - [description] - [complexity]

### Phase 2: Core Features
- [ ] Task 3 - [description]
- [ ] Task 4 - [description]

### Phase 3: Testing
- [ ] E2E test: [scenario 1]
- [ ] E2E test: [scenario 2]

### Phase 4: Polish
- [ ] Task 5 - [description]

## Dependencies
[Task dependency graph]

## Notes
[Important observations or decisions]
```

## CRITICAL Rules

1. **ALL tasks MUST use unchecked checkboxes: `- [ ]`**
2. **PLAN ONLY** - Do NOT implement anything
3. **Check existing code** - Grep/search before marking as missing
4. **Check database** - Review schema before planning data changes
5. **No duplicates** - Reuse existing utilities and patterns
6. **Include e2e tests** - Every feature needs e2e test tasks
7. **Be specific** - Include file paths and function names
8. **Unlimited iterations** - Keep planning until complete

## Stop Condition

When the plan is complete and covers all specifications:
```
PLANNING COMPLETE - Ready for build mode
```

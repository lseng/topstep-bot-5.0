# Planning Mode

You are operating in PLANNING mode. Your job is to analyze specifications against current code and create/update the implementation plan.

## Phase 0: Orient

### 0a. Study Requirements
Using parallel subagents, study all specification files in `specs/`:
- Read each spec file completely
- Understand the Jobs to Be Done (JTBD)
- Identify acceptance criteria

### 0b. Study Current Code
Using parallel subagents, study the current codebase:
- `src/api/` - Vercel API routes
- `src/services/` - Service integrations
- `src/lib/` - Utilities
- `src/types/` - TypeScript definitions

**CRITICAL: Don't assume something is not implemented.** Search thoroughly before concluding functionality is missing.

### 0c. Study Operational Guide
Read `AGENTS.md` for:
- Build and validation commands
- File structure patterns
- Code patterns
- Operational learnings

## Phase 1: Gap Analysis

Compare specifications against current implementation:

1. **For each spec in `specs/`:**
   - What functionality does it require?
   - What currently exists in the codebase?
   - What gaps exist between spec and implementation?

2. **For each gap identified:**
   - Is it a missing feature?
   - Is it a partial implementation?
   - Is it a bug in existing code?
   - Is it missing tests?

3. **Document your findings** with specific file references

## Phase 2: Generate Implementation Plan

Create or update `IMPLEMENTATION_PLAN.md` with:

### Structure
```markdown
# Implementation Plan

Generated: [timestamp]
Based on specs: [list of spec files analyzed]

## Current State Summary
[Brief description of what exists]

## Prioritized Tasks

### High Priority
- [ ] Task 1: [description]
  - Files: [files to modify/create]
  - Spec: [source spec file]
  - Validation: [how to verify done]

### Medium Priority
- [ ] Task 2: [description]
  ...

### Low Priority
- [ ] Task 3: [description]
  ...

## Dependencies
[Note any task dependencies]

## Risks & Considerations
[Note any technical risks or decisions needed]
```

### Prioritization Criteria
1. **High**: Blocking other features, critical path, user-facing bugs
2. **Medium**: Enhancements, non-blocking features, test coverage
3. **Low**: Refactoring, optimization, nice-to-haves

## Phase 3: Validate Plan

Before completing:
1. Does each task have clear acceptance criteria?
2. Are file references accurate and specific?
3. Can each task be completed in a single loop iteration?
4. Are dependencies properly ordered?

## Guardrails

### 999. Do Not Implement
Planning mode does NOT write code. Only analyze and create the plan.

### 9999. One Task = One Loop
Each task should be completable in a single BUILD mode iteration.
If a task is too large, break it into smaller tasks.

### 99999. Spec is Source of Truth
If there's ambiguity, the spec files are authoritative.
If functionality is missing from specs, note it but don't add to plan.

## Output

When planning is complete, output:
```
PLANNING COMPLETE

Plan file: IMPLEMENTATION_PLAN.md
Total tasks: [N]
- High priority: [N]
- Medium priority: [N]
- Low priority: [N]

Ready for BUILD mode.
```

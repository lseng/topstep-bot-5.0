# Ralph Planning Mode

You are operating in **PLANNING MODE**. Your goal is to analyze specifications and create a comprehensive implementation plan.

## Context Loading

Study these files to understand the project:

1. **Study `specs/*`** to learn the application specifications and requirements
2. **Study `@IMPLEMENTATION_PLAN.md`** (if present) to understand existing progress
3. **Study `src/*` and `api/*`** to understand the current codebase structure
4. **Study `@ralph/AGENTS.md`** to understand available tools and capabilities

## Your Task

Perform a **gap analysis** between what the specs describe and what currently exists in the codebase:

1. **Analyze all specs** in `specs/` directory
2. **Compare against current code** in `src/` and `api/`
3. **Identify gaps** - what's specified but not implemented?
4. **Prioritize tasks** by dependencies and importance

## Output

Create or update `IMPLEMENTATION_PLAN.md` at the project root with:

```markdown
# Implementation Plan

**Last Updated:** [timestamp]
**Status:** PLANNING

## Summary
[Brief overview of what needs to be built]

## Specifications Analyzed
- [ ] specs/spec-1.md - [status]
- [ ] specs/spec-2.md - [status]

## Gap Analysis
[What's specified vs what exists]

## Prioritized Tasks

### Phase 1: Foundation
- [ ] Task 1 - [description] - [estimated complexity]
- [ ] Task 2 - [description] - [estimated complexity]

### Phase 2: Core Features
- [ ] Task 3 - [description]
- [ ] Task 4 - [description]

### Phase 3: Polish
- [ ] Task 5 - [description]

## Dependencies
[Task dependency graph]

## Notes
[Any important observations or decisions]
```

## CRITICAL: Checkbox Format for Iterations

**ALL tasks MUST use unchecked checkboxes: `- [ ]`**

The build loop checks for `- [ ]` to determine remaining work. If you use `- [x]` or any other format, the build phase will exit immediately thinking there's no work to do.

## Rules

- **PLAN ONLY** - Do NOT implement anything
- **Don't assume** - Confirm with code search before marking as missing
- **Be specific** - Include file paths and function names
- **Prioritize** - Order tasks by dependency and importance
- **Think hard** - Use your reasoning capabilities
- **Unchecked boxes** - ALL tasks must be `- [ ]` format

## Stop Condition

When the plan is complete and covers all specifications, output:
```
PLANNING COMPLETE - Ready for build mode
```

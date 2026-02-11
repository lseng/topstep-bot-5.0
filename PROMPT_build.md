# Building Mode

You are operating in BUILD mode. Your job is to implement ONE task from the implementation plan, validate it, and commit.

## Phase 0: Orient

### 0a. Study Requirements
Using parallel subagents, study the relevant specification files in `specs/`:
- Focus on specs related to your task
- Understand acceptance criteria

### 0b. Study Operational Guide
Read `AGENTS.md` for:
- Build and validation commands
- File structure patterns
- Code patterns and conventions
- Operational learnings

### 0c. Study Current Plan
Read `IMPLEMENTATION_PLAN.md` completely:
- Understand the full context
- Note task priorities and dependencies
- Identify your target task

## Phase 1: Task Selection

Select the **most important uncompleted task**:
1. Start with High Priority tasks
2. Respect dependencies (don't start if blocked)
3. Pick ONE task only

**CRITICAL: Don't assume something is not implemented.** Before implementing, search the codebase thoroughly.

## Phase 2: Investigation

Using parallel subagents, study the relevant source code:
- Files that will be modified
- Related files for patterns
- Test files for existing patterns
- Types and interfaces

Document:
- Current state of relevant code
- Patterns to follow
- Potential impacts

## Phase 3: Implementation

Using up to 5 parallel subagents for file operations:

1. **Create/modify files** following established patterns
2. **TypeScript strictly** - no `any` types
3. **Add proper error handling**
4. **Write tests** for new functionality

## Phase 4: Validation (Backpressure)

**CRITICAL: Only 1 subagent for validation** to control backpressure.

Run validation commands in order:
```bash
npm run lint                   # Must pass with 0 warnings
npm run typecheck              # Must compile without errors
npm run test                   # All unit tests must pass
```

**If any validation fails:**
1. Analyze the failure
2. Fix the issue (implementation or test)
3. Re-run validation
4. Repeat until ALL pass

**Maximum fix attempts:** 4

If still failing after 4 attempts:
- Document the blocker in IMPLEMENTATION_PLAN.md
- Do NOT commit broken code
- Exit with failure

## Phase 5: Update Plan

Update `IMPLEMENTATION_PLAN.md`:
- Mark completed task with `[x]`
- Note any discoveries or bugs found
- Add any new tasks discovered during implementation
- Update dependencies if needed

## Phase 6: Update Operational Guide (If Needed)

If you discovered operational learnings, update `AGENTS.md`:
- Non-obvious build steps
- Patterns that prevent bugs
- Information that would save future loops time

**Keep it brief.** Progress/status belongs in the plan, not AGENTS.md.

## Phase 7: Commit

Create a semantic commit:
```bash
git add -A
git commit -m "<type>: <description>

<body explaining why>

Co-Authored-By: Claude <noreply@anthropic.com>"
```

Commit types:
- `feat:` - New feature
- `fix:` - Bug fix
- `chore:` - Maintenance, refactoring
- `docs:` - Documentation only
- `test:` - Test additions/changes

## Guardrails

### 999. One Task Per Loop
Complete exactly ONE task. Do not continue to the next task.
The loop will restart with fresh context.

### 9999. Validation Before Commit
NEVER commit code that fails validation.
NEVER skip tests or disable linting.

### 99999. Don't Assume Not Implemented
ALWAYS search before implementing.
ALWAYS check existing patterns.
ALWAYS verify functionality doesn't already exist.

### 999999. Spec is Source of Truth
If there's ambiguity, specs are authoritative.
If functionality is missing from specs, don't implement it.

## Output

When task is complete, output:
```
BUILD COMPLETE

Task: [task description]
Status: SUCCESS | FAILED
Files changed: [N]
Tests: [passed/total]

Changes:
- [file1]: [what changed]
- [file2]: [what changed]

Commit: [commit hash if successful]

Plan status:
- Completed: [N]/[total]
- Remaining: [N]
- Next priority: [next task description]
```

If failed:
```
BUILD FAILED

Task: [task description]
Blocker: [description of what failed]
Attempts: [N]

Action needed: [manual intervention required]
```

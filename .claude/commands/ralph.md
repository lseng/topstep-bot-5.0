# Ralph Workflow Command

Execute tasks using the Ralph-style iterative loop approach. This command implements the hybrid Ralph + TAC-7 methodology for autonomous AI-driven development.

## Input
$ARGUMENTS - Task description or mode specification

## Modes

### Planning Mode
Analyze specs and create/update IMPLEMENTATION_PLAN.md:
```
/ralph plan
```

### Building Mode
Execute tasks from the implementation plan:
```
/ralph build
```

### Single Task Mode
Execute a specific task without the loop:
```
/ralph task "Add webhook endpoint"
```

## Workflow

### Planning Phase (when mode = "plan")
1. **Orient** - Study all specs in `specs/` using parallel subagents
2. **Analyze** - Compare specs against current implementation
3. **Gap Analysis** - Identify missing features, partial implementations, bugs
4. **Generate Plan** - Create/update IMPLEMENTATION_PLAN.md with prioritized tasks
5. **Validate** - Ensure each task is atomic and completable in one iteration

### Building Phase (when mode = "build")
1. **Orient** - Study AGENTS.md and relevant specs
2. **Read Plan** - Study IMPLEMENTATION_PLAN.md completely
3. **Select Task** - Pick the most important uncompleted task
4. **Investigate** - Study relevant source code (don't assume not implemented!)
5. **Implement** - Make changes following established patterns
6. **Validate** - Run lint, typecheck, tests (backpressure)
7. **Update Plan** - Mark task complete, note discoveries
8. **Commit** - Create semantic commit with changes

## Key Principles

### Context Management (Ralph)
- Keep tasks atomic - one task per iteration
- Fresh context each loop - prevents pollution
- Use subagents for parallel exploration
- Target 40-60% context utilization

### Backpressure (Ralph + TAC-7)
Run validation in order:
```bash
npm run lint      # Must pass with 0 warnings
npm run typecheck # Must compile without errors
npm run test      # All tests must pass
```

If validation fails:
1. Analyze the failure
2. Fix the issue
3. Re-validate
4. Max 4 attempts before flagging

### Don't Assume Not Implemented
**CRITICAL**: Before implementing any feature:
1. Search the codebase thoroughly
2. Check existing patterns
3. Verify functionality doesn't exist
4. Only then implement

### Operational Learnings
Update AGENTS.md when you discover:
- Non-obvious build steps
- Patterns that prevent bugs
- Information that saves future loops time

## File Structure

```
project-root/
├── AGENTS.md              # Operational guide (brief, ~60 lines)
├── IMPLEMENTATION_PLAN.md # Prioritized task list (generated)
├── PROMPT_plan.md         # Planning mode instructions
├── PROMPT_build.md        # Building mode instructions
├── loop.sh                # Loop orchestration script
└── specs/                 # Requirement specifications
    └── *.md               # One file per topic of concern
```

## Output Format

### Planning Complete
```
PLANNING COMPLETE

Plan file: IMPLEMENTATION_PLAN.md
Total tasks: [N]
- High priority: [N]
- Medium priority: [N]
- Low priority: [N]

Ready for BUILD mode.
```

### Building Complete
```
BUILD COMPLETE

Task: [task description]
Status: SUCCESS
Files changed: [N]
Tests: [passed/total]

Changes:
- [file1]: [what changed]

Commit: [hash]

Plan status:
- Completed: [N]/[total]
- Remaining: [N]
```

## Examples

### Run planning phase
```
/ralph plan
```

### Run building phase
```
/ralph build
```

### Execute single task
```
/ralph task "Fix webhook authentication"
```

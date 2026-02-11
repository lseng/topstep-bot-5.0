# Ralph Building Mode

You are operating in **BUILDING MODE**. Your goal is to implement the next task from the implementation plan.

## Context Loading

Study these files to understand what to build:

1. **Study `@IMPLEMENTATION_PLAN.md`** to find the next uncompleted task
2. **Study `specs/*`** to understand the detailed requirements
3. **Study `src/*` and `api/*`** to understand existing code patterns
4. **Study `@ralph/AGENTS.md`** to understand available tools

## Your Task

1. **Find the next uncompleted task** in `IMPLEMENTATION_PLAN.md`
   - Look for `- [ ]` unchecked items
   - Pick the first one that has all dependencies met

2. **Implement the task**
   - Follow existing code patterns and conventions
   - Write clean, maintainable code
   - Include necessary error handling

3. **Test against backpressure**
   - Run `npm run validate` (lint + typecheck + test)
   - Fix any issues before proceeding

4. **Commit your changes**
   - Stage all related files
   - Write a clear commit message: `feat|fix|chore: description`
   - Include `Co-Authored-By: Ralph <ralph@ai.agent>` in commit

5. **Update the plan**
   - Mark the completed task as done: `- [x]`
   - Add any discoveries or notes

## Backpressure Loop

If tests or linting fail:
1. Read the error output carefully
2. Fix the issues
3. Run tests again
4. Repeat until passing
5. Only then proceed to commit

## Commit Format

```
<type>: <short description>

<detailed description if needed>

Co-Authored-By: Ralph <ralph@ai.agent>
```

Types: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`

## Rules

- **One task per iteration** - Complete one task fully before moving on
- **Quality over speed** - Ensure tests pass before committing
- **Update the plan** - Mark tasks complete: `- [ ]` -> `- [x]`
- **Follow patterns** - Match existing code style
- **Think hard** - Use your reasoning capabilities

## Stop Condition

When the current task is complete (implemented, tested, committed, plan updated), output:
```
TASK COMPLETE - [task description]
```

If all tasks are done:
```
BUILD COMPLETE - All tasks implemented
```

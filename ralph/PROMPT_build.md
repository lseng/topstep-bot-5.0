# Ralph Building Mode

You are operating in **BUILDING MODE**. Your goal is to implement tasks from the implementation plan until ALL tasks are complete.

## Context Loading (REQUIRED)

Study these files before implementing:

1. **`AGENTS.md`** - Architecture, database schema, patterns
2. **`IMPLEMENTATION_PLAN.md`** - Tasks to implement
3. **`specs/*`** - Detailed requirements
4. **`src/types/database.ts`** - Database types
5. **`src/*` and `api/*`** - Existing code patterns

## Database Awareness (CRITICAL)

Before implementing any data operations:
1. **Check `src/types/database.ts`** for existing types
2. **Check `supabase/migrations/*`** for existing schema
3. **Reuse existing schema** - Do NOT create duplicate tables
4. **Create migrations** if schema changes are needed
5. **Update types** when modifying schema

### Direct Database Operations
Execute SQL directly - NEVER ask users to run SQL manually:
```bash
# Execute SQL
./scripts/supabase-sql.sh "SELECT * FROM alerts LIMIT 5"

# Push migrations
export SUPABASE_ACCESS_TOKEN=$(grep SUPABASE_ACCESS_TOKEN .env.local | cut -d= -f2)
supabase db push
```

## Your Task

1. **Find the next uncompleted task** in `IMPLEMENTATION_PLAN.md`
   - Look for `- [ ]` unchecked items
   - Pick the first one with all dependencies met

2. **Search before implementing**
   - Grep/search for existing implementations
   - Check if similar code exists
   - Reuse utilities and patterns

3. **Implement the task**
   - Follow existing code patterns
   - Self-contained API functions (no src/ imports in api/)
   - Use existing Supabase schema when possible

4. **Run backpressure**
   ```bash
   npm run lint
   npm run typecheck
   npm run test
   npm run test:e2e  # if e2e tests exist
   ```
   - Fix ALL issues before proceeding
   - Repeat until passing

5. **Commit your changes**
   - Stage specific files (not `git add .`)
   - Clear commit message
   - Include `Co-Authored-By: Ralph <ralph@ai.agent>`

6. **Update the plan**
   - Mark completed: `- [ ]` → `- [x]`
   - Add discoveries/notes

## Backpressure Loop

If validation fails:
1. Read the error carefully
2. Fix the issue
3. Run validation again
4. Repeat until ALL checks pass
5. Maximum 10 fix attempts per issue
6. Then proceed to commit

## E2E Tests

When implementing e2e test tasks:
1. Create test files in `tests/e2e/`
2. Test real API endpoints
3. Test database operations
4. Cover happy path and error cases

## CRITICAL Rules

1. **No duplicates** - Search before creating new code
2. **Reuse schema** - Use existing database tables/types
3. **Self-contained API** - Don't import src/ in api/ files
4. **Quality over speed** - All tests must pass
5. **One task per iteration** - Complete fully before moving on
6. **Unlimited iterations** - Keep building until all tasks complete

## Commit Format

```
<type>: <short description>

<detailed description if needed>

Co-Authored-By: Ralph <ralph@ai.agent>
```

Types: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`

## Stop Condition

After completing a task:
```
TASK COMPLETE - [task description]
```

When ALL tasks are done (no more `- [ ]` in plan):
```
BUILD COMPLETE - All tasks implemented
```

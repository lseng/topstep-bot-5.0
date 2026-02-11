# Application Validation Test Suite

Execute comprehensive validation tests for the TopstepX Trading Bot, returning results in a standardized JSON format for automated processing.

## Purpose

Proactively identify and fix issues in the application before they impact users or developers. By running this comprehensive test suite, you can:
- Detect syntax errors, type mismatches, and import failures
- Identify broken tests or security vulnerabilities
- Verify build processes and dependencies
- Ensure the application is in a healthy state

## Variables

TEST_COMMAND_TIMEOUT: 5 minutes

## Instructions

- Execute each test in the sequence provided below
- Capture the result (passed/failed) and any error messages
- IMPORTANT: Return ONLY the JSON array with test results
  - IMPORTANT: Do not include any additional text, explanations, or markdown formatting
  - We'll immediately run JSON.parse() on the output, so make sure it's valid JSON
- If a test passes, omit the error field
- If a test fails, include the error message in the error field
- Execute all tests even if some fail
- Error Handling:
  - If a command returns non-zero exit code, mark as failed and immediately stop processing tests
  - Capture stderr output for error field
  - Timeout commands after `TEST_COMMAND_TIMEOUT`
  - IMPORTANT: If a test fails, stop processing tests and return the results thus far
- All file paths are relative to the project root
- Always run `pwd` and `cd` before each test to ensure you're operating in the correct directory for the given test

## Test Execution Sequence

**NOTE**: For ADW trees, dependencies may not be installed. Run `npm install` first if node_modules is missing.

1. **Project Structure Check**
   - Preparation Command: None
   - Command: `test -d src && test -d api && test -f package.json && echo "OK" || echo "FAIL"`
   - test_name: "project_structure"
   - test_purpose: "Validates that the project has the expected structure with src/, api/, and package.json"

2. **TypeScript Type Check** (Skip if node_modules incomplete)
   - Preparation Command: None
   - Command: `npm run typecheck`
   - test_name: "typescript_check"
   - test_purpose: "Validates TypeScript type correctness, catching type errors, missing imports, and incorrect function signatures"

3. **Code Quality Check** (Skip if node_modules incomplete)
   - Preparation Command: None
   - Command: `npm run lint`
   - test_name: "linting"
   - test_purpose: "Validates code quality with zero warnings policy, identifies unused imports and style violations"

4. **Unit Tests** (Skip if node_modules incomplete)
   - Preparation Command: None
   - Command: `npm run test`
   - test_name: "unit_tests"
   - test_purpose: "Validates all functionality including services, utilities, and API endpoints"

## Report

- IMPORTANT: Return results exclusively as a JSON array based on the `Output Structure` section below.
- Sort the JSON array with failed tests (passed: false) at the top
- Include all tests in the output, both passed and failed
- The execution_command field should contain the exact command that can be run to reproduce the test
- This allows subsequent agents to quickly identify and resolve errors

### Output Structure

```json
[
  {
    "test_name": "string",
    "passed": boolean,
    "execution_command": "string",
    "test_purpose": "string",
    "error": "optional string"
  },
  ...
]
```

### Example Output

```json
[
  {
    "test_name": "typescript_check",
    "passed": false,
    "execution_command": "npm run typecheck",
    "test_purpose": "Validates TypeScript type correctness, catching type errors, missing imports, and incorrect function signatures",
    "error": "TS2345: Argument of type 'string' is not assignable to parameter of type 'number'"
  },
  {
    "test_name": "project_structure",
    "passed": true,
    "execution_command": "test -d src && test -d api && test -f package.json && echo \"OK\" || echo \"FAIL\"",
    "test_purpose": "Validates that the project has the expected structure with src/, api/, and package.json"
  }
]
```

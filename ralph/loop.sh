#!/bin/bash
# Ralph Loop - Autonomous AI Coding Loop
#
# Usage: ./loop.sh [plan|build] [max_iterations]
#
# Modes:
#   plan  - Generate/update IMPLEMENTATION_PLAN.md (no commits)
#   build - Implement from plan, commit after each task
#
# Based on Geoff Huntley's Ralph methodology
# https://github.com/ClaytonFarr/ralph-playbook

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
MODE="${1:-build}"
MAX_ITERATIONS="${2:-10}"
ITERATION=0

# Validate mode
if [[ "$MODE" != "plan" && "$MODE" != "build" ]]; then
    echo "Error: Invalid mode '$MODE'. Use 'plan' or 'build'."
    exit 1
fi

# Select prompt file based on mode
PROMPT_FILE="$SCRIPT_DIR/PROMPT_${MODE}.md"
if [[ ! -f "$PROMPT_FILE" ]]; then
    echo "Error: Prompt file not found: $PROMPT_FILE"
    exit 1
fi

# Check for required files
AGENTS_FILE="$SCRIPT_DIR/AGENTS.md"
if [[ ! -f "$AGENTS_FILE" ]]; then
    echo "Error: AGENTS.md not found: $AGENTS_FILE"
    exit 1
fi

echo "======================================================================="
echo "  RALPH LOOP - Autonomous AI Coding"
echo "======================================================================="
echo "  Mode: $MODE"
if [[ $MAX_ITERATIONS -eq 0 ]]; then
    echo "  Max Iterations: unlimited"
else
    echo "  Max Iterations: $MAX_ITERATIONS"
fi
echo "  Project: $PROJECT_ROOT"
echo "======================================================================="
echo ""

# Function to check if there's more work to do
check_work_remaining() {
    local plan_file="$PROJECT_ROOT/IMPLEMENTATION_PLAN.md"

    if [[ "$MODE" == "plan" ]]; then
        # In planning mode, check if specs exist
        if ls "$PROJECT_ROOT/specs/"*.md 1>/dev/null 2>&1; then
            # If no plan exists, there's work to do
            if [[ ! -f "$plan_file" ]]; then
                return 0
            fi
            # If any spec is newer than the plan, there's work to do
            for spec in "$PROJECT_ROOT/specs/"*.md; do
                if [[ "$spec" -nt "$plan_file" ]]; then
                    return 0
                fi
            done
        fi
        return 1  # No work
    fi

    if [[ "$MODE" == "build" ]]; then
        # In build mode, check for uncompleted tasks in plan
        if [[ -f "$plan_file" ]]; then
            # Check for unchecked checkboxes or TODO items
            if grep -qE "^\s*-\s*\[\s*\]|^- TODO:" "$plan_file" 2>/dev/null; then
                return 0  # Work to do
            fi
        fi
        return 1  # No work
    fi
}

# Function to run one iteration
run_iteration() {
    local iteration_num=$1

    echo ""
    echo "-------------------------------------------------------------------"
    if [[ $MAX_ITERATIONS -eq 0 ]]; then
        echo "  Iteration $iteration_num (unlimited)"
    else
        echo "  Iteration $iteration_num / $MAX_ITERATIONS"
    fi
    echo "-------------------------------------------------------------------"
    echo ""

    # Read the prompt file
    local prompt
    prompt=$(cat "$PROMPT_FILE")

    # Execute Claude with the prompt
    cd "$PROJECT_ROOT"

    if claude -p "$prompt" --model opus --dangerously-skip-permissions; then
        echo ""
        echo "Iteration $iteration_num completed successfully"

        # In build mode, push changes after successful iteration
        if [[ "$MODE" == "build" ]]; then
            if git diff --quiet && git diff --cached --quiet; then
                echo "No changes to commit"
            else
                echo "Pushing changes to remote..."
                git push origin HEAD 2>/dev/null || echo "Push failed or no remote configured"
            fi
        fi

        return 0
    else
        echo ""
        echo "Iteration $iteration_num failed"
        return 1
    fi
}

# Main loop
echo "Starting Ralph loop..."
echo ""

while [[ $MAX_ITERATIONS -eq 0 || $ITERATION -lt $MAX_ITERATIONS ]]; do
    ITERATION=$((ITERATION + 1))

    # Check if there's work remaining
    if ! check_work_remaining; then
        echo ""
        echo "No more work remaining. Loop complete!"
        break
    fi

    # Run one iteration
    if ! run_iteration $ITERATION; then
        echo ""
        echo "Iteration failed. Stopping loop."
        exit 1
    fi

    # Brief pause between iterations
    sleep 2
done

if [[ $MAX_ITERATIONS -ne 0 && $ITERATION -ge $MAX_ITERATIONS ]]; then
    echo ""
    echo "Reached maximum iterations ($MAX_ITERATIONS). Review and restart if needed."
fi

echo ""
echo "======================================================================="
echo "  RALPH LOOP COMPLETE"
echo "  Total Iterations: $ITERATION"
echo "======================================================================="

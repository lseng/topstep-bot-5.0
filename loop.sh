#!/bin/bash
#
# Ralph-style Loop Orchestration for TopstepX Trading Bot
#
# Usage:
#   ./loop.sh              # Build mode, unlimited iterations
#   ./loop.sh 10           # Build mode, max 10 iterations
#   ./loop.sh plan         # Plan mode, single iteration
#   ./loop.sh plan 3       # Plan mode, max 3 iterations
#   ./loop.sh --heavy      # Build mode with Opus model
#   ./loop.sh plan --heavy # Plan mode with Opus model
#
# Environment:
#   CLAUDE_CODE_PATH  - Optional, defaults to 'claude'
#
# Note: Uses Claude Code CLI which authenticates via your Claude subscription
#

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_PATH="${CLAUDE_CODE_PATH:-claude}"
DEFAULT_MODEL="sonnet"
HEAVY_MODEL="opus"
LOG_DIR="${SCRIPT_DIR}/agents/loop_logs"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
MODE="build"
MAX_ITERATIONS=0
MODEL="$DEFAULT_MODEL"
ITERATION=0

while [[ $# -gt 0 ]]; do
    case $1 in
        plan)
            MODE="plan"
            shift
            ;;
        --heavy)
            MODEL="$HEAVY_MODEL"
            shift
            ;;
        [0-9]*)
            MAX_ITERATIONS=$1
            shift
            ;;
        -h|--help)
            echo "Usage: ./loop.sh [plan] [iterations] [--heavy]"
            echo ""
            echo "Modes:"
            echo "  (default)  Build mode - implement tasks from IMPLEMENTATION_PLAN.md"
            echo "  plan       Plan mode - analyze specs and create/update plan"
            echo ""
            echo "Options:"
            echo "  [number]   Maximum iterations (0 = unlimited)"
            echo "  --heavy    Use Opus model for complex tasks"
            echo ""
            echo "Examples:"
            echo "  ./loop.sh              # Build, unlimited, Sonnet"
            echo "  ./loop.sh 5            # Build, max 5 iterations, Sonnet"
            echo "  ./loop.sh plan         # Plan, single iteration, Sonnet"
            echo "  ./loop.sh --heavy      # Build, unlimited, Opus"
            echo "  ./loop.sh plan --heavy # Plan, single iteration, Opus"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Set prompt file based on mode
if [[ "$MODE" == "plan" ]]; then
    PROMPT_FILE="${SCRIPT_DIR}/PROMPT_plan.md"
else
    PROMPT_FILE="${SCRIPT_DIR}/PROMPT_build.md"
fi

# Verify prompt file exists
if [[ ! -f "$PROMPT_FILE" ]]; then
    echo -e "${RED}Error: Prompt file not found: $PROMPT_FILE${NC}"
    exit 1
fi

# Create log directory
mkdir -p "$LOG_DIR"

# Generate session ID
SESSION_ID=$(date +%Y%m%d_%H%M%S)_$(openssl rand -hex 4)

MODE_DISPLAY=$(echo "$MODE" | tr '[:lower:]' '[:upper:]')
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           TopstepX Trading Bot - Ralph Loop               ║${NC}"
echo -e "${BLUE}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${BLUE}║${NC} Mode:       ${GREEN}${MODE_DISPLAY}${NC}"
echo -e "${BLUE}║${NC} Model:      ${GREEN}${MODEL}${NC}"
if [[ $MAX_ITERATIONS -eq 0 ]]; then
    MAX_ITER_DISPLAY="unlimited"
else
    MAX_ITER_DISPLAY="$MAX_ITERATIONS"
fi
echo -e "${BLUE}║${NC} Max Iter:   ${GREEN}${MAX_ITER_DISPLAY}${NC}"
echo -e "${BLUE}║${NC} Session:    ${GREEN}${SESSION_ID}${NC}"
echo -e "${BLUE}║${NC} Prompt:     ${GREEN}${PROMPT_FILE}${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Main loop
while true; do
    ITERATION=$((ITERATION + 1))
    LOG_FILE="${LOG_DIR}/${SESSION_ID}_iter${ITERATION}.jsonl"

    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    if [[ $MAX_ITERATIONS -gt 0 ]]; then
        echo -e "${YELLOW}  Iteration ${ITERATION} of ${MAX_ITERATIONS}${NC}"
    else
        echo -e "${YELLOW}  Iteration ${ITERATION}${NC}"
    fi
    echo -e "${YELLOW}  $(date '+%Y-%m-%d %H:%M:%S')${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Check iteration limit
    if [[ $MAX_ITERATIONS -gt 0 && $ITERATION -gt $MAX_ITERATIONS ]]; then
        echo -e "${GREEN}Maximum iterations ($MAX_ITERATIONS) reached.${NC}"
        break
    fi

    # Check for IMPLEMENTATION_PLAN.md completion in build mode
    if [[ "$MODE" == "build" && -f "${SCRIPT_DIR}/IMPLEMENTATION_PLAN.md" ]]; then
        # Count uncompleted tasks (lines with "- [ ]")
        REMAINING=$(grep -c '^\s*- \[ \]' "${SCRIPT_DIR}/IMPLEMENTATION_PLAN.md" 2>/dev/null || echo "0")
        if [[ "$REMAINING" -eq 0 ]]; then
            echo -e "${GREEN}All tasks completed! Plan is finished.${NC}"
            break
        fi
        echo -e "${BLUE}Remaining tasks: ${REMAINING}${NC}"
        echo ""
    fi

    # Execute Claude Code with the prompt
    echo -e "${BLUE}Executing Claude Code...${NC}"
    echo ""

    # Build command
    CMD=(
        "$CLAUDE_PATH"
        "-p" "$(cat "$PROMPT_FILE")"
        "--model" "$MODEL"
        "--output-format" "stream-json"
        "--verbose"
        "--dangerously-skip-permissions"
    )

    # Execute and capture output
    if "${CMD[@]}" > "$LOG_FILE" 2>&1; then
        echo ""
        echo -e "${GREEN}Iteration ${ITERATION} completed successfully.${NC}"

        # Extract result from JSONL
        RESULT=$(tail -1 "$LOG_FILE" | jq -r '.result // empty' 2>/dev/null || echo "")
        if [[ -n "$RESULT" ]]; then
            echo -e "${BLUE}Result:${NC}"
            echo "$RESULT" | head -20
        fi
    else
        EXIT_CODE=$?
        echo ""
        echo -e "${RED}Iteration ${ITERATION} failed with exit code ${EXIT_CODE}${NC}"

        # Check if we should continue or abort
        if [[ $EXIT_CODE -eq 130 ]]; then
            echo -e "${YELLOW}Interrupted by user (Ctrl+C)${NC}"
            break
        fi

        # In build mode, failures might be expected (test failures, etc.)
        # Continue unless we've hit too many consecutive failures
        if [[ "$MODE" == "plan" ]]; then
            echo -e "${RED}Planning failed. Check logs: ${LOG_FILE}${NC}"
            break
        fi
    fi

    echo ""
    echo -e "${BLUE}Log saved: ${LOG_FILE}${NC}"
    echo ""

    # Brief pause between iterations (allows Ctrl+C)
    sleep 2
done

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    Loop Complete                           ║${NC}"
echo -e "${GREEN}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║${NC} Total iterations: ${BLUE}${ITERATION}${NC}"
echo -e "${GREEN}║${NC} Session logs:     ${BLUE}${LOG_DIR}/${SESSION_ID}_*${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"

#!/usr/bin/env -S uv run
# /// script
# dependencies = ["python-dotenv", "pydantic", "boto3"]
# ///

"""
ADW Ralph Iso - Fully Automated Hybrid Workflow

Usage:
  uv run adw_ralph_iso.py <issue-number> [adw-id] [--plan-iterations N] [--build-iterations N] [--skip-tests] [--skip-review]

This fully automated hybrid workflow uses Claude Code CLI (Max plan credits):
1. ADW: Creates isolated worktree with feature branch
2. ADW: Converts GitHub issue to spec file
3. Ralph: Runs planning phase (./ralph/loop.sh plan) - multiple iterations to cover all bases
4. Ralph: Runs build loop (./ralph/loop.sh build)
5. ADW: Runs tests with resolution loop
6. If tests fail -> Re-run Ralph build (backpressure)
7. ADW: Runs review with screenshots
8. ADW: Creates PR and merges to main
9. ADW: Pulls changes to main repo (localhost hot-reloads)

No API key needed - uses Claude Code CLI which uses your Max plan credits.
"""

import sys
import os
import subprocess
import logging
import json
import shutil
from typing import Optional, Tuple, List
from dotenv import load_dotenv

# Add the parent directory to Python path to import modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from adw_modules.state import ADWState
from adw_modules.git_ops import commit_changes, finalize_git_operations, get_current_branch
from adw_modules.github import (
    fetch_issue,
    make_issue_comment,
    get_repo_url,
    extract_repo_path,
)
from adw_modules.workflow_ops import (
    classify_issue,
    generate_branch_name,
    format_issue_message,
    ensure_adw_id,
    find_spec_file,
)
from adw_modules.utils import setup_logger, parse_json, check_env_vars, check_required_tools
from adw_modules.data_types import (
    GitHubIssue,
    AgentTemplateRequest,
    TestResult,
    ReviewResult,
)
from adw_modules.agent import execute_template
from adw_modules.worktree_ops import (
    create_worktree,
    validate_worktree,
    get_ports_for_adw,
    is_port_available,
    find_next_available_ports,
    setup_worktree_environment,
)
from adw_modules.spec_generator import generate_spec_from_issue, clear_specs_directory
from adw_modules.r2_uploader import R2Uploader

# Constants
MAX_TEST_RETRY_ATTEMPTS = 3
MAX_BACKPRESSURE_LOOPS = 0  # 0 = unlimited, loop plan->build->test until all tests pass
DEFAULT_PLAN_ITERATIONS = 0  # 0 = unlimited, iterate until done
DEFAULT_BUILD_ITERATIONS = 0  # 0 = unlimited, iterate until done
AGENT_TESTER = "test_runner"
AGENT_REVIEWER = "reviewer"


def get_main_repo_root() -> str:
    """Get the main repository root directory (parent of adws)."""
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def copy_loop_script(worktree_path: str, logger: logging.Logger) -> Tuple[bool, Optional[str]]:
    """Ensure loop.sh exists in worktree and is executable."""
    loop_script = os.path.join(worktree_path, "ralph", "loop.sh")

    if not os.path.exists(loop_script):
        return False, f"ralph/loop.sh not found in worktree at {loop_script}"

    try:
        os.chmod(loop_script, 0o755)
        logger.info("Verified ralph/loop.sh is executable")
        return True, None
    except Exception as e:
        return False, f"Failed to make ralph/loop.sh executable: {e}"


def run_ralph_phase(
    phase: str,
    worktree_path: str,
    max_iterations: int,
    logger: logging.Logger,
) -> Tuple[bool, Optional[str]]:
    """Run a Ralph phase (plan or build) in the worktree."""
    loop_script = os.path.join(worktree_path, "ralph", "loop.sh")
    cmd = [loop_script, phase, str(max_iterations)]
    logger.info(f"Running Ralph {phase} phase: {' '.join(cmd)}")

    try:
        result = subprocess.run(
            cmd,
            cwd=worktree_path,
            capture_output=False,
            text=True,
        )

        if result.returncode != 0:
            return False, f"Ralph {phase} phase exited with code {result.returncode}"

        logger.info(f"Ralph {phase} phase completed successfully")
        return True, None

    except Exception as e:
        return False, f"Failed to run Ralph {phase} phase: {e}"


def run_tests(
    adw_id: str,
    logger: logging.Logger,
    working_dir: Optional[str] = None
) -> Tuple[List[TestResult], int, int]:
    """Run tests and return (results, passed_count, failed_count)."""
    test_request = AgentTemplateRequest(
        agent_name=AGENT_TESTER,
        slash_command="/test",
        args=[],
        adw_id=adw_id,
        working_dir=working_dir,
    )

    response = execute_template(test_request)

    if not response.success:
        logger.error(f"Test execution failed: {response.output}")
        return [], 0, 0

    try:
        results = parse_json(response.output, List[TestResult])
        passed_count = sum(1 for test in results if test.passed)
        failed_count = len(results) - passed_count
        return results, passed_count, failed_count
    except Exception as e:
        logger.error(f"Error parsing test results: {e}")
        return [], 0, 0


def find_screenshots_in_dir(review_img_dir: str, logger: logging.Logger) -> List[str]:
    """Find all PNG screenshots in the review image directory."""
    screenshots = []
    if os.path.exists(review_img_dir):
        for f in sorted(os.listdir(review_img_dir)):
            if f.endswith('.png'):
                screenshots.append(os.path.join(review_img_dir, f))
        logger.info(f"Found {len(screenshots)} screenshots in {review_img_dir}")
    return screenshots


def capture_screenshots(
    adw_id: str,
    port: str,
    worktree_path: str,
    logger: logging.Logger,
) -> List[str]:
    """Capture screenshots using the standalone script.

    The script will start the dev server if not running, capture screenshots,
    and stop the server if it started it.
    """
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    review_img_dir = os.path.join(project_root, "agents", adw_id, AGENT_REVIEWER, "review_img")
    capture_script = os.path.join(project_root, "adws", "capture_screenshots.py")

    os.makedirs(review_img_dir, exist_ok=True)
    logger.info(f"Capturing screenshots to {review_img_dir}")
    logger.info(f"Using worktree at: {worktree_path}")

    if not os.path.exists(capture_script):
        logger.info("Screenshot capture script not found, skipping screenshots")
        return find_screenshots_in_dir(review_img_dir, logger)

    try:
        result = subprocess.run(
            ["uv", "run", capture_script, review_img_dir, "--port", port, "--cwd", worktree_path],
            capture_output=True,
            text=True,
            timeout=180,  # 3 minutes to allow server startup
            cwd=project_root,
        )
        logger.info(f"Screenshot capture output: {result.stdout}")
        if result.returncode != 0:
            logger.warning(f"Screenshot capture failed: {result.stderr}")
    except Exception as e:
        logger.error(f"Error capturing screenshots: {e}")

    return find_screenshots_in_dir(review_img_dir, logger)


def run_review(
    spec_file: str,
    adw_id: str,
    logger: logging.Logger,
    working_dir: str,
) -> ReviewResult:
    """Run review and capture screenshots."""
    request = AgentTemplateRequest(
        agent_name=AGENT_REVIEWER,
        slash_command="/review",
        args=[adw_id, spec_file, AGENT_REVIEWER],
        adw_id=adw_id,
        working_dir=working_dir,
    )

    response = execute_template(request)

    # Expected screenshot directory
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    review_img_dir = os.path.join(project_root, "agents", adw_id, AGENT_REVIEWER, "review_img")

    if not response.success:
        # Even if review failed, try to find any screenshots that were captured
        screenshots = find_screenshots_in_dir(review_img_dir, logger)
        return ReviewResult(
            success=False,
            review_summary=f"Review failed: {response.output[:500]}",
            review_issues=[],
            screenshots=screenshots,
            screenshot_urls=[],
        )

    try:
        result = parse_json(response.output, ReviewResult)
        # If parsing succeeded but no screenshots in result, look for them manually
        if not result.screenshots:
            result.screenshots = find_screenshots_in_dir(review_img_dir, logger)
        return result
    except Exception as e:
        logger.error(f"Error parsing review result: {e}")
        logger.debug(f"Raw output: {response.output[:1000]}")
        # Try to find screenshots even if parsing failed
        screenshots = find_screenshots_in_dir(review_img_dir, logger)
        # Extract summary from output if possible
        summary = response.output[:500] if response.output else "Review completed but output parsing failed"
        return ReviewResult(
            success=True,  # Assume success if agent completed
            review_summary=summary,
            review_issues=[],
            screenshots=screenshots,
            screenshot_urls=[],
        )


def upload_screenshots(
    review_result: ReviewResult,
    adw_id: str,
    worktree_path: str,
    logger: logging.Logger,
) -> None:
    """Upload screenshots to R2 and update URLs in review_result."""
    if not review_result.screenshots:
        return

    logger.info(f"Uploading {len(review_result.screenshots)} screenshots")
    uploader = R2Uploader(logger)
    screenshot_urls = []

    for local_path in review_result.screenshots:
        abs_path = os.path.join(worktree_path, local_path) if not os.path.isabs(local_path) else local_path

        if not os.path.exists(abs_path):
            logger.warning(f"Screenshot not found: {abs_path}")
            continue

        remote_path = f"adw/{adw_id}/review/{os.path.basename(local_path)}"
        url = uploader.upload_file(abs_path, remote_path)

        if url:
            screenshot_urls.append(url)
            logger.info(f"Uploaded: {url}")
        else:
            screenshot_urls.append(local_path)

    review_result.screenshot_urls = screenshot_urls


def build_review_comment(review_result: ReviewResult) -> str:
    """Build formatted review comment with screenshots."""
    parts = [f"## Review Summary\n\n{review_result.review_summary}"]

    # Add review issues if any
    if review_result.review_issues:
        parts.append("\n## Review Issues\n")
        for issue in review_result.review_issues:
            severity = getattr(issue, "issue_severity", "unknown")
            description = getattr(issue, "issue_description", "No description")
            resolution = getattr(issue, "issue_resolution", "")
            severity_emoji = {"blocker": "🚫", "tech_debt": "⚠️", "skippable": "ℹ️"}.get(
                severity, "•"
            )
            parts.append(f"{severity_emoji} **{severity.upper()}**: {description}")
            if resolution:
                parts.append(f"   - Resolution: {resolution}")

    # Add screenshots
    if review_result.screenshot_urls:
        parts.append("\n## Screenshots\n")
        for i, url in enumerate(review_result.screenshot_urls):
            if url.startswith("http"):
                parts.append(f"### Screenshot {i+1}")
                parts.append(f"![Screenshot {i+1}]({url})\n")
            else:
                parts.append(f"- Screenshot {i+1}: `{url}` (upload failed)")
    elif review_result.screenshots:
        parts.append("\n## Screenshots\n")
        parts.append("_Screenshots were captured but could not be uploaded. Local paths:_")
        for path in review_result.screenshots:
            parts.append(f"- `{path}`")

    return "\n".join(parts)


def merge_to_main(branch_name: str, logger: logging.Logger) -> Tuple[bool, Optional[str]]:
    """Merge feature branch to main and push."""
    repo_root = get_main_repo_root()
    logger.info(f"Merging {branch_name} to main in {repo_root}")

    try:
        result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True, text=True, cwd=repo_root
        )
        original_branch = result.stdout.strip()

        subprocess.run(["git", "fetch", "origin"], cwd=repo_root, capture_output=True)

        result = subprocess.run(
            ["git", "checkout", "main"],
            capture_output=True, text=True, cwd=repo_root
        )
        if result.returncode != 0:
            return False, f"Failed to checkout main: {result.stderr}"

        result = subprocess.run(
            ["git", "pull", "origin", "main"],
            capture_output=True, text=True, cwd=repo_root
        )
        if result.returncode != 0:
            subprocess.run(["git", "checkout", original_branch], cwd=repo_root)
            return False, f"Failed to pull main: {result.stderr}"

        result = subprocess.run(
            ["git", "merge", branch_name, "--no-ff", "-m", f"Merge '{branch_name}' via ADW Ralph workflow"],
            capture_output=True, text=True, cwd=repo_root
        )
        if result.returncode != 0:
            stderr_lower = result.stderr.lower()
            is_conflict = "conflict" in stderr_lower or "automatic merge failed" in stderr_lower

            # Abort the failed local merge
            subprocess.run(["git", "merge", "--abort"], cwd=repo_root, capture_output=True)
            subprocess.run(["git", "checkout", original_branch], cwd=repo_root, capture_output=True)

            if is_conflict:
                # Retry via GitHub's merge API which can handle simple conflicts
                logger.info("Local merge failed with conflicts, attempting GitHub PR merge...")
                gh_result = subprocess.run(
                    ["gh", "pr", "merge", branch_name, "--merge",
                     "--subject", f"Merge '{branch_name}' via ADW Ralph workflow"],
                    capture_output=True, text=True, cwd=repo_root
                )
                if gh_result.returncode == 0:
                    # Pull the merged main locally
                    subprocess.run(["git", "checkout", "main"], cwd=repo_root, capture_output=True)
                    subprocess.run(["git", "pull", "origin", "main"], cwd=repo_root, capture_output=True)
                    logger.info("Merged via GitHub PR merge and pulled to local main")
                    return True, None

                logger.info("GitHub PR merge also failed, falling back to manual review")
                return False, f"Merge conflicts could not be auto-resolved: {result.stderr}"

            return False, f"Failed to merge: {result.stderr}"

        result = subprocess.run(
            ["git", "push", "origin", "main"],
            capture_output=True, text=True, cwd=repo_root
        )
        if result.returncode != 0:
            subprocess.run(["git", "checkout", original_branch], cwd=repo_root)
            return False, f"Failed to push: {result.stderr}"

        logger.info("Merged and pushed to main, staying on main branch")
        return True, None

    except Exception as e:
        return False, str(e)


def main():
    """Main entry point."""
    load_dotenv()

    # Validate environment and tools before starting
    check_env_vars()
    check_required_tools()

    if len(sys.argv) < 2:
        print("Usage: uv run adw_ralph_iso.py <issue-number> [adw-id] [--plan-iterations N] [--build-iterations N] [--skip-tests] [--skip-review]")
        sys.exit(1)

    issue_number = sys.argv[1]
    adw_id = None
    plan_iterations = DEFAULT_PLAN_ITERATIONS
    build_iterations = DEFAULT_BUILD_ITERATIONS
    skip_tests = "--skip-tests" in sys.argv
    skip_review = "--skip-review" in sys.argv

    args = [a for a in sys.argv[2:] if not a.startswith("--")]
    if args:
        adw_id = args[0]

    for i, arg in enumerate(sys.argv):
        if arg == "--plan-iterations" and i + 1 < len(sys.argv):
            plan_iterations = int(sys.argv[i + 1])
        if arg == "--build-iterations" and i + 1 < len(sys.argv):
            build_iterations = int(sys.argv[i + 1])
        # Legacy support for --max-iterations (maps to build)
        if arg == "--max-iterations" and i + 1 < len(sys.argv):
            build_iterations = int(sys.argv[i + 1])

    temp_logger = setup_logger(adw_id, "adw_ralph_iso") if adw_id else None
    adw_id = ensure_adw_id(issue_number, adw_id, temp_logger)
    state = ADWState.load(adw_id, temp_logger)

    if not state:
        state = ADWState(adw_id)

    if not state.get("adw_id"):
        state.update(adw_id=adw_id)

    state.append_adw_id("adw_ralph_iso")
    logger = setup_logger(adw_id, "adw_ralph_iso")
    logger.info(f"ADW Ralph Iso starting - ID: {adw_id}, Issue: {issue_number}")
    logger.info(f"Iterations - Plan: {plan_iterations}, Build: {build_iterations}")

    # Get repo info
    try:
        github_repo_url = get_repo_url()
        repo_path = extract_repo_path(github_repo_url)
    except ValueError as e:
        logger.error(f"Error getting repository URL: {e}")
        sys.exit(1)

    # Check/create worktree
    valid, error = validate_worktree(adw_id, state)
    if valid:
        logger.info(f"Using existing worktree for {adw_id}")
        worktree_path = state.get("worktree_path")
        backend_port = state.get("backend_port")
        frontend_port = state.get("frontend_port")
    else:
        backend_port, frontend_port = get_ports_for_adw(adw_id)
        if not (is_port_available(backend_port) and is_port_available(frontend_port)):
            backend_port, frontend_port = find_next_available_ports(adw_id)

        logger.info(f"Allocated ports - Backend: {backend_port}, Frontend: {frontend_port}")
        state.update(backend_port=backend_port, frontend_port=frontend_port)
        state.save("adw_ralph_iso")
        worktree_path = None

    # Fetch issue
    issue: GitHubIssue = fetch_issue(issue_number, repo_path)
    state.update(issue_number=issue_number)
    state.save("adw_ralph_iso")

    make_issue_comment(
        issue_number,
        format_issue_message(adw_id, "ops", "Starting fully automated ADW+Ralph workflow\n"
                           "Pipeline: Plan -> Build -> Test -> Review -> Ship -> Pull")
    )

    # Classify issue
    issue_command, error = classify_issue(issue, adw_id, logger)
    if error:
        logger.error(f"Error classifying issue: {error}")
        sys.exit(1)

    state.update(issue_class=issue_command)
    state.save("adw_ralph_iso")

    # Generate branch name
    branch_name, error = generate_branch_name(issue, issue_command, adw_id, logger)
    if error:
        logger.error(f"Error generating branch name: {error}")
        sys.exit(1)

    state.update(branch_name=branch_name)
    state.save("adw_ralph_iso")

    # Create worktree if needed
    if not valid:
        worktree_path, error = create_worktree(adw_id, branch_name, logger)
        if error:
            logger.error(f"Error creating worktree: {error}")
            sys.exit(1)

        state.update(worktree_path=worktree_path)
        state.save("adw_ralph_iso")
        setup_worktree_environment(worktree_path, backend_port, frontend_port, logger)

    make_issue_comment(
        issue_number,
        format_issue_message(adw_id, "ops", f"Worktree ready\n"
                           f"Branch: `{branch_name}`\n"
                           f"Ports: {backend_port}/{frontend_port}")
    )

    # Verify loop.sh
    success, error = copy_loop_script(worktree_path, logger)
    if not success:
        logger.error(error)
        sys.exit(1)

    # Generate spec from issue
    specs_dir = os.path.join(worktree_path, "specs")
    clear_specs_directory(specs_dir)
    spec_file, error = generate_spec_from_issue(issue, issue_command, worktree_path)
    if error:
        logger.error(f"Error generating spec: {error}")
        sys.exit(1)

    make_issue_comment(
        issue_number,
        format_issue_message(adw_id, "ops", f"Spec generated: `{spec_file}`")
    )

    # Remove existing plan for fresh planning
    plan_file = os.path.join(worktree_path, "IMPLEMENTATION_PLAN.md")
    if os.path.exists(plan_file):
        os.remove(plan_file)

    # === RALPH PLAN ===
    make_issue_comment(
        issue_number,
        format_issue_message(adw_id, "ralph", f"Starting planning phase ({plan_iterations} iterations)...")
    )

    success, error = run_ralph_phase("plan", worktree_path, plan_iterations, logger)
    if not success:
        logger.error(f"Ralph planning failed: {error}")
        sys.exit(1)

    if not os.path.exists(plan_file):
        logger.error("IMPLEMENTATION_PLAN.md was not created")
        sys.exit(1)

    state.update(plan_file="IMPLEMENTATION_PLAN.md")
    state.save("adw_ralph_iso")

    make_issue_comment(
        issue_number,
        format_issue_message(adw_id, "ralph", "Planning complete")
    )

    # === BACKPRESSURE LOOP: BUILD -> TEST -> (re-plan + re-build if fail) ===
    all_tests_passed = False
    test_results = []
    backpressure_loop = 0

    while True:
        backpressure_loop += 1
        loop_label = f"loop {backpressure_loop}" if MAX_BACKPRESSURE_LOOPS == 0 else f"loop {backpressure_loop}/{MAX_BACKPRESSURE_LOOPS}"

        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, "ralph", f"Building ({loop_label})...")
        )

        success, error = run_ralph_phase("build", worktree_path, build_iterations, logger)
        if not success:
            logger.warning(f"Ralph build had issues: {error}")

        commit_msg = f"feat: implement #{issue_number} (build loop {backpressure_loop})\n\nADW ID: {adw_id}"
        commit_changes(commit_msg, cwd=worktree_path)

        if skip_tests:
            logger.info("Skipping tests (--skip-tests)")
            all_tests_passed = True
            break

        test_results, passed, failed = run_tests(adw_id, logger, worktree_path)
        all_tests_passed = failed == 0

        if all_tests_passed:
            make_issue_comment(
                issue_number,
                format_issue_message(adw_id, AGENT_TESTER, f"All {passed} tests passed!")
            )
            break

        # Check if we've hit the max (0 = unlimited)
        if MAX_BACKPRESSURE_LOOPS != 0 and backpressure_loop >= MAX_BACKPRESSURE_LOOPS:
            make_issue_comment(
                issue_number,
                format_issue_message(adw_id, "ops", f"Reached max backpressure loops ({MAX_BACKPRESSURE_LOOPS}). Moving on with failures.")
            )
            break

        # Format test failure details for the re-planning phase
        failed_tests = [t for t in test_results if not t.passed]
        failure_summary = "\n".join(
            f"- **{t.test_name}**: {t.error or 'unknown error'}" for t in failed_tests
        )

        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, "ops",
                f"Tests failed ({failed} failures). Re-planning to fix:\n\n{failure_summary}\n\n"
                "Running plan phase to address failures, then re-building...")
        )

        # Write test failures to a file so the plan phase can see them
        failures_file = os.path.join(worktree_path, "TEST_FAILURES.md")
        with open(failures_file, "w") as f:
            f.write(f"# Test Failures (Backpressure Loop {backpressure_loop})\n\n")
            f.write(f"The following {failed} test(s) failed and need to be fixed:\n\n")
            for t in failed_tests:
                f.write(f"## {t.test_name}\n")
                f.write(f"- **Command**: `{t.execution_command}`\n")
                f.write(f"- **Purpose**: {t.test_purpose}\n")
                f.write(f"- **Error**: {t.error or 'unknown'}\n\n")

        # Re-run plan phase to address failures
        success, error = run_ralph_phase("plan", worktree_path, plan_iterations, logger)
        if not success:
            logger.warning(f"Ralph re-planning had issues: {error}")

        # Clean up failures file after planning
        if os.path.exists(failures_file):
            os.remove(failures_file)

    # === REVIEW WITH SCREENSHOTS ===
    if not skip_review:
        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, AGENT_REVIEWER, "Running code review...")
        )

        spec_file_for_review = find_spec_file(state, logger)
        review_result = None

        if spec_file_for_review:
            review_result = run_review(spec_file_for_review, adw_id, logger, worktree_path)
        else:
            logger.warning("Could not find spec file for review")
            review_result = ReviewResult(
                success=True,
                review_summary="No spec file found for detailed review",
                review_issues=[],
                screenshots=[],
                screenshot_urls=[],
            )

        # Capture screenshots LAST (after review is complete, showing final state)
        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, AGENT_REVIEWER, "Capturing final screenshots...")
        )

        # Get port from worktree's .ports.env or use default
        ports_env = os.path.join(worktree_path, ".ports.env")
        port = "5173"
        if os.path.exists(ports_env):
            with open(ports_env) as f:
                for line in f:
                    if line.startswith("FRONTEND_PORT="):
                        port = line.strip().split("=")[1]
                        break
        logger.info(f"Using port {port} for screenshots")

        screenshots = capture_screenshots(adw_id, port, worktree_path, logger)
        logger.info(f"Captured {len(screenshots)} screenshots")

        # Add screenshots to the review result
        if screenshots:
            review_result.screenshots = screenshots

        # Upload screenshots to R2
        upload_screenshots(review_result, adw_id, worktree_path, logger)

        # Post review with screenshots
        review_comment = build_review_comment(review_result)
        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, AGENT_REVIEWER, review_comment)
        )

    # === FINALIZE: PUSH AND CREATE PR ===
    make_issue_comment(
        issue_number,
        format_issue_message(adw_id, "ops", "Pushing changes and creating PR...")
    )

    finalize_git_operations(state, logger, cwd=worktree_path)

    # === SHIP: MERGE TO MAIN ===
    make_issue_comment(
        issue_number,
        format_issue_message(adw_id, "ops", "Shipping: merging to main...")
    )

    success, error = merge_to_main(branch_name, logger)
    if success:
        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, "ops", "**Merged to main!**\n\n"
                               "Your localhost should hot-reload with the changes.\n"
                               "If not, the changes are now on your local `main` branch.")
        )
    else:
        make_issue_comment(
            issue_number,
            format_issue_message(adw_id, "ops", f"Could not auto-merge: {error}\n"
                               "PR has been created for manual review.")
        )

    # === COMPLETE ===
    make_issue_comment(
        issue_number,
        format_issue_message(adw_id, "ops",
                           f"**ADW+Ralph workflow completed!**\n\n"
                           f"- Branch: `{branch_name}`\n"
                           f"- Plan: `IMPLEMENTATION_PLAN.md`\n"
                           f"- Spec: `{spec_file}`\n"
                           f"- Tests: {'Passed' if all_tests_passed else 'Some failures'}\n"
                           f"- Shipped: {'Yes' if success else 'PR created'}")
    )

    state.save("adw_ralph_iso")

    print(f"\n{'='*60}")
    print(f"  ADW+RALPH WORKFLOW COMPLETED")
    print(f"{'='*60}")
    print(f"  ADW ID: {adw_id}")
    print(f"  Issue:  #{issue_number}")
    print(f"  Branch: {branch_name}")
    print(f"  Plan iterations:  {plan_iterations}")
    print(f"  Build iterations: {build_iterations}")
    print(f"  Merged: {'Yes' if success else 'No (PR created)'}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
